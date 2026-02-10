import { requestUrl } from 'obsidian';
import type { LLMProvider, GenerateParams } from './provider';

interface GeminiConfig {
	apiKey: string;
	baseUrl: string;
	model: string;
	embeddingModel: string;
}

export class GeminiProvider implements LLMProvider {
	private config: GeminiConfig;

	constructor(config: GeminiConfig) {
		this.config = config;
	}

	async generate(params: GenerateParams): Promise<string> {
		const { prompt, context, stream, onToken } = params;

		const contents = [];
		if (context) {
			contents.push({
				role: 'user',
				parts: [{ text: `Context:\n${context}` }],
			});
			contents.push({
				role: 'model',
				parts: [{ text: 'I will use this context to answer your question.' }],
			});
		}
		contents.push({
			role: 'user',
			parts: [{ text: prompt }],
		});

		if (stream && onToken) {
			return this.generateStream(contents, onToken);
		}

		return this.generateSync(contents);
	}

	private async generateSync(contents: any[]): Promise<string> {
		const url = `${this.config.baseUrl}/v1beta/models/${this.config.model}:generateContent?key=${this.config.apiKey}`;

		const response = await requestUrl({
			url,
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ contents }),
		});

		const data = response.json;
		return this.extractText(data);
	}

	private async generateStream(contents: any[], onToken: (token: string) => void): Promise<string> {
		const url = `${this.config.baseUrl}/v1beta/models/${this.config.model}:streamGenerateContent?alt=sse&key=${this.config.apiKey}`;

		const response = await fetch(url, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ contents }),
		});

		if (!response.ok) {
			const err = await response.text();
			throw new Error(`Gemini API error: ${response.status} ${err}`);
		}

		const reader = response.body?.getReader();
		if (!reader) throw new Error('No response body');

		const decoder = new TextDecoder();
		let fullText = '';
		let buffer = '';

		while (true) {
			const { done, value } = await reader.read();
			if (done) break;

			buffer += decoder.decode(value, { stream: true });
			const lines = buffer.split('\n');
			buffer = lines.pop() || '';

			for (const line of lines) {
				if (!line.startsWith('data: ')) continue;
				const jsonStr = line.slice(6).trim();
				if (!jsonStr || jsonStr === '[DONE]') continue;

				try {
					const parsed = JSON.parse(jsonStr);
					const text = this.extractText(parsed);
					if (text) {
						fullText += text;
						onToken(text);
					}
				} catch {
					// skip malformed chunks
				}
			}
		}

		return fullText;
	}

	async embed(text: string): Promise<number[]> {
		const url = `${this.config.baseUrl}/v1beta/models/${this.config.embeddingModel}:embedContent?key=${this.config.apiKey}`;

		const response = await requestUrl({
			url,
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				content: { parts: [{ text }] },
				taskType: 'RETRIEVAL_DOCUMENT',
			}),
		});

		return response.json?.embedding?.values ?? [];
	}

	private extractText(data: any): string {
		const candidates = data?.candidates;
		if (!candidates || candidates.length === 0) return '';
		const parts = candidates[0]?.content?.parts;
		if (!parts || parts.length === 0) return '';
		return parts.map((p: any) => p.text || '').join('');
	}
}
