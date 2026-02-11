import type { Retriever, ScoredChunk } from './retriever';

export class HybridRetriever implements Retriever {
	public keywordRetriever: Retriever;
	public embeddingRetriever: Retriever;
	private keywordWeight: number;

	constructor(
		keywordRetriever: Retriever,
		embeddingRetriever: Retriever,
		keywordWeight = 0.3
	) {
		this.keywordRetriever = keywordRetriever;
		this.embeddingRetriever = embeddingRetriever;
		this.keywordWeight = keywordWeight;
	}

	async search(query: string, topK: number): Promise<ScoredChunk[]> {
		const expandedK = topK * 2;

		const [keywordResults, embeddingResults] = await Promise.all([
			this.keywordRetriever.search(query, expandedK),
			this.embeddingRetriever.search(query, expandedK),
		]);

		const scoreMap = new Map<string, ScoredChunk>();

		const maxKeyword = keywordResults[0]?.score || 1;
		for (const sc of keywordResults) {
			const normalizedScore = sc.score / maxKeyword;
			scoreMap.set(sc.chunk.id, {
				chunk: sc.chunk,
				score: normalizedScore * this.keywordWeight,
			});
		}

		const maxEmbedding = embeddingResults[0]?.score || 1;
		for (const sc of embeddingResults) {
			const normalizedScore = sc.score / maxEmbedding;
			const existing = scoreMap.get(sc.chunk.id);
			if (existing) {
				existing.score += normalizedScore * (1 - this.keywordWeight);
			} else {
				scoreMap.set(sc.chunk.id, {
					chunk: sc.chunk,
					score: normalizedScore * (1 - this.keywordWeight),
				});
			}
		}

		return Array.from(scoreMap.values())
			.sort((a, b) => b.score - a.score)
			.slice(0, topK);
	}
}
