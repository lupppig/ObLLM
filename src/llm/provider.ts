export interface StructuredPrompt {
	system: string;
	context: string;
	userQuery: string;
}

export interface GenerateParams {
	prompt: string;
	structuredPrompt?: StructuredPrompt;
	context?: string;
	stream?: boolean;
	onToken?: (token: string) => void;
	onError?: (err: any) => void;
	abortSignal?: AbortSignal;
}

export interface LLMProvider {
	generate(params: GenerateParams): Promise<string>;
	embed?(text: string): Promise<number[]>;
	checkHealth?(): Promise<{ ok: boolean; message: string }>;
}
