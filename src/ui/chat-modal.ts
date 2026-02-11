import { App, Modal, MarkdownRenderer, TFile, TFolder } from 'obsidian';
import { ConversationHistory } from './conversation';

export interface ChatModalOptions {
	onSubmit: (query: string, sourceFilter?: string[]) => Promise<void>;
	onSuggestQuestions: () => Promise<string[]>;
	sources: string[];
}

export class ChatModal extends Modal {
	private messagesEl!: HTMLDivElement;
	private inputEl!: HTMLTextAreaElement;
	private suggestionsEl!: HTMLDivElement;
	private sourceListEl!: HTMLDivElement;
	private isStreaming = false;
	private options: ChatModalOptions;
	private selectedSources: Set<string> = new Set();
	private conversation: ConversationHistory;
	private currentStreamEl: HTMLDivElement | null = null;
	private currentStreamText = '';

	constructor(app: App, options: ChatModalOptions) {
		super(app);
		this.options = options;
		this.conversation = new ConversationHistory();
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.addClass('obllm-chat-modal');

		// Header
		contentEl.createEl('h2', { text: 'ObLLM — Research Assistant' });

		// Source selector
		const sourceSection = contentEl.createDiv({ cls: 'obllm-source-section' });
		const sourceHeader = sourceSection.createDiv({ cls: 'obllm-source-header' });
		sourceHeader.createEl('span', { text: 'Sources', cls: 'obllm-source-label' });
		const toggleAll = sourceHeader.createEl('button', {
			text: 'All',
			cls: 'obllm-source-toggle',
		});
		toggleAll.addEventListener('click', () => this.toggleAllSources());

		this.sourceListEl = sourceSection.createDiv({ cls: 'obllm-source-list' });
		this.renderSourcePills();

		// Messages area
		this.messagesEl = contentEl.createDiv({ cls: 'obllm-messages' });
		this.addSystemMessage('Ask a question and I\'ll answer using your notes. You can scope the search by selecting specific sources above.');

		// Suggested questions
		this.suggestionsEl = contentEl.createDiv({ cls: 'obllm-suggestions' });
		this.loadSuggestions();

		// Input area
		const inputContainer = contentEl.createDiv({ cls: 'obllm-input-container' });
		this.inputEl = inputContainer.createEl('textarea', {
			cls: 'obllm-input',
			attr: { placeholder: 'Ask a question...', rows: '2' },
		});

		this.inputEl.addEventListener('keydown', (e: KeyboardEvent) => {
			if (e.key === 'Enter' && !e.shiftKey) {
				e.preventDefault();
				this.submit();
			}
		});

		const btnContainer = inputContainer.createDiv({ cls: 'obllm-btn-container' });
		const submitBtn = btnContainer.createEl('button', {
			text: 'Ask',
			cls: 'obllm-submit-btn',
		});
		submitBtn.addEventListener('click', () => this.submit());
	}

	private renderSourcePills(): void {
		this.sourceListEl.empty();
		for (const source of this.options.sources) {
			const name = source.replace(/^.*\//, '').replace(/\.\w+$/, '');
			const pill = this.sourceListEl.createEl('button', {
				text: name,
				cls: 'obllm-source-pill' + (this.selectedSources.has(source) ? ' is-active' : ''),
				attr: { title: source },
			});
			pill.addEventListener('click', () => {
				if (this.selectedSources.has(source)) {
					this.selectedSources.delete(source);
					pill.removeClass('is-active');
				} else {
					this.selectedSources.add(source);
					pill.addClass('is-active');
				}
			});
		}
	}

	private toggleAllSources(): void {
		if (this.selectedSources.size === this.options.sources.length) {
			this.selectedSources.clear();
		} else {
			this.options.sources.forEach((s) => this.selectedSources.add(s));
		}
		this.renderSourcePills();
	}

	private async loadSuggestions(): Promise<void> {
		const questions = await this.options.onSuggestQuestions();
		this.suggestionsEl.empty();

		if (questions.length === 0) return;

		for (const question of questions) {
			const btn = this.suggestionsEl.createEl('button', {
				text: question,
				cls: 'obllm-suggestion-btn',
			});
			btn.addEventListener('click', () => {
				this.inputEl.value = question;
				this.submit();
			});
		}
	}

	private async submit(): Promise<void> {
		const query = this.inputEl.value.trim();
		if (!query || this.isStreaming) return;

		this.isStreaming = true;
		this.inputEl.value = '';
		this.suggestionsEl.empty();

		// Add user message
		this.addUserMessage(query);
		this.conversation.add('user', query);

		// Create assistant message placeholder
		this.currentStreamEl = this.addAssistantMessage('');
		this.currentStreamText = '';

		const filter = this.selectedSources.size > 0
			? [...this.selectedSources]
			: undefined;

		try {
			await this.options.onSubmit(query, filter);
			this.conversation.add('assistant', this.currentStreamText);
		} catch (err: any) {
			this.setStreamContent(`**Error:** ${err.message}`);
		} finally {
			this.isStreaming = false;
			this.currentStreamEl = null;
		}
	}

	// ── Public API for streaming ──

	appendToken(token: string): void {
		this.currentStreamText += token;
		if (this.currentStreamEl) {
			this.currentStreamEl.setText(this.currentStreamText);
		}
	}

	setResponse(markdown: string): void {
		if (this.currentStreamEl) {
			this.currentStreamEl.empty();
			MarkdownRenderer.render(
				this.app, markdown, this.currentStreamEl, '', this as any
			);
		}
	}

	// ── Message rendering ──

	private addUserMessage(text: string): void {
		const bubble = this.messagesEl.createDiv({ cls: 'obllm-message obllm-message-user' });
		bubble.createDiv({ cls: 'obllm-message-role', text: 'You' });
		bubble.createDiv({ cls: 'obllm-message-content', text });
		this.scrollToBottom();
	}

	private addAssistantMessage(text: string): HTMLDivElement {
		const bubble = this.messagesEl.createDiv({ cls: 'obllm-message obllm-message-assistant' });
		bubble.createDiv({ cls: 'obllm-message-role', text: 'ObLLM' });
		const content = bubble.createDiv({ cls: 'obllm-message-content' });
		if (text) content.setText(text);
		this.scrollToBottom();
		return content;
	}

	private addSystemMessage(text: string): void {
		const msg = this.messagesEl.createDiv({ cls: 'obllm-message obllm-message-system' });
		msg.setText(text);
	}

	private setStreamContent(markdown: string): void {
		if (this.currentStreamEl) {
			this.currentStreamEl.empty();
			MarkdownRenderer.render(
				this.app, markdown, this.currentStreamEl, '', this as any
			);
		}
	}

	private scrollToBottom(): void {
		this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
	}

	onClose() {
		this.contentEl.empty();
	}
}
