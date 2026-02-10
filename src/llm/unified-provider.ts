import { generateText, streamText, embed } from 'ai';
import type { LLMProvider, GenerateParams } from './provider';
import { ModelRegistry } from './model-registry';
import type { ObLLMSettings } from '../settings';

export class UnifiedProvider implements LLMProvider {
	private registry: ModelRegistry;
	private settings: ObLLMSettings;

	constructor(settings: ObLLMSettings) {
		this.registry = new ModelRegistry();
		this.settings = settings;
	}

	async generate(params: GenerateParams): Promise<string> {
		const model = this.registry.getLanguageModel(this.settings);
		const { prompt, stream, onToken } = params;

		if (stream && onToken) {
			return this.generateStream(model, prompt, params.context, onToken);
		}

		const result = await generateText({
			model,
			prompt: params.context
				? `Context:\n${params.context}\n\n${prompt}`
				: prompt,
		});

		return result.text;
	}

	private async generateStream(
		model: any,
		prompt: string,
		context: string | undefined,
		onToken: (token: string) => void
	): Promise<string> {
		const result = streamText({
			model,
			prompt: context
				? `Context:\n${context}\n\n${prompt}`
				: prompt,
		});

		let fullText = '';
		for await (const chunk of result.textStream) {
			fullText += chunk;
			onToken(chunk);
		}

		return fullText;
	}

	async embed(text: string): Promise<number[]> {
		const embeddingModel = this.registry.getEmbeddingModel(this.settings);
		if (!embeddingModel) {
			throw new Error('No embedding provider configured');
		}

		const result = await embed({
			model: embeddingModel,
			value: text,
		});

		return result.embedding as number[];
	}
}
