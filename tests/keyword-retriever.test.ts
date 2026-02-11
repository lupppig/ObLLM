import { describe, it, expect, beforeEach } from 'vitest';
import { KeywordRetriever } from '../src/retrieval/keyword-retriever';
import type { IndexStore } from '../src/retrieval/index-store';
import type { Chunk } from '../src/scanner/chunker';

const testChunks: Chunk[] = [
	{ id: 'a#0', text: 'Machine learning algorithms process large datasets for pattern recognition.', source: 'a.md', startOffset: 0, endOffset: 73 },
	{ id: 'b#0', text: 'Neural networks are a type of machine learning model.', source: 'b.md', startOffset: 0, endOffset: 53 },
	{ id: 'c#0', text: 'Cooking recipes require fresh ingredients and patience.', source: 'c.md', startOffset: 0, endOffset: 55 },
	{ id: 'd#0', text: 'Deep learning is a subset of machine learning using neural networks.', source: 'd.md', startOffset: 0, endOffset: 68 },
];

function createMockStore(chunks: Chunk[]): IndexStore {
	return {
		getAllChunks: () => chunks,
		getChunkById: (id: string) => chunks.find((c) => c.id === id),
		addChunks: () => { },
		removeChunksForFile: () => { },
		getChunksBySource: () => [],
		getFileTimestamp: () => undefined,
		get chunkCount() { return chunks.length; },
		clear: () => { },
		load: async () => { },
		save: async () => { },
	} as any;
}

describe('KeywordRetriever', () => {
	let retriever: KeywordRetriever;

	beforeEach(() => {
		retriever = new KeywordRetriever(createMockStore(testChunks));
	});

	it('returns relevant chunks for matching query', async () => {
		const results = await retriever.search('machine learning', 5);
		expect(results.length).toBeGreaterThan(0);
		expect(results[0].chunk.text).toContain('machine learning');
	});

	it('ranks more relevant chunks higher', async () => {
		const results = await retriever.search('neural networks machine learning', 5);
		// Chunks mentioning both terms should score higher
		expect(results.length).toBeGreaterThanOrEqual(2);
		expect(results[0].score).toBeGreaterThanOrEqual(results[1].score);
	});

	it('returns empty for unrelated query', async () => {
		const results = await retriever.search('quantum physics spacetime', 5);
		expect(results).toHaveLength(0);
	});

	it('respects topK limit', async () => {
		const results = await retriever.search('machine learning', 2);
		expect(results.length).toBeLessThanOrEqual(2);
	});

	it('returns empty for empty query', async () => {
		const results = await retriever.search('', 5);
		expect(results).toHaveLength(0);
	});

	it('filters out zero-score results', async () => {
		const results = await retriever.search('cooking recipes', 5);
		for (const r of results) {
			expect(r.score).toBeGreaterThan(0);
		}
	});
});
