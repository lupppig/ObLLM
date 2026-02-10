import { App, Modal, Setting, MarkdownRenderer } from 'obsidian';

export class ChatModal extends Modal {
	private inputEl!: HTMLTextAreaElement;
	private responseEl!: HTMLDivElement;
	private onSubmit: (query: string) => Promise<void>;
	private isStreaming = false;

	constructor(app: App, onSubmit: (query: string) => Promise<void>) {
		super(app);
		this.onSubmit = onSubmit;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.addClass('obllm-chat-modal');

		contentEl.createEl('h2', { text: 'ObLLM — Ask your notes' });

		this.responseEl = contentEl.createDiv({ cls: 'obllm-response' });
		this.responseEl.setText('Ask a question and I\'ll answer using your notes.');

		const inputContainer = contentEl.createDiv({ cls: 'obllm-input-container' });
		this.inputEl = inputContainer.createEl('textarea', {
			cls: 'obllm-input',
			attr: { placeholder: 'Ask a question...', rows: '3' },
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

	private async submit() {
		const query = this.inputEl.value.trim();
		if (!query || this.isStreaming) return;

		this.isStreaming = true;
		this.inputEl.value = '';
		this.responseEl.empty();
		this.responseEl.setText('Thinking...');

		try {
			await this.onSubmit(query);
		} catch (err: any) {
			this.responseEl.setText(`Error: ${err.message}`);
		} finally {
			this.isStreaming = false;
		}
	}

	setResponse(markdown: string) {
		this.responseEl.empty();
		MarkdownRenderer.render(
			this.app,
			markdown,
			this.responseEl,
			'',
			this as any
		);
	}

	appendToken(token: string) {
		const existing = this.responseEl.getText();
		if (existing === 'Thinking...') {
			this.responseEl.empty();
		}
		this.responseEl.appendText(token);
	}

	onClose() {
		this.contentEl.empty();
	}
}
