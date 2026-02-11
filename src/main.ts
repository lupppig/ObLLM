import { FileSystemAdapter, Notice, Plugin, TFile } from 'obsidian';
import * as path from 'path';
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
import { ChatView, VIEW_TYPE_OBLLM } from './ui/chat-view';
import { ConversationHistory } from './ui/conversation';
import { StatusBarManager } from './ui/status-bar';
import { AudioOverview } from './audio/audio-overview';
import { createTTSEngine } from './audio/tts-engine';
import { WorkspaceLeaf } from 'obsidian';

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

		this.registerView(
			VIEW_TYPE_OBLLM,
			(leaf) => new ChatView(leaf)
		);

		this.scanner = new VaultScanner(this.app, this.settings);
		this.chunker = new Chunker({
			chunkSize: this.settings.chunkSize,
			chunkOverlap: this.settings.chunkOverlap,
		});

		const dbPath = path.join(this.manifest.dir!, 'obllm.db');
		const wasmPath = path.join(this.manifest.dir!, 'sqlite3.wasm');
		let initialData: Uint8Array | undefined;
		let wasmBinary: Uint8Array | undefined;

		try {
			if (await this.app.vault.adapter.exists(dbPath)) {
				const buffer = await this.app.vault.adapter.readBinary(dbPath);
				initialData = new Uint8Array(buffer);
			}

			if (await this.app.vault.adapter.exists(wasmPath)) {
				const buffer = await this.app.vault.adapter.readBinary(wasmPath);
				wasmBinary = new Uint8Array(buffer);
			}
		} catch (err) {
			console.error('ObLLM: Failed to load existing database or WASM:', err);
		}

		this.db = await VectorDB.create(768, initialData, wasmBinary);
		this.indexStore = new IndexStore(this.db);

		this.llmProvider = this.createLLMProvider();
		this.retriever = this.createRetriever();
		this.promptBuilder = new PromptBuilder();
		this.citationLinker = new CitationLinker();
		this.suggestedQuestions = new SuggestedQuestions(this.llmProvider);

		const statusBarEl = this.addStatusBarItem();
		this.statusBar = new StatusBarManager(statusBarEl);
		this.statusBar.showReady(this.indexStore.chunkCount);

		this.addRibbonIcon('brain', 'ObLLM Chat', () => {
			this.openChat();
		});

		this.addSettingTab(new ObLLMSettingTab(this.app, this));

		// ── Commands ──

		this.addCommand({
			id: 'show-debug-info',
			name: 'Show debug info',
			callback: () => {
				const adapter = this.app.vault.adapter as any;
				console.log('ObLLM: Debug Info', {
					vaultName: this.app.vault.getName(),
					vaultPath: adapter.getBasePath ? adapter.getBasePath() : 'unknown',
					settings: this.settings,
					chunks: this.indexStore.chunkCount,
					dbReady: !!this.db,
					manifest: this.manifest,
				});
				new Notice('ObLLM: Debug info logged to console (Ctrl+Shift+I)');
			}
		});

		this.addCommand({
			id: 'ask-question',
			name: 'Ask a question',
			callback: () => this.openChat(),
		});

		this.addCommand({
			id: 'index-vault',
			name: 'Index vault',
			callback: () => this.indexVault(),
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

		// Trigger initial indexing when workspace is ready
		this.app.workspace.onLayoutReady(() => {
			this.indexVault();
		});
	}

	async onunload() {
		if (this.db) {
			await this.saveDatabase();
			this.db.close();
		}
	}

	async saveDatabase() {
		if (!this.db) return;
		try {
			const data = this.db.export();
			const dbPath = path.join(this.manifest.dir!, 'obllm.db');
			await this.app.vault.adapter.writeBinary(dbPath, data.buffer as ArrayBuffer);
		} catch (err) {
			console.error('ObLLM: Failed to save database:', err);
		}
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

	private async onFileChanged(filePath: string, extension: string) {
		const ext = '.' + extension;
		if (!this.settings.supportedExtensions.includes(ext)) return;

		try {
			const reader = getFileReader(extension);
			let content: string | ArrayBuffer;
			if (extension === 'pdf') {
				content = await this.scanner.readFileBinary(filePath);
			} else {
				content = await this.scanner.readFileContent(filePath);
			}
			const result = await reader.read(content);
			const chunks = this.chunker.chunk(result.text, filePath, result.headings);
			this.indexStore.addChunks(chunks, filePath, Date.now());
			await this.saveDatabase();
			this.statusBar.showReady(this.indexStore.chunkCount);
		} catch (err: any) {
			console.error(`ObLLM: Failed to re-index ${filePath}:`, err);
		}
	}

	// ── Vault indexing ──

	private async indexVault() {
		const files = this.scanner.getFiles();
		console.log('ObLLM: Indexing settings:', {
			supportedExtensions: this.settings.supportedExtensions,
			indexedFolders: this.settings.indexedFolders,
			excludedFolders: this.settings.excludedFolders,
		});
		console.log(`ObLLM: Found ${files.length} supported files in vault.`);
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

		await this.saveDatabase();
		this.statusBar.showReady(this.indexStore.chunkCount);
		new Notice(`ObLLM: Indexed ${processed} files (${this.indexStore.chunkCount} chunks)`);

		// Background embedding pass
		if (this.retriever instanceof EmbeddingRetriever) {
			this.retriever.ensureEmbeddings().catch(e => console.error('ObLLM: Background embedding error:', e));
		} else if (this.retriever instanceof HybridRetriever) {
			(this.retriever.embeddingRetriever as EmbeddingRetriever).ensureEmbeddings().catch(e => console.error('ObLLM: Background embedding error:', e));
		}
	}

	// ── Chat ──

	private async activateView() {
		const { workspace } = this.app;

		let leaf: WorkspaceLeaf | null = null;
		const leaves = workspace.getLeavesOfType(VIEW_TYPE_OBLLM);

		if (leaves.length > 0) {
			leaf = leaves[0];
		} else {
			leaf = workspace.getRightLeaf(false);
			await leaf!.setViewState({ type: VIEW_TYPE_OBLLM, active: true });
		}

		workspace.revealLeaf(leaf!);
		return leaf!.view as ChatView;
	}

	private async openChat() {
		const view = await this.activateView();

		view.onCheckHealth = async () => {
			return await this.llmProvider.checkHealth!();
		};

		view.onSuggestQuestions = async () => {
			const chunks = this.indexStore.getAllChunks();
			const scored: ScoredChunk[] = chunks.slice(0, 10).map(c => ({ chunk: c, score: 1 }));
			return await this.suggestedQuestions.generate(scored);
		};

		view.onSubmit = async (query: string, history: ConversationHistory) => {
			console.log('ObLLM: Chat submitted', { query });
			view.setStatus('Pre-flight check...');

			// 0. Pre-flight Provider Check
			if (this.llmProvider.checkHealth) {
				const health = await this.llmProvider.checkHealth();
				if (!health.ok) {
					console.error('ObLLM: Pre-flight health check failed:', health.message);
					view.setStatus('Provider Offline');
					new Notice(`ObLLM: Provider is unreachable. ${health.message}`, 10000);
					throw new Error(`Provider Offline: ${health.message}`);
				}
			}

			const lowerQuery = query.toLowerCase();

			const audioRegex = /\b(audio|podcast|speech|listen|voice|talk)\b/i;
			if (audioRegex.test(lowerQuery) || lowerQuery.includes('audio overview')) {
				console.log('ObLLM: Intent: Audio Overview');
				view.setStatus('Audio Intent Detected');
				const chunks = this.indexStore.getAllChunks();
				if (chunks.length > 0) {
					console.log('ObLLM: Found chunks for audio, starting generation');
					const scored: ScoredChunk[] = chunks.slice(0, 20).map(c => ({ chunk: c, score: 1 }));
					await this.generateAudioOverview(scored);
					return;
				} else {
					console.warn('ObLLM: No chunks found for audio');
					new Notice('ObLLM: No indexed notes found to create a podcast from.');
					return;
				}
			}

			// 2. Standard Agent Flow (General Chat + Research)
			console.log('ObLLM: Intent: Standard Agent Flow');
			this.setEmbeddingPause(true);
			await new Promise(resolve => setTimeout(resolve, 300)); // Grace period for Ollama to finish current chunk

			const superTimeout = setTimeout(() => {
				console.error('ObLLM: Super Timeout (60s) triggered in onSubmit');
				view.resetGenerating();
				new Notice('ObLLM: The agent took too long to respond. Force-resetting state.');
			}, 60000);

			try {
				let chunks: ScoredChunk[] = [];
				const isGreeting = lowerQuery.length < 10 && (lowerQuery.includes('hi') || lowerQuery.includes('hello') || lowerQuery.includes('hey'));

				if (!isGreeting) {
					console.log('ObLLM: Starting retrieval');
					view.setStatus('Searching notes...');
					view.setLoaderText('Searching your notes...');
					chunks = await this.retriever.search(query, this.settings.maxChunks);
					console.log('ObLLM: Retrieval complete', { chunkCount: chunks.length });
					view.setStatus(`Found ${chunks.length} chunks`);
				} else {
					console.log('ObLLM: Query is a greeting, bypassing retrieval');
					view.setStatus('Greeting - bypassing search');
				}

				view.setStatus('Building prompt...');
				view.setLoaderText('ObLLM is thinking...');
				const prompt = this.promptBuilder.buildConversationPrompt(query, chunks, history);
				console.log('ObLLM: Prompt built, length:', prompt.length);
				view.setStatus(`Prompt size: ${prompt.length} chars`);

				console.log('ObLLM: Calling LLMProvider.generate...');
				view.setStatus('Handover to AI SDK...');
				let fullResponse = '';
				await this.llmProvider.generate({
					prompt,
					stream: true,
					onToken: (token) => {
						if (!fullResponse) {
							console.log('ObLLM: First token actually received in main');
							view.setStatus('Receiving tokens...');
						}
						fullResponse += token;
						view.appendToken(token);
					},
					onError: (err: any) => {
						console.error('ObLLM: LLM Error caught in main:', err);
						view.setStatus(`Fatal Error: ${err.message}`);
						new Notice(`ObLLM Error: ${err.message}`);
					}
				});

				if (fullResponse.length === 0) {
					console.warn('ObLLM: AI finished but returned zero characters');
					view.setStatus('AI returned empty response');
				}
				console.log('ObLLM: LLM response finished');

				// Apply interactive citation linking
				console.log('ObLLM: Linking citations');
				view.setStatus('Linking citations...');
				const linkedResponse = this.citationLinker.linkCitations(fullResponse, chunks);
				view.finishResponse(linkedResponse, chunks);
				console.log('ObLLM: Response finished and rendered');
				view.setStatus('Done');

				// Detect note creation blocks (Agency)
				const noteRegex = /```note\nTitle: (.*)\nContent: ([\s\S]*?)```/g;
				let match;
				while ((match = noteRegex.exec(fullResponse)) !== null) {
					const title = match[1].trim();
					const content = match[2].trim();
					view.addActionButton(`Create Note: ${title}`, () => {
						this.createNoteFromAgent(title, content);
					});
				}
			} catch (err: any) {
				console.error('ObLLM: Primary onSubmit Error:', err);
				view.setStatus(`Error: ${err.message}`);
				new Notice(`ObLLM Error: ${err.message}`);
				view.finishResponse(`Error: ${err.message}`, []);
			} finally {
				clearTimeout(superTimeout);
				this.setEmbeddingPause(false);
				console.log('ObLLM: Chat flow finalized (finally block)');
			}
		};
	}

	private setEmbeddingPause(paused: boolean) {
		const r = this.retriever;
		if (r instanceof EmbeddingRetriever) {
			r.pauseBackgroundWork(paused);
		} else if (r instanceof HybridRetriever) {
			(r.embeddingRetriever as EmbeddingRetriever).pauseBackgroundWork(paused);
		}
	}

	public async createNoteFromAgent(title: string, content: string) {
		const fileName = `${title.replace(/[\\/:*?"<>|]/g, '')}.md`;
		try {
			const file = await this.app.vault.create(fileName, content);
			const leaf = this.app.workspace.getLeaf(false);
			await leaf.openFile(file);
			new Notice(`ObLLM: Created note "${title}"`);
		} catch (err: any) {
			new Notice(`Error creating note: ${err.message}`);
		}
	}

	// ── Explain current note ──

	private async explainCurrentNote() {
		const view = await this.activateView();
		const activeFile = this.app.workspace.getActiveFile();
		if (!activeFile) {
			new Notice('No active file to explain.');
			return;
		}

		const content = await this.app.vault.read(activeFile);
		const chunks = this.chunker.chunk(content, activeFile.path);
		const scored: ScoredChunk[] = chunks.map((c) => ({ chunk: c, score: 1 }));

		view.appendToken(`### Explaining: ${activeFile.basename}\n\n`);

		const prompt = this.promptBuilder.buildPrompt('qa', `Explain this note: ${activeFile.path}`, scored);

		await this.llmProvider.generate({
			prompt,
			stream: true,
			onToken: (token) => view.appendToken(token),
			onError: (err: any) => {
				console.error('ObLLM: LLM Error:', err);
				new Notice(`ObLLM Error: ${err.message}`);
			}
		});
	}

	// ── Document generation (summary, study guide, FAQ, briefing, ideation) ──

	private async generateDocument(template: 'summary' | 'study-guide' | 'faq' | 'briefing' | 'ideation') {
		const view = await this.activateView();
		const chunks = this.indexStore.getAllChunks();

		if (chunks.length === 0) {
			new Notice('ObLLM: No indexed notes found.');
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
		view.appendToken(`### Generating ${label}...\n\n`);

		const prompt = this.promptBuilder.buildPrompt(template, 'Generate based on my notes', scored);

		await this.llmProvider.generate({
			prompt,
			stream: true,
			onToken: (token) => view.appendToken(token),
			onError: (err: any) => {
				console.error('ObLLM: LLM Error:', err);
				new Notice(`ObLLM Error: ${err.message}`);
			}
		});
	}

	// ── Multi-source combine ──

	private async combineSources() {
		const view = await this.activateView();
		const chunks = this.indexStore.getAllChunks();
		if (chunks.length === 0) {
			new Notice('ObLLM: No indexed notes found.');
			return;
		}

		const sourceFiles = [...new Set(chunks.map((c) => c.source))];
		const scoredBase: ScoredChunk[] = chunks
			.slice(0, this.settings.maxChunks * 2)
			.map((c) => ({ chunk: c, score: 1 }));

		view.appendToken(`### Combining insights from ${sourceFiles.length} sources...\n\n`);

		const prompt = [
			'You are a research assistant.',
			`Analyze the following notes from ${sourceFiles.length} different sources.`,
			'Identify recurring themes, connections, contradictions, and key insights.',
			'Organize your response with clear headings.',
			'',
			'Sources:',
			this.promptBuilder.formatContext(scoredBase),
		].join('\n');

		await this.llmProvider.generate({
			prompt,
			stream: true,
			onToken: (token) => view.appendToken(token),
			onError: (err: any) => {
				console.error('ObLLM: LLM Error:', err);
			}
		});
	}

	// ── Audio Overview ──

	private async generateAudioOverview(providedChunks?: ScoredChunk[]) {
		const view = await this.activateView();

		let scored: ScoredChunk[];
		if (providedChunks) {
			scored = providedChunks;
		} else {
			const chunks = this.indexStore.getAllChunks();
			if (chunks.length === 0) {
				new Notice('ObLLM: No indexed notes found.');
				return;
			}
			scored = chunks.slice(0, this.settings.maxChunks).map((c) => ({ chunk: c, score: 1 }));
		}

		const ttsEngine = createTTSEngine(
			this.settings.ttsProvider,
			this.settings.apiKey,
			this.settings.ttsVoice,
			this.settings.ttsSpeed
		);

		const overview = new AudioOverview(this.llmProvider, ttsEngine);

		view.appendToken(`### Generating Audio Overview...\n\n`);

		try {
			await overview.generate(scored, (status) => {
				view.appendToken(`* ${status}\n`);
			});
			new Notice('ObLLM: Audio overview generation started!');
		} catch (err: any) {
			new Notice(`ObLLM: Audio error — ${err.message}`);
		}
	}
}

