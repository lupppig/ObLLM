import type { Chunk } from '../scanner/chunker';
import type { Retriever, ScoredChunk } from './retriever';
import type { IndexStore } from './index-store';

export class KeywordRetriever implements Retriever {
	private indexStore: IndexStore;

	constructor(indexStore: IndexStore) {
		this.indexStore = indexStore;
	}

	async search(query: string, topK: number): Promise<ScoredChunk[]> {
		const queryTerms = this.tokenize(query);
		if (queryTerms.length === 0) return [];

		const chunks = this.indexStore.getAllChunks();
		const idf = this.computeIDF(queryTerms, chunks);

		const scored: ScoredChunk[] = chunks.map((chunk) => {
			const score = this.scoreTFIDF(queryTerms, chunk.text, idf);
			return { chunk, score };
		});

		return scored
			.filter((s) => s.score > 0)
			.sort((a, b) => b.score - a.score)
			.slice(0, topK);
	}

	private tokenize(text: string): string[] {
		return text
			.toLowerCase()
			.replace(/[^\w\s]/g, ' ')
			.split(/\s+/)
			.filter((t) => t.length > 1 && !STOP_WORDS.has(t));
	}

	private computeIDF(terms: string[], chunks: Chunk[]): Map<string, number> {
		const idf = new Map<string, number>();
		const n = chunks.length;
		if (n === 0) return idf;

		for (const term of terms) {
			const df = chunks.filter((c) =>
				c.text.toLowerCase().includes(term)
			).length;
			idf.set(term, Math.log((n + 1) / (df + 1)) + 1);
		}
		return idf;
	}

	private scoreTFIDF(queryTerms: string[], text: string, idf: Map<string, number>): number {
		const lower = text.toLowerCase();
		const docTokens = this.tokenize(text);
		const docLen = docTokens.length || 1;

		let score = 0;
		for (const term of queryTerms) {
			const tf = docTokens.filter((t) => t === term).length / docLen;
			const idfVal = idf.get(term) ?? 0;
			score += tf * idfVal;
		}
		return score;
	}
}

const STOP_WORDS = new Set([
	'the', 'is', 'at', 'which', 'on', 'a', 'an', 'and', 'or', 'but',
	'in', 'with', 'to', 'for', 'of', 'not', 'no', 'can', 'had', 'has',
	'have', 'it', 'its', 'my', 'that', 'this', 'was', 'are', 'be', 'do',
	'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might',
	'from', 'by', 'as', 'if', 'so', 'than', 'too', 'very', 'just',
	'about', 'also', 'how', 'what', 'when', 'where', 'who', 'why',
]);
