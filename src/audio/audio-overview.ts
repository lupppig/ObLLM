import type { LLMProvider } from '../llm/provider';
import type { ScoredChunk } from '../retrieval/retriever';
import type { TTSEngine } from './tts-engine';
import { PromptBuilder } from '../prompt/prompt-builder';
import { CitationLinker } from '../prompt/citation-linker';

export class AudioOverview {
	private llmProvider: LLMProvider;
	private ttsEngine: TTSEngine;
	private promptBuilder: PromptBuilder;

	constructor(llmProvider: LLMProvider, ttsEngine: TTSEngine) {
		this.llmProvider = llmProvider;
		this.ttsEngine = ttsEngine;
		this.promptBuilder = new PromptBuilder();
	}

	async generate(
		chunks: ScoredChunk[],
		onStatus?: (step: 'script' | 'synth' | 'play', status: 'active' | 'done') => void
	): Promise<string> {
		onStatus?.('script', 'active');

		const prompt = this.promptBuilder.buildPrompt('audio', '', chunks);
		const script = await this.llmProvider.generate({ prompt: '', structuredPrompt: prompt });
		onStatus?.('script', 'done');

		onStatus?.('synth', 'active');
		await this.ttsEngine.speak(script);
		onStatus?.('synth', 'done');

		onStatus?.('play', 'done');

		return script;
	}

	stop(): void {
		this.ttsEngine.stop();
	}

	get isPlaying(): boolean {
		return this.ttsEngine.isPlaying;
	}
}
