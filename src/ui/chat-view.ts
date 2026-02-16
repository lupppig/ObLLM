import { ItemView, WorkspaceLeaf, MarkdownRenderer, TFile, Notice, setIcon } from 'obsidian';
import { ConversationHistory } from './conversation';
import type { ScoredChunk } from '../retrieval/retriever';

export const VIEW_TYPE_OBLLM = "obllm-chat-view";

export class ChatView extends ItemView {
	private messagesEl!: HTMLDivElement;
	private inputEl!: HTMLTextAreaElement;
	private loaderEl!: HTMLDivElement;
	private conversation: ConversationHistory;
	private isGenerating = false;
	private currentStreamEl: HTMLDivElement | null = null;
	private currentStreamText = '';
	private currentChunks: ScoredChunk[] = [];
	private statusFooterEl!: HTMLDivElement;
	private versionTagEl!: HTMLSpanElement;
	private stopBtnEl!: HTMLButtonElement;

	// Callback props from plugin
	public onSubmit?: (query: string, history: ConversationHistory) => Promise<void>;
	public onCancel?: () => void;
	public onSuggestQuestions?: () => Promise<string[]>;
	public onCheckHealth?: () => Promise<{ ok: boolean; message: string }>;

	constructor(leaf: WorkspaceLeaf) {
		super(leaf);
		this.conversation = new ConversationHistory();
	}

	getViewType() {
		return VIEW_TYPE_OBLLM;
	}

	getDisplayText() {
		return "ObLLM Chat";
	}

	getIcon(): string {
		return "brain";
	}

	async onOpen() {
		const container = this.contentEl;
		container.empty();
		container.addClass('obllm-chat-view-container');

		const header = container.createDiv({ cls: 'obllm-view-header' });
		header.createEl('h4', { text: 'ObLLM Agent' });
		this.versionTagEl = header.createSpan({ cls: 'obllm-view-version', text: `v0.1.11-SECURE (${new Date().toLocaleTimeString()})` });

		const clearBtn = header.createEl('button', {
			cls: 'obllm-clear-btn clickable-icon',
			attr: { 'aria-label': 'Clear chat' }
		});
		clearBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-trash-2"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></svg>';
		clearBtn.addEventListener('click', () => {
			this.conversation.clear();
			this.resetGenerating();
			this.renderMessages();
		});

		const resetBtn = header.createEl('button', {
			cls: 'obllm-reset-btn clickable-icon',
			attr: { 'aria-label': 'Force reset agent state' }
		});
		setIcon(resetBtn, 'refresh-ccw');
		resetBtn.addEventListener('click', () => {
			this.resetGenerating();
			new Notice('ObLLM: Agent state reset.');
		});

		const healthBtn = header.createEl('button', {
			cls: 'obllm-health-btn clickable-icon',
			attr: { 'aria-label': 'Check provider health' }
		});
		setIcon(healthBtn, 'stethoscope');
		healthBtn.addEventListener('click', async () => {
			this.setStatus('Checking provider...');
			if (this.onCheckHealth) {
				const result = await this.onCheckHealth();
				if (result.ok) {
					new Notice(`ObLLM: ${result.message}`);
					this.setStatus('Provider OK');
				} else {
					new Notice(`ObLLM Error: ${result.message}`, 10000);
					this.setStatus('Provider Offline');
				}
			}
		});

		this.stopBtnEl = header.createEl('button', {
			cls: 'obllm-stop-btn clickable-icon',
			attr: { 'aria-label': 'Stop generation' }
		});
		setIcon(this.stopBtnEl, 'square');
		this.stopBtnEl.hide();
		this.stopBtnEl.addEventListener('click', () => {
			if (this.onCancel) this.onCancel();
			this.resetGenerating();
		});

		this.messagesEl = container.createDiv({ cls: 'obllm-chat-messages' });

		this.loaderEl = container.createDiv({ cls: 'obllm-loader', text: 'Thinking...' });
		this.loaderEl.hide();

		const inputContainer = container.createDiv({ cls: 'obllm-chat-input-wrapper' });
		this.inputEl = inputContainer.createEl('textarea', {
			cls: 'obllm-chat-input',
			attr: { placeholder: 'Ask your AI agent...', rows: '1' }
		});

		this.inputEl.addEventListener('keydown', (e: KeyboardEvent) => {
			if (e.key === 'Enter' && !e.shiftKey) {
				e.preventDefault();
				this.submit();
			}
		});

		this.statusFooterEl = container.createDiv({ cls: 'obllm-status-footer', text: 'Ready' });

		this.renderMessages();
	}

	private renderMessages() {
		this.messagesEl.empty();
		if (this.conversation.length === 0) {
			this.addSystemMessage("I'm your AI agent. I can help you research your notes, answer general questions, or even help you write new content.");
			return;
		}

		for (const msg of this.conversation.getMessages()) {
			if (msg.role === 'user') {
				this.addUserMessage(msg.content);
			} else {
				this.addAssistantMessage(msg.content);
			}
		}
	}

	private async submit() {
		const query = this.inputEl.value.trim();
		if (!query || this.isGenerating) return;

		this.isGenerating = true;
		this.inputEl.value = '';
		this.inputEl.rows = 1;

		this.addUserMessage(query);
		this.conversation.add('user', query);

		this.loaderEl.show();
		this.stopBtnEl.show();
		this.scrollToBottom();

		// Create assistant message placeholder
		this.currentStreamEl = this.addAssistantPlaceholder();
		this.currentStreamText = '';

		try {
			if (this.onSubmit) {
				await this.onSubmit(query, this.conversation);
				this.conversation.add('assistant', this.currentStreamText);
			}
		} catch (err: any) {
			if (this.currentStreamEl) {
				this.currentStreamEl.setText(`Error: ${err.message}`);
			} else {
				this.addSystemMessage(`Error: ${err.message}`);
			}
		} finally {
			this.isGenerating = false;
			this.loaderEl.hide();
			// Don't null it yet, finishResponse might still be processing
		}
	}

	public appendToken(token: string) {
		this.loaderEl.hide(); // Hide loader as soon as first token arrives
		this.currentStreamText += token;
		if (this.currentStreamEl) {
			this.currentStreamEl.textContent = this.currentStreamText;
			this.scrollToBottom();
		}
	}

	public finishResponse(markdown: string, chunks: ScoredChunk[]) {
		this.loaderEl.hide(); // Ensure loader is hidden
		this.currentChunks = chunks;
		if (this.currentStreamEl) {
			this.currentStreamEl.empty();
			MarkdownRenderer.render(this.app, markdown, this.currentStreamEl, '', this as any).then(() => {
				this.attachCitationListeners(this.currentStreamEl!);
				this.currentStreamEl = null; // Finally clear it
			});
			this.scrollToBottom();
		}
	}


	private attachCitationListeners(container: HTMLElement) {
		const citations = container.querySelectorAll('.obllm-citation');
		citations.forEach((el) => {
			el.addEventListener('click', (e) => {
				const idx = parseInt((el as HTMLElement).dataset.chunkIndex || '-1');
				if (idx >= 0 && this.currentChunks[idx]) {
					this.showSourceCard(this.currentChunks[idx], el as HTMLElement);
				}
			});
		});
	}

	private showSourceCard(scored: ScoredChunk, target: HTMLElement) {
		const chunk = scored.chunk;
		const card = this.contentEl.createDiv({ cls: 'obllm-source-card' });

		const header = card.createDiv({ cls: 'obllm-source-card-header' });
		header.createSpan({ text: chunk.source, cls: 'obllm-source-title' });

		const closeBtn = header.createEl('button', { cls: 'obllm-source-close clickable-icon' });
		setIcon(closeBtn, 'x');
		closeBtn.addEventListener('click', () => card.remove());

		const content = card.createDiv({ cls: 'obllm-source-card-content' });
		MarkdownRenderer.render(this.app, chunk.text, content, '', this as any);

		// Postion card near citation or as a modal overlay? 
		// For sidebar, an overlay or a fixed block at bottom is better.
		// Let's go with a centered overlay for now.
	}

	public addActionButton(text: string, onClick: () => void) {
		if (!this.currentStreamEl) return;
		const parent = this.currentStreamEl.parentElement;
		if (!parent) return;

		const btnContainer = parent.createDiv({ cls: 'obllm-chat-actions' });
		const btn = btnContainer.createEl('button', {
			cls: 'obllm-action-btn',
			text: text
		});
		btn.addEventListener('click', () => {
			onClick();
			btn.disabled = true;
			btn.addClass('is-done');
		});
	}

	public addNoteSuggestion(title: string, content: string, onSave: (title: string, content: string) => void) {
		const card = this.messagesEl.createDiv({ cls: 'obllm-note-card' });

		const header = card.createDiv({ cls: 'obllm-note-card-header' });
		setIcon(header, 'file-plus');
		header.createSpan({ cls: 'obllm-note-card-title', text: title });

		const actions = card.createDiv({ cls: 'obllm-note-card-actions' });

		const previewBtn = actions.createEl('button', { cls: 'obllm-note-action-btn' });
		setIcon(previewBtn, 'eye');
		previewBtn.createSpan({ text: 'Preview' });
		previewBtn.addEventListener('click', () => {
			this.showSourceCard({ chunk: { text: content, source: title } } as any, previewBtn);
		});

		const saveBtn = actions.createEl('button', { cls: 'obllm-note-action-btn is-primary' });
		setIcon(saveBtn, 'save');
		saveBtn.createSpan({ text: 'Save' });
		saveBtn.addEventListener('click', () => {
			onSave(title, content);
			saveBtn.disabled = true;
			saveBtn.setText('Saved');
			setIcon(saveBtn, 'check');
			saveBtn.removeClass('is-primary');
		});

		this.scrollToBottom();
	}

	public addAudioGenerationCard() {
		const card = this.messagesEl.createDiv({ cls: 'obllm-audio-card' });
		const cardHeader = card.createDiv({ cls: 'obllm-audio-card-header' });
		cardHeader.createSpan({ text: 'Audio Deep Dive' });
		const micIcon = cardHeader.createDiv({ cls: 'obllm-blinking-mic' });
		setIcon(micIcon, 'mic');

		const stepsContainer = card.createDiv({ cls: 'obllm-audio-card-steps' });

		const createStep = (id: string, text: string, icon: string) => {
			const step = stepsContainer.createDiv({ cls: 'obllm-audio-step', attr: { 'data-step-id': id } });
			const iconEl = step.createDiv({ cls: 'obllm-step-icon' });
			setIcon(iconEl, icon);
			step.createSpan({ text });
			return step;
		};

		createStep('script', 'Drafting Narrative Script', 'pencil');
		createStep('synth', 'Synthesizing Voice', 'mic');
		createStep('play', 'Ready for Playback', 'play-circle');

		this.scrollToBottom();
		return card;
	}

	public updateAudioStep(card: HTMLDivElement, stepId: string, status: 'active' | 'done' | 'error') {
		const steps = card.querySelectorAll('.obllm-audio-step');
		steps.forEach((stepEl) => {
			const el = stepEl as HTMLDivElement;
			if (el.dataset.stepId === stepId) {
				el.removeClass('is-active', 'is-done', 'is-error');
				if (status === 'active') {
					el.addClass('is-active');
					const iconEl = el.querySelector('.obllm-step-icon');
					if (iconEl) {
						iconEl.empty();
						iconEl.createDiv({ cls: 'obllm-audio-pulse' });
					}
				} else if (status === 'done') {
					el.addClass('is-done');
					const iconEl = el.querySelector('.obllm-step-icon');
					if (iconEl) {
						iconEl.empty();
						setIcon(iconEl as HTMLElement, 'check-circle');
					}
				}
			} else if (status === 'active') {
				// If one is active, others that are not 'done' should be dimmed (default)
			}
		});
	}

	private addUserMessage(text: string) {
		const msg = this.messagesEl.createDiv({ cls: 'obllm-chat-msg obllm-chat-msg-user' });
		msg.createDiv({ cls: 'obllm-chat-msg-content', text });
		this.scrollToBottom();
	}

	private addAssistantPlaceholder(): HTMLDivElement {
		const msg = this.messagesEl.createDiv({ cls: 'obllm-chat-msg obllm-chat-msg-assistant' });
		const content = msg.createDiv({ cls: 'obllm-chat-msg-content' });
		return content;
	}

	private addAssistantMessage(text: string) {
		const msg = this.messagesEl.createDiv({ cls: 'obllm-chat-msg obllm-chat-msg-assistant' });
		const content = msg.createDiv({ cls: 'obllm-chat-msg-content' });
		MarkdownRenderer.render(this.app, text, content, '', this as any);
		this.scrollToBottom();
	}

	private addSystemMessage(text: string) {
		const msg = this.messagesEl.createDiv({ cls: 'obllm-chat-msg obllm-chat-msg-system' });
		msg.setText(text);
	}

	private setStreamContent(markdown: string) {
		if (this.currentStreamEl) {
			this.currentStreamEl.empty();
			MarkdownRenderer.render(this.app, markdown, this.currentStreamEl, '', this as any);
			this.scrollToBottom();
		}
	}

	public setLoaderText(text: string) {
		this.loaderEl.setText(text);
		this.loaderEl.show();
	}

	private scrollToBottom() {
		this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
	}

	public resetGenerating() {
		this.isGenerating = false;
		this.loaderEl.hide();
		this.stopBtnEl.hide();
		this.currentStreamEl = null;
		this.currentStreamText = '';
		this.setStatus('Reset');
	}

	public setStatus(text: string) {
		if (this.statusFooterEl) {
			this.statusFooterEl.setText(`Trace: ${text}`);
		}
	}

	async onClose() {
		// Nothing to clean up
	}
}
