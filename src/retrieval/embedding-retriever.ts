import type { Retriever, ScoredChunk } from './retriever';
import type { VectorDB } from '../storage/db';
import type { LLMProvider } from '../llm/provider';

export class EmbeddingRetriever implements Retriever {
	private db: VectorDB;
	private llmProvider: LLMProvider;
	private isBackgroundPaused = false;

	constructor(db: VectorDB, llmProvider: LLMProvider) {
		this.db = db;
		this.llmProvider = llmProvider;
	}

	async search(query: string, topK: number, sourceFilter?: string[]): Promise<ScoredChunk[]> {
		console.log('ObLLM: EmbeddingRetriever.search starting', { query });
		if (!this.llmProvider.embed) {
			console.error('ObLLM: No embedding capability in provider');
			throw new Error('Current LLM provider does not support embeddings');
		}

		// Embed the query
		console.log('ObLLM: Embedding query...');
		const queryEmbedding = await this.llmProvider.embed(query);
		console.log('ObLLM: Query embedded successfully');
		if (queryEmbedding.length === 0) return [];

		// KNN search via sqlite-vec
		console.log('ObLLM: Performing vector search in DB...');
		const results = this.db.vectorSearch(queryEmbedding, topK, sourceFilter);
		console.log('ObLLM: Vector search complete', { matchCount: results.length });

		// Convert distance to similarity score (lower distance = higher score)
		return results.map((r) => ({
			chunk: r.chunk,
			score: 1 / (1 + r.distance),
		}));
	}

	public pauseBackgroundWork(paused: boolean) {
		this.isBackgroundPaused = paused;
	}

	/**
	 * Scans for chunks missing embeddings and populates them.
	 * This should be called in the background.
	 */
	public async ensureEmbeddings(): Promise<void> {
		if (!this.llmProvider.embed) return;

		const chunks = this.db.getAllChunks();
		const missing = chunks.filter((c) => !this.db.hasEmbedding(c.id));

		if (missing.length === 0) return;

		const batchSize = 5;
		for (let i = 0; i < missing.length; i += batchSize) {
			if (this.isBackgroundPaused) {
				while (this.isBackgroundPaused) {
					await new Promise(resolve => setTimeout(resolve, 500));
				}
				await new Promise(resolve => setTimeout(resolve, 1000));
			}

			const batch = missing.slice(i, i + batchSize);
			const entries: { chunkId: string; embedding: number[] }[] = [];

			for (const chunk of batch) {
				if (this.isBackgroundPaused) break;
				try {
					const embedding = await this.llmProvider.embed!(chunk.text);
					if (embedding.length > 0) {
						entries.push({ chunkId: chunk.id, embedding });
					}
				} catch (e) {
					console.error('ObLLM: Background embedding error', e);
					await new Promise(resolve => setTimeout(resolve, 5000)); // Longer cool down
				}
			}

			if (entries.length > 0) {
				this.db.storeEmbeddings(entries);
			}

			// Voluntary yield to event loop and Ollama
			await new Promise(resolve => setTimeout(resolve, 1000));
		}
	}
}
