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
import { ChatModal } from './ui/chat-modal';
import { StatusBarManager } from './ui/status-bar';



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
	private statusBar!: StatusBarManager;

	async onload() {
		await this.loadSettings();

		this.scanner = new VaultScanner(this.app, this.settings);
		this.chunker = new Chunker({
			chunkSize: this.settings.chunkSize,
			chunkOverlap: this.settings.chunkOverlap,
		});

		const dbPath = `${this.manifest.dir}/obllm.db`;
		this.db = new VectorDB(dbPath);
		this.indexStore = new IndexStore(this.db);

		this.retriever = this.createRetriever();
		this.llmProvider = this.createLLMProvider();
		this.promptBuilder = new PromptBuilder();
		this.citationLinker = new CitationLinker();

		const statusBarEl = this.addStatusBarItem();
		this.statusBar = new StatusBarManager(statusBarEl);
		this.statusBar.showReady(this.indexStore.chunkCount);

		this.addSettingTab(new ObLLMSettingTab(this.app, this));

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
			id: 'summarize-notes',
			name: 'Summarize notes',
			callback: () => this.summarizeNotes(),
		});

		this.addCommand({
			id: 'combine-sources',
			name: 'Combine insights from multiple sources',
			callback: () => this.combineSources(),
		});

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
		this.chunker = new Chunker({
			chunkSize: this.settings.chunkSize,
			chunkOverlap: this.settings.chunkOverlap,
		});
	}

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
			await this.indexStore.save();
			this.statusBar.showReady(this.indexStore.chunkCount);
		} catch (err: any) {
			console.error(`ObLLM: Failed to re-index ${path}:`, err);
		}
	}

	private async indexVault() {
		if (!this.settings.apiKey) {
			new Notice('ObLLM: Please set your API key in settings first.');
			return;
		}

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

		await this.indexStore.save();
		this.statusBar.showReady(this.indexStore.chunkCount);
		new Notice(`ObLLM: Indexed ${processed} files (${this.indexStore.chunkCount} chunks)`);
	}

	private openChat() {
		if (!this.settings.apiKey) {
			new Notice('ObLLM: Please set your API key in settings first.');
			return;
		}

		const modal = new ChatModal(this.app, async (query: string) => {
			const chunks = await this.retriever.search(query, this.settings.maxChunks);
			if (chunks.length === 0) {
				modal.setResponse('No relevant notes found. Try indexing your vault first.');
				return;
			}

			const prompt = this.promptBuilder.buildPrompt('qa', query, chunks);
			const context = this.promptBuilder.formatContext(chunks);

			const response = await this.llmProvider.generate({
				prompt,
				stream: true,
				onToken: (token) => modal.appendToken(token),
			});

			const withCitations = this.citationLinker.linkCitations(response, chunks);
			modal.setResponse(withCitations);
		});

		modal.open();
	}

	private async summarizeNotes() {
		if (!this.settings.apiKey) {
			new Notice('ObLLM: Please set your API key in settings first.');
			return;
		}

		const chunks = this.indexStore.getAllChunks();
		if (chunks.length === 0) {
			new Notice('ObLLM: No indexed notes. Run "Index vault" first.');
			return;
		}

		const scoredChunks: ScoredChunk[] = chunks
			.slice(0, this.settings.maxChunks)
			.map((c) => ({ chunk: c, score: 1 }));

		const prompt = this.promptBuilder.buildPrompt('summary', '', scoredChunks);

		new Notice('ObLLM: Generating summary...');
		const response = await this.llmProvider.generate({ prompt });
		const withCitations = this.citationLinker.linkCitations(response, scoredChunks);

		const file = await this.app.vault.create(
			`ObLLM Summary - ${new Date().toISOString().slice(0, 10)}.md`,
			withCitations
		);
		const leaf = this.app.workspace.getLeaf(false);
		await leaf.openFile(file);
		new Notice('ObLLM: Summary created!');
	}

	private async combineSources() {
		if (!this.settings.apiKey) {
			new Notice('ObLLM: Please set your API key in settings first.');
			return;
		}

		const chunks = this.indexStore.getAllChunks();
		if (chunks.length === 0) {
			new Notice('ObLLM: No indexed notes. Run "Index vault" first.');
			return;
		}

		const sourceFiles = [...new Set(chunks.map((c) => c.source))];
		const scoredChunks: ScoredChunk[] = chunks
			.slice(0, this.settings.maxChunks * 2)
			.map((c) => ({ chunk: c, score: 1 }));

		const prompt = [
			'You are a research assistant.',
			`Analyze the following notes from ${sourceFiles.length} different sources.`,
			'Identify recurring themes, connections, contradictions, and key insights.',
			'Organize your response with clear headings and cite sources using [number].',
			'',
			'Sources:',
			this.promptBuilder.formatContext(scoredChunks),
		].join('\n');

		new Notice('ObLLM: Analyzing sources...');
		const response = await this.llmProvider.generate({ prompt });
		const withCitations = this.citationLinker.linkCitations(response, scoredChunks);

		const file = await this.app.vault.create(
			`ObLLM Insights - ${new Date().toISOString().slice(0, 10)}.md`,
			withCitations
		);
		const leaf = this.app.workspace.getLeaf(false);
		await leaf.openFile(file);
		new Notice('ObLLM: Multi-source analysis complete!');
	}
}
