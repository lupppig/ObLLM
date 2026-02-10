import type { Chunk } from '../scanner/chunker';

export interface ScoredChunk {
	chunk: Chunk;
	score: number;
}

export interface Retriever {
	search(query: string, topK: number): Promise<ScoredChunk[]>;
}
