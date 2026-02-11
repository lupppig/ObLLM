import type { Chunk } from '../scanner/chunker';
import type { VectorDB } from '../storage/db';

export class IndexStore {
	private db: VectorDB;

	constructor(db: VectorDB) {
		this.db = db;
	}

	async load(): Promise<void> {
		// No-op — SQLite is always persisted
	}

	async save(): Promise<void> {
		// No-op — SQLite writes are immediate
	}

	addChunks(chunks: Chunk[], filePath: string, mtime: number): void {
		this.db.addChunks(chunks, filePath, mtime);
	}

	removeChunksForFile(filePath: string): void {
		this.db.removeChunksForFile(filePath);
	}

	getAllChunks(): Chunk[] {
		return this.db.getAllChunks();
	}

	getChunkById(id: string): Chunk | undefined {
		return this.db.getChunkById(id);
	}

	getChunksBySource(source: string): Chunk[] {
		return this.db.getChunksBySource(source);
	}

	getFileTimestamp(filePath: string): number | undefined {
		return this.db.getFileTimestamp(filePath);
	}

	get chunkCount(): number {
		return this.db.chunkCount;
	}

	clear(): void {
		this.db.clear();
	}
}
