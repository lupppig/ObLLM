import type { ScoredChunk } from '../retrieval/retriever';

export class CitationLinker {
	/**
	 * Converts [n] citations in LLM output to interactive HTML markers.
	 */
	linkCitations(text: string, chunks: ScoredChunk[]): string {
		return text.replace(/\[(\d+)\]/g, (match, numStr) => {
			const idx = parseInt(numStr, 10) - 1;
			if (idx < 0 || idx >= chunks.length) return match;

			return `<span class="obllm-citation" data-chunk-index="${idx}">[${idx + 1}]</span>`;
		});
	}
}
