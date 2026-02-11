import type { ScoredChunk } from '../retrieval/retriever';
import type { LLMProvider } from '../llm/provider';

export class SuggestedQuestions {
	private llmProvider: LLMProvider;

	constructor(llmProvider: LLMProvider) {
		this.llmProvider = llmProvider;
	}

	async generate(chunks: ScoredChunk[], count = 5): Promise<string[]> {
		if (chunks.length === 0) return [];

		const context = chunks
			.slice(0, 10)
			.map((sc, i) => `[${i + 1}] ${sc.chunk.source}: ${sc.chunk.text.slice(0, 200)}`)
			.join('\n\n');

		const prompt = [
			'Based on the following notes, suggest exactly ' + count + ' interesting and specific questions the user could explore.',
			'Return ONLY the questions, one per line, numbered 1-' + count + '.',
			'Do not add any other text.',
			'',
			'Notes:',
			context,
		].join('\n');

		try {
			const structuredPrompt = {
				system: 'You are a research assistant. Suggest ' + count + ' specific questions based on notes. Return ONLY questions 1-' + count + '.',
				context: context,
				userQuery: 'Suggest questions based on these notes.'
			};
			const response = await this.llmProvider.generate({ prompt: '', structuredPrompt });
			return this.parseQuestions(response, count);
		} catch {
			return [];
		}
	}

	private parseQuestions(response: string, max: number): string[] {
		return response
			.split('\n')
			.map((line) => line.replace(/^\d+[.)]\s*/, '').trim())
			.filter((line) => line.length > 10 && line.endsWith('?'))
			.slice(0, max);
	}
}
