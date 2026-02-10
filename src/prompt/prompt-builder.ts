import type { ScoredChunk } from '../retrieval/retriever';

export type PromptTemplate = 'qa' | 'summary' | 'audio';

export class PromptBuilder {
	buildPrompt(template: PromptTemplate, query: string, chunks: ScoredChunk[]): string {
		const sources = this.formatSources(chunks);

		switch (template) {
			case 'qa':
				return this.qaPrompt(query, sources);
			case 'summary':
				return this.summaryPrompt(sources);
			case 'audio':
				return this.audioPrompt(sources);
		}
	}

	formatContext(chunks: ScoredChunk[]): string {
		return this.formatSources(chunks);
	}

	private formatSources(chunks: ScoredChunk[]): string {
		return chunks
			.map((sc, i) => {
				const heading = sc.chunk.heading ? ` (${sc.chunk.heading})` : '';
				return `[${i + 1}] ${sc.chunk.source}${heading}\n${sc.chunk.text}`;
			})
			.join('\n\n');
	}

	private qaPrompt(query: string, sources: string): string {
		return [
			'You are a research assistant.',
			'Answer the question using ONLY the sources below.',
			'Cite each fact using [number] and include the source.',
			'If the answer is not in the sources, say "I don\'t know based on your notes."',
			'',
			`Question: ${query}`,
			'',
			'Sources:',
			sources,
		].join('\n');
	}

	private summaryPrompt(sources: string): string {
		return [
			'You are a note summarizer.',
			'Summarize the following notes in a concise, readable markdown format.',
			'Include headings, bullet points, and citations using [number].',
			'',
			'Sources:',
			sources,
		].join('\n');
	}

	private audioPrompt(sources: string): string {
		return [
			'You are an AI narrator.',
			'Convert the following notes into a podcast-style script.',
			'Use simple language, explain clearly, and include citations as [number].',
			'',
			'Sources:',
			sources,
		].join('\n');
	}
}
