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
		console.log('ObLLM: UnifiedProvider.generate called', { stream: params.stream });
		try {
			const model = this.registry.getLanguageModel(this.settings);
			const { prompt, structuredPrompt, stream, onToken, context: legacyContext } = params;

			const messages: any[] = [];

			if (structuredPrompt) {
				// 1. System Role: Core Instructions
				messages.push({ role: 'system', content: structuredPrompt.system });

				// 2. System Role: Metadata
				messages.push({ role: 'system', content: `Current Date: ${new Date().toLocaleDateString()}` });

				// 3. User Role: Separated Context and Query
				const userContent = [
					'<context>',
					structuredPrompt.context,
					'</context>',
					'',
					'<user_query>',
					structuredPrompt.userQuery,
					'</user_query>'
				].join('\n');

				messages.push({ role: 'user', content: userContent });
			} else {
				// Legacy support for plain string prompts
				if (legacyContext) {
					messages.push({ role: 'system', content: `Context:\n${legacyContext}` });
				}
				messages.push({ role: 'user', content: prompt });
			}

			console.log('ObLLM: UnifiedProvider messages:', messages);

			if (stream && onToken) {
				console.log('ObLLM: Entering generateStream');
				return await this.generateStream(model, messages, onToken);
			}

			console.log('ObLLM: Calling generateText (non-stream)');
			const result = await generateText({
				model,
				messages
			});

			console.log('ObLLM: generateText result received');
			return result.text;
		} catch (err: any) {
			console.error('ObLLM: UnifiedProvider Error:', err);
			if (params.onError) params.onError(err);
			throw err;
		}
	}

	private async generateStream(
		model: any,
		messages: any[],
		onToken: (token: string) => void
	): Promise<string> {
		const abortController = new AbortController();
		const timeoutId = setTimeout(() => {
			console.log('ObLLM: Manual 30s timeout reached - aborting');
			abortController.abort();
		}, 30000);

		let result;
		try {
			console.log('ObLLM: Calling streamText');
			result = streamText({
				model,
				messages,
				abortSignal: abortController.signal
			});
		} catch (err: any) {
			clearTimeout(timeoutId);
			console.error('ObLLM: streamText initiation failed:', err);
			throw err;
		}

		let fullText = '';
		let tokenCount = 0;
		let hasReceivedToken = false;

		const heartbeatTimeout = setTimeout(() => {
			if (!hasReceivedToken) {
				console.error('ObLLM: Heartbeat reached - still no tokens after 15s');
			}
		}, 15000);

		try {
			console.log('ObLLM: Starting stream iteration');
			for await (const chunk of result.textStream) {
				if (!hasReceivedToken) {
					hasReceivedToken = true;
					clearTimeout(heartbeatTimeout);
					console.log('ObLLM: First token received');
				}
				fullText += chunk;
				tokenCount++;
				if (tokenCount % 10 === 0) console.log(`ObLLM: Received ${tokenCount} tokens...`);
				onToken(chunk);
			}
			console.log('ObLLM: Stream iteration finished', { totalTokens: tokenCount });
		} catch (err: any) {
			clearTimeout(heartbeatTimeout);
			clearTimeout(timeoutId);
			if (err.name === 'AbortError' || err.name === 'TimeoutError' || err.message?.includes('timeout')) {
				console.error('ObLLM: Generation timed out after 30s');
				throw new Error('LLM generation timed out. Please check your internet connection or API key.');
			}
			console.error('ObLLM: Stream Error during iteration:', err);
			throw err;
		} finally {
			clearTimeout(heartbeatTimeout);
			clearTimeout(timeoutId);
		}

		if (!hasReceivedToken && fullText.length === 0) {
			console.warn('ObLLM: Stream was empty. Attempting non-streaming fallback...');
			let fallbackErrorDetails = '';
			try {
				const fallbackResult = await generateText({
					model,
					messages,
					abortSignal: AbortSignal.timeout(15000)
				});
				if (fallbackResult.text) {
					console.log('ObLLM: Fallback successful');
					onToken(fallbackResult.text);
					return fallbackResult.text;
				}
			} catch (fallbackErr: any) {
				console.error('ObLLM: Fallback also failed:', fallbackErr);
				fallbackErrorDetails = fallbackErr.message || String(fallbackErr);
			}
			const curProvider = this.settings.llmProvider;
			const finalError = `No response received from LLM (${curProvider}).${fallbackErrorDetails ? ` Error: ${fallbackErrorDetails}` : ' The provider might be unreachable or your API key is invalid.'}`;
			throw new Error(finalError);
		}

		return fullText;
	}

	async embed(text: string): Promise<number[]> {
		console.log('ObLLM: UnifiedProvider.embed starting');
		const embeddingModel = this.registry.getEmbeddingModel(this.settings);
		if (!embeddingModel) {
			throw new Error('No embedding provider configured');
		}

		try {
			const abortController = new AbortController();
			const timeoutId = setTimeout(() => abortController.abort(), 20000);

			const result = await embed({
				model: embeddingModel,
				value: text,
				abortSignal: abortController.signal
			});

			clearTimeout(timeoutId);
			console.log('ObLLM: UnifiedProvider.embed success');
			return result.embedding as number[];
		} catch (err: any) {
			if (err.name === 'AbortError') {
				console.error('ObLLM: Embedding timed out after 20s');
				throw new Error('Embedding service timed out. Try reducing your vault size or checking your internet connection.');
			}
			console.error('ObLLM: Embedding error:', err);
			throw err;
		}
	}

	async checkHealth(): Promise<{ ok: boolean; message: string }> {
		const provider = this.settings.llmProvider;
		console.log('ObLLM: Checking provider health:', provider);

		try {
			// For Cloud providers, we just check if we have an API key or assume reachability
			if (!this.settings.apiKey) {
				return { ok: false, message: `API Key missing for ${provider}. Please check your settings.` };
			}
			return { ok: true, message: `${provider} configuration looks valid.` };
		} catch (err: any) {
			console.error('ObLLM: Health check failed:', err);
			return { ok: false, message: `Health check failed: ${err.message}` };
		}
	}
}
