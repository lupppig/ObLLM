export interface GenerateParams {
	prompt: string;
	context?: string;
	stream?: boolean;
	onToken?: (token: string) => void;
	onError?: (err: any) => void;
}

export interface LLMProvider {
	generate(params: GenerateParams): Promise<string>;
	embed?(text: string): Promise<number[]>;
	checkHealth?(): Promise<{ ok: boolean; message: string }>;
}
