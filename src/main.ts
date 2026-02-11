import { Notice, Plugin, TFile } from 'obsidian';
import { ObLLMSettings, DEFAULT_SETTINGS } from './settings';
import { ObLLMSettingTab } from './settings-tab';
import { VaultScanner } from './scanner/vault-scanner';
import { Chunker } from './scanner/chunker';
import { getFileReader } from './scanner/file-reader';
import { IndexStore } from './retrieval/index-store';
import { VectorDB } from './storage/db';
import { KeywordRetriever } from './retrieval/keyword-retriever';
import { EmbeddingRetriever } from './retrieval/embedding-retriever';
import { HybridRetriever } from './retrieval/hybrid-retriever';
import type { Retriever, ScoredChunk } from './retrieval/retriever';
import { UnifiedProvider } from './llm/unified-provider';
import type { LLMProvider } from './llm/provider';
import { PromptBuilder } from './prompt/prompt-builder';
import { CitationLinker } from './prompt/citation-linker';
import { SuggestedQuestions } from './prompt/suggested-questions';
import { ChatModal } from './ui/chat-modal';
import { StatusBarManager } from './ui/status-bar';
import { AudioOverview } from './audio/audio-overview';
import { createTTSEngine } from './audio/tts-engine';

export default class ObLLMPlugin extends Plugin {
	settings!: ObLLMSettings;

	private scanner!: VaultScanner;
	private chunker!: Chunker;
	private db!: VectorDB;
	private indexStore!: IndexStore;
	private retriever!: Retriever;
	private llmProvider!: LLMProvider;
	private promptBuilder!: PromptBuilder;
	private citationLinker!: CitationLinker;
	private suggestedQuestions!: SuggestedQuestions;
	private statusBar!: StatusBarManager;

	async onload() {
		await this.loadSettings();

		this.scanner = new VaultScanner(this.app, this.settings);
		this.chunker = new Chunker({
			chunkSize: this.settings.chunkSize,
			chunkOverlap: this.settings.chunkOverlap,
		});

		this.db = new VectorDB(this.manifest.dir!);
		this.indexStore = new IndexStore(this.db);

		this.llmProvider = this.createLLMProvider();
		this.retriever = this.createRetriever();
		this.promptBuilder = new PromptBuilder();
		this.citationLinker = new CitationLinker();
		this.suggestedQuestions = new SuggestedQuestions(this.llmProvider);

		const statusBarEl = this.addStatusBarItem();
		this.statusBar = new StatusBarManager(statusBarEl);
		this.statusBar.showReady(this.indexStore.chunkCount);

		this.addSettingTab(new ObLLMSettingTab(this.app, this));

		// ── Commands ──

		this.addCommand({
			id: 'index-vault',
			name: 'Index vault',
			callback: () => this.indexVault(),
		});

		this.addCommand({
			id: 'ask-question',
			name: 'Ask a question',
			callback: () => this.openChat(),
		});

		this.addCommand({
			id: 'explain-note',
			name: 'Explain this note',
			callback: () => this.explainCurrentNote(),
		});

		this.addCommand({
			id: 'summarize-notes',
			name: 'Summarize notes',
			callback: () => this.generateDocument('summary'),
		});

		this.addCommand({
			id: 'generate-study-guide',
			name: 'Generate study guide',
			callback: () => this.generateDocument('study-guide'),
		});

		this.addCommand({
			id: 'generate-faq',
			name: 'Generate FAQ',
			callback: () => this.generateDocument('faq'),
		});

		this.addCommand({
			id: 'generate-briefing',
			name: 'Generate briefing doc',
			callback: () => this.generateDocument('briefing'),
		});

		this.addCommand({
			id: 'suggest-ideas',
			name: 'Suggest ideas & insights',
			callback: () => this.generateDocument('ideation'),
		});

		this.addCommand({
			id: 'combine-sources',
			name: 'Combine insights from multiple sources',
			callback: () => this.combineSources(),
		});

		this.addCommand({
			id: 'audio-overview',
			name: 'Generate audio overview',
			callback: () => this.generateAudioOverview(),
		});

		// ── File watchers ──

		this.registerEvent(
			this.app.vault.on('modify', (file) => {
				if (file instanceof TFile) {
					this.onFileChanged(file.path, file.extension);
				}
			})
		);

		this.registerEvent(
			this.app.vault.on('delete', (file) => {
				this.indexStore.removeChunksForFile(file.path);
			})
		);
	}

	onunload() {
		if (this.db) this.db.close();
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
		this.llmProvider = this.createLLMProvider();
		this.retriever = this.createRetriever();
		this.suggestedQuestions = new SuggestedQuestions(this.llmProvider);
		this.chunker = new Chunker({
			chunkSize: this.settings.chunkSize,
			chunkOverlap: this.settings.chunkOverlap,
		});
	}

	// ── Factory methods ──

	private createLLMProvider(): LLMProvider {
		return new UnifiedProvider(this.settings);
	}

	private createRetriever(): Retriever {
		const keyword = new KeywordRetriever(this.indexStore);

		if (this.settings.retrievalMethod === 'keyword') {
			return keyword;
		}

		const embedding = new EmbeddingRetriever(this.db, this.llmProvider);

		if (this.settings.retrievalMethod === 'embedding') {
			return embedding;
		}

		return new HybridRetriever(keyword, embedding);
	}

	// ── Incremental indexing ──

	private async onFileChanged(path: string, extension: string) {
		const ext = '.' + extension;
		if (!this.settings.supportedExtensions.includes(ext)) return;

		try {
			const reader = getFileReader(extension);
			let content: string | ArrayBuffer;
			if (extension === 'pdf') {
				content = await this.scanner.readFileBinary(path);
			} else {
				content = await this.scanner.readFileContent(path);
			}
			const result = await reader.read(content);
			const chunks = this.chunker.chunk(result.text, path, result.headings);
			this.indexStore.addChunks(chunks, path, Date.now());
			this.statusBar.showReady(this.indexStore.chunkCount);
		} catch (err: any) {
			console.error(`ObLLM: Failed to re-index ${path}:`, err);
		}
	}

	// ── Vault indexing ──

	private async indexVault() {
		const files = this.scanner.getFiles();
		new Notice(`ObLLM: Indexing ${files.length} files...`);

		let processed = 0;
		for (const fileInfo of files) {
			const existingTs = this.indexStore.getFileTimestamp(fileInfo.path);
			if (existingTs && existingTs >= fileInfo.mtime) {
				processed++;
				continue;
			}

			try {
				const reader = getFileReader(fileInfo.extension);
				let content: string | ArrayBuffer;
				if (fileInfo.extension === 'pdf') {
					content = await this.scanner.readFileBinary(fileInfo.path);
				} else {
					content = await this.scanner.readFileContent(fileInfo.path);
				}
				const result = await reader.read(content);
				const chunks = this.chunker.chunk(result.text, fileInfo.path, result.headings);
				this.indexStore.addChunks(chunks, fileInfo.path, fileInfo.mtime);
				processed++;
				this.statusBar.showIndexing(processed, files.length);
			} catch (err: any) {
				console.error(`ObLLM: Failed to index ${fileInfo.path}:`, err);
			}
		}

		this.statusBar.showReady(this.indexStore.chunkCount);
		new Notice(`ObLLM: Indexed ${processed} files (${this.indexStore.chunkCount} chunks)`);
	}

	// ── Chat ──

	private openChat() {
		const allSources = [...new Set(this.indexStore.getAllChunks().map((c) => c.source))];

		const modal = new ChatModal(this.app, {
			onSubmit: async (query: string, sourceFilter?: string[]) => {
				const chunks = await this.retriever.search(query, this.settings.maxChunks);
				const filtered = sourceFilter
					? chunks.filter((sc) => sourceFilter.includes(sc.chunk.source))
					: chunks;

				if (filtered.length === 0) {
					modal.setResponse('No relevant notes found. Try indexing your vault first.');
					return;
				}

				const prompt = this.promptBuilder.buildPrompt('qa', query, filtered);
				const response = await this.llmProvider.generate({
					prompt,
					stream: true,
					onToken: (token) => modal.appendToken(token),
				});

				const withCitations = this.citationLinker.linkCitations(response, filtered);
				modal.setResponse(withCitations);
			},
			onSuggestQuestions: async () => {
				const chunks = this.indexStore.getAllChunks();
				if (chunks.length === 0) return [];
				const scored: ScoredChunk[] = chunks
					.slice(0, 20)
					.map((c) => ({ chunk: c, score: 1 }));
				return this.suggestedQuestions.generate(scored);
			},
			sources: allSources,
		});

		modal.open();
	}

	// ── Explain current note ──

	private async explainCurrentNote() {
		const activeFile = this.app.workspace.getActiveFile();
		if (!activeFile) {
			new Notice('ObLLM: No active file to explain.');
			return;
		}

		const content = await this.app.vault.cachedRead(activeFile);
		const chunks = this.chunker.chunk(content, activeFile.path);
		const scored: ScoredChunk[] = chunks.map((c) => ({ chunk: c, score: 1 }));

		const prompt = this.promptBuilder.buildPrompt('explain', '', scored);

		const modal = new ChatModal(this.app, {
			onSubmit: async (query: string) => {
				const followUpChunks = await this.retriever.search(query, this.settings.maxChunks);
				const allChunks = [...scored, ...followUpChunks];
				const followUpPrompt = this.promptBuilder.buildPrompt('qa', query, allChunks);

				const response = await this.llmProvider.generate({
					prompt: followUpPrompt,
					stream: true,
					onToken: (token) => modal.appendToken(token),
				});
				const withCitations = this.citationLinker.linkCitations(response, allChunks);
				modal.setResponse(withCitations);
			},
			onSuggestQuestions: async () => {
				return this.suggestedQuestions.generate(scored);
			},
			sources: [activeFile.path],
		});

		modal.open();

		// Stream initial explanation
		new Notice(`ObLLM: Explaining ${activeFile.basename}...`);
		const response = await this.llmProvider.generate({
			prompt,
			stream: true,
			onToken: (token) => modal.appendToken(token),
		});
		const withCitations = this.citationLinker.linkCitations(response, scored);
		modal.setResponse(withCitations);
	}

	// ── Document generation (summary, study guide, FAQ, briefing, ideation) ──

	private async generateDocument(template: 'summary' | 'study-guide' | 'faq' | 'briefing' | 'ideation') {
		const chunks = this.indexStore.getAllChunks();
		if (chunks.length === 0) {
			new Notice('ObLLM: No indexed notes. Run "Index vault" first.');
			return;
		}

		const scored: ScoredChunk[] = chunks
			.slice(0, this.settings.maxChunks)
			.map((c) => ({ chunk: c, score: 1 }));

		const labels: Record<string, string> = {
			'summary': 'Summary',
			'study-guide': 'Study Guide',
			'faq': 'FAQ',
			'briefing': 'Briefing',
			'ideation': 'Ideas & Insights',
		};

		const label = labels[template];
		new Notice(`ObLLM: Generating ${label}...`);

		const prompt = this.promptBuilder.buildPrompt(template, '', scored);
		const response = await this.llmProvider.generate({ prompt });
		const withCitations = this.citationLinker.linkCitations(response, scored);

		const file = await this.app.vault.create(
			`ObLLM ${label} - ${new Date().toISOString().slice(0, 10)}.md`,
			withCitations
		);
		const leaf = this.app.workspace.getLeaf(false);
		await leaf.openFile(file);
		new Notice(`ObLLM: ${label} created!`);
	}

	// ── Multi-source combine ──

	private async combineSources() {
		const chunks = this.indexStore.getAllChunks();
		if (chunks.length === 0) {
			new Notice('ObLLM: No indexed notes. Run "Index vault" first.');
			return;
		}

		const sourceFiles = [...new Set(chunks.map((c) => c.source))];
		const scored: ScoredChunk[] = chunks
			.slice(0, this.settings.maxChunks * 2)
			.map((c) => ({ chunk: c, score: 1 }));

		const prompt = [
			'You are a research assistant.',
			`Analyze the following notes from ${sourceFiles.length} different sources.`,
			'Identify recurring themes, connections, contradictions, and key insights.',
			'Organize your response with clear headings and cite sources using [number].',
			'',
			'Sources:',
			this.promptBuilder.formatContext(scored),
		].join('\n');

		new Notice('ObLLM: Analyzing sources...');
		const response = await this.llmProvider.generate({ prompt });
		const withCitations = this.citationLinker.linkCitations(response, scored);

		const file = await this.app.vault.create(
			`ObLLM Insights - ${new Date().toISOString().slice(0, 10)}.md`,
			withCitations
		);
		const leaf = this.app.workspace.getLeaf(false);
		await leaf.openFile(file);
		new Notice('ObLLM: Multi-source analysis complete!');
	}

	// ── Audio Overview ──

	private async generateAudioOverview() {
		const chunks = this.indexStore.getAllChunks();
		if (chunks.length === 0) {
			new Notice('ObLLM: No indexed notes. Run "Index vault" first.');
			return;
		}

		const scored: ScoredChunk[] = chunks
			.slice(0, this.settings.maxChunks)
			.map((c) => ({ chunk: c, score: 1 }));

		const ttsEngine = createTTSEngine(
			this.settings.ttsProvider,
			this.settings.apiKey,
			this.settings.ttsVoice,
			this.settings.ttsSpeed
		);

		const overview = new AudioOverview(this.llmProvider, ttsEngine);

		try {
			const script = await overview.generate(scored, (status) => {
				new Notice(`ObLLM: ${status}`);
			});

			// Save the script as a note
			const file = await this.app.vault.create(
				`ObLLM Audio Script - ${new Date().toISOString().slice(0, 10)}.md`,
				script
			);
			const leaf = this.app.workspace.getLeaf(false);
			await leaf.openFile(file);
			new Notice('ObLLM: Audio overview complete!');
		} catch (err: any) {
			new Notice(`ObLLM: Audio error — ${err.message}`);
		}
	}
}
