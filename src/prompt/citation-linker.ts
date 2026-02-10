import type { ScoredChunk } from '../retrieval/retriever';

export class CitationLinker {
	/**
	 * Converts [n] citations in LLM output to Obsidian [[wikilinks]].
	 */
	linkCitations(text: string, chunks: ScoredChunk[]): string {
		return text.replace(/\[(\d+)\]/g, (match, numStr) => {
			const idx = parseInt(numStr, 10) - 1;
			if (idx < 0 || idx >= chunks.length) return match;

			const chunk = chunks[idx].chunk;
			const notePath = chunk.source.replace(/\.md$/, '');
			const heading = chunk.heading;

			if (heading) {
				return `[[${notePath}#${heading}|[${idx + 1}]]]`;
			}
			return `[[${notePath}|[${idx + 1}]]]`;
		});
	}
}
