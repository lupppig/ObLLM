import type { Chunk } from '../scanner/chunker';
import type { Retriever, ScoredChunk } from './retriever';
import type { IndexStore } from './index-store';
import type { LLMProvider } from '../llm/provider';

export class EmbeddingRetriever implements Retriever {
	private indexStore: IndexStore;
	private llmProvider: LLMProvider;
	private embeddingCache: Map<string, number[]> = new Map();

	constructor(indexStore: IndexStore, llmProvider: LLMProvider) {
		this.indexStore = indexStore;
		this.llmProvider = llmProvider;
	}

	async search(query: string, topK: number): Promise<ScoredChunk[]> {
		if (!this.llmProvider.embed) {
			throw new Error('Current LLM provider does not support embeddings');
		}

		const queryEmbedding = await this.llmProvider.embed(query);
		if (queryEmbedding.length === 0) return [];

		const chunks = this.indexStore.getAllChunks();
		const scored: ScoredChunk[] = [];

		for (const chunk of chunks) {
			const chunkEmbedding = await this.getOrComputeEmbedding(chunk);
			if (chunkEmbedding.length === 0) continue;

			const score = this.cosineSimilarity(queryEmbedding, chunkEmbedding);
			scored.push({ chunk, score });
		}

		return scored
			.sort((a, b) => b.score - a.score)
			.slice(0, topK);
	}

	private async getOrComputeEmbedding(chunk: Chunk): Promise<number[]> {
		const cached = this.embeddingCache.get(chunk.id);
		if (cached) return cached;

		if (!this.llmProvider.embed) return [];

		const embedding = await this.llmProvider.embed(chunk.text);
		this.embeddingCache.set(chunk.id, embedding);
		return embedding;
	}

	private cosineSimilarity(a: number[], b: number[]): number {
		if (a.length !== b.length) return 0;

		let dotProduct = 0;
		let normA = 0;
		let normB = 0;

		for (let i = 0; i < a.length; i++) {
			dotProduct += a[i] * b[i];
			normA += a[i] * a[i];
			normB += b[i] * b[i];
		}

		const denominator = Math.sqrt(normA) * Math.sqrt(normB);
		return denominator === 0 ? 0 : dotProduct / denominator;
	}

	clearCache() {
		this.embeddingCache.clear();
	}
}
