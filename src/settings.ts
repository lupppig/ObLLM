export interface ObLLMSettings {
	llmProvider: 'gemini' | 'openai' | 'custom';
	apiKey: string;
	apiBaseUrl: string;
	model: string;

	embeddingProvider: 'gemini' | 'openai' | 'none';
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
	ttsProvider: 'browser' | 'gemini' | 'openai';
	ttsVoice: string;
	ttsSpeed: number;
}

export const DEFAULT_SETTINGS: ObLLMSettings = {
	llmProvider: 'gemini',
	apiKey: '',
	apiBaseUrl: '',
	model: 'gemini-2.0-flash',

	embeddingProvider: 'gemini',
	embeddingModel: 'text-embedding-004',

	indexedFolders: [],
	excludedFolders: [],
	indexedTags: [],
	supportedExtensions: ['.md', '.pdf'],

	retrievalMethod: 'keyword',
	maxChunks: 10,
	chunkSize: 512,
	chunkOverlap: 64,

	ttsEnabled: false,
	ttsProvider: 'gemini',
	ttsVoice: '',
	ttsSpeed: 1.0,
};
