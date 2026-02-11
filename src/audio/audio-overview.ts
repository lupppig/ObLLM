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
		onStatus?: (status: string) => void
	): Promise<string> {
		onStatus?.('Generating audio script...');

		// Generate a podcast-style script from chunks
		const prompt = this.promptBuilder.buildPrompt('audio', '', chunks);
		const script = await this.llmProvider.generate({ prompt });

		onStatus?.('Converting to speech...');

		// Speak the script
		await this.ttsEngine.speak(script);

		return script;
	}

	stop(): void {
		this.ttsEngine.stop();
	}

	get isPlaying(): boolean {
		return this.ttsEngine.isPlaying;
	}
}
