import type { Retriever, ScoredChunk } from './retriever';
import type { VectorDB } from '../storage/db';
import type { LLMProvider } from '../llm/provider';

export class EmbeddingRetriever implements Retriever {
	private db: VectorDB;
	private llmProvider: LLMProvider;

	constructor(db: VectorDB, llmProvider: LLMProvider) {
		this.db = db;
		this.llmProvider = llmProvider;
	}

	async search(query: string, topK: number, sourceFilter?: string[]): Promise<ScoredChunk[]> {
		if (!this.llmProvider.embed) {
			throw new Error('Current LLM provider does not support embeddings');
		}

		// Ensure all chunks have embeddings
		await this.ensureEmbeddings();

		// Embed the query
		const queryEmbedding = await this.llmProvider.embed(query);
		if (queryEmbedding.length === 0) return [];

		// KNN search via sqlite-vec
		const results = this.db.vectorSearch(queryEmbedding, topK, sourceFilter);

		// Convert distance to similarity score (lower distance = higher score)
		return results.map((r) => ({
			chunk: r.chunk,
			score: 1 / (1 + r.distance),
		}));
	}

	private async ensureEmbeddings(): Promise<void> {
		if (!this.llmProvider.embed) return;

		const chunks = this.db.getAllChunks();
		const missing = chunks.filter((c) => !this.db.hasEmbedding(c.id));

		if (missing.length === 0) return;

		// Batch embed missing chunks
		const batchSize = 20;
		for (let i = 0; i < missing.length; i += batchSize) {
			const batch = missing.slice(i, i + batchSize);
			const entries: { chunkId: string; embedding: number[] }[] = [];

			for (const chunk of batch) {
				const embedding = await this.llmProvider.embed!(chunk.text);
				if (embedding.length > 0) {
					entries.push({ chunkId: chunk.id, embedding });
				}
			}

			if (entries.length > 0) {
				this.db.storeEmbeddings(entries);
			}
		}
	}
}
