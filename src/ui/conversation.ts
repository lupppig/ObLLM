export interface ConversationMessage {
	role: 'user' | 'assistant';
	content: string;
}

export class ConversationHistory {
	private messages: ConversationMessage[] = [];
	private maxTokenEstimate: number;

	constructor(maxTokenEstimate = 8000) {
		this.maxTokenEstimate = maxTokenEstimate;
	}

	add(role: 'user' | 'assistant', content: string): void {
		this.messages.push({ role, content });
		this.trim();
	}

	getMessages(): ConversationMessage[] {
		return [...this.messages];
	}

	formatForPrompt(): string {
		if (this.messages.length === 0) return '';

		return this.messages
			.map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
			.join('\n\n');
	}

	clear(): void {
		this.messages = [];
	}

	get length(): number {
		return this.messages.length;
	}

	private trim(): void {
		let totalChars = this.messages.reduce((sum, m) => sum + m.content.length, 0);
		const charLimit = this.maxTokenEstimate * 4;

		while (totalChars > charLimit && this.messages.length > 2) {
			const removed = this.messages.shift()!;
			totalChars -= removed.content.length;
		}
	}
}
