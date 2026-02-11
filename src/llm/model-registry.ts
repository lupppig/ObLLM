import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenAI } from '@ai-sdk/openai';
import type { ObLLMSettings } from '../settings';

export type ProviderType = 'gemini' | 'openai' | 'custom';

const DEFAULT_MODELS: Record<ProviderType, string> = {
	gemini: 'gemini-2.0-flash',
	openai: 'gpt-4o-mini',
	custom: 'gpt-4o-mini',
};

const DEFAULT_EMBEDDING_MODELS: Record<string, string> = {
	gemini: 'text-embedding-004',
	openai: 'text-embedding-3-small',
};

export class ModelRegistry {
	getLanguageModel(settings: ObLLMSettings): any {
		const provider = settings.llmProvider as ProviderType;
		const modelName = settings.model || DEFAULT_MODELS[provider] || DEFAULT_MODELS.gemini;

		switch (provider) {
			case 'gemini': {
				const google = createGoogleGenerativeAI({
					apiKey: settings.apiKey,
					baseURL: settings.apiBaseUrl || undefined,
				});
				return google(modelName);
			}

			case 'openai': {
				const openai = createOpenAI({
					apiKey: settings.apiKey,
					baseURL: settings.apiBaseUrl || undefined,
				});
				return openai(modelName);
			}

			case 'custom': {
				const custom = createOpenAI({
					apiKey: settings.apiKey,
					baseURL: settings.apiBaseUrl || undefined,
				});
				return custom(modelName);
			}

			default:
				// Fallback to Gemini if provider is missing or was Ollama
				const google = createGoogleGenerativeAI({
					apiKey: settings.apiKey,
				});
				return google(DEFAULT_MODELS.gemini);
		}
	}

	getEmbeddingModel(settings: ObLLMSettings): any | null {
		const provider = settings.embeddingProvider;
		if (provider === 'none') return null;

		const modelName = settings.embeddingModel ||
			DEFAULT_EMBEDDING_MODELS[provider] ||
			DEFAULT_EMBEDDING_MODELS.gemini;

		switch (provider) {
			case 'gemini': {
				const google = createGoogleGenerativeAI({
					apiKey: settings.apiKey,
					baseURL: settings.apiBaseUrl || undefined,
				});
				return google.textEmbeddingModel(modelName);
			}

			case 'openai': {
				const openai = createOpenAI({
					apiKey: settings.apiKey,
					baseURL: settings.apiBaseUrl || undefined,
				});
				return openai.textEmbeddingModel(modelName);
			}

			default:
				return null;
		}
	}
}
