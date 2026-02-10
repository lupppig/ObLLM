import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenAI } from '@ai-sdk/openai';
import { createOllama } from 'ollama-ai-provider';
import type { ObLLMSettings } from '../settings';

export type ProviderType = 'gemini' | 'openai' | 'ollama' | 'custom';

const DEFAULT_MODELS: Record<ProviderType, string> = {
	gemini: 'gemini-2.5-flash',
	openai: 'gpt-4o-mini',
	ollama: 'llama3.2',
	custom: 'gpt-4o-mini',
};

const DEFAULT_EMBEDDING_MODELS: Record<string, string> = {
	gemini: 'gemini-embedding-001',
	openai: 'text-embedding-3-small',
	ollama: 'nomic-embed-text',
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

			case 'ollama': {
				const ollama = createOllama({
					baseURL: settings.ollamaBaseUrl || 'http://localhost:11434/api',
				});
				return ollama(modelName);
			}

			case 'custom': {
				const custom = createOpenAI({
					apiKey: settings.apiKey,
					baseURL: settings.apiBaseUrl || undefined,
				});
				return custom(modelName);
			}

			default:
				throw new Error(`Unknown provider: ${provider}`);
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

			case 'ollama': {
				const ollama = createOllama({
					baseURL: settings.ollamaBaseUrl || 'http://localhost:11434/api',
				});
				return ollama.textEmbeddingModel(modelName);
			}

			default:
				return null;
		}
	}
}
