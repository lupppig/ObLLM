export interface ObLLMSettings {
	llmProvider: 'gemini' | 'openai' | 'ollama' | 'custom';
	apiKey: string;
	apiBaseUrl: string;
	model: string;

	embeddingProvider: 'gemini' | 'openai' | 'ollama' | 'none';
	embeddingModel: string;

	indexedFolders: string[];
	excludedFolders: string[];
	indexedTags: string[];
	supportedExtensions: string[];

	retrievalMethod: 'keyword' | 'embedding' | 'hybrid';
	maxChunks: number;
	chunkSize: number;
	chunkOverlap: number;

	ttsEnabled: boolean;
	ttsProvider: 'openai' | 'browser';
}

export const DEFAULT_SETTINGS: ObLLMSettings = {
	llmProvider: 'gemini',
	apiKey: '',
	apiBaseUrl: 'https://generativelanguage.googleapis.com',
	model: 'gemini-2.5-flash',

	embeddingProvider: 'gemini',
	embeddingModel: 'gemini-embedding-001',

	indexedFolders: [],
	excludedFolders: [],
	indexedTags: [],
	supportedExtensions: ['.md', '.pdf'],

	retrievalMethod: 'keyword',
	maxChunks: 10,
	chunkSize: 512,
	chunkOverlap: 64,

	ttsEnabled: false,
	ttsProvider: 'browser',
};
