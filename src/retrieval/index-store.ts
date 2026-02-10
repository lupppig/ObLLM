import type { Chunk } from '../scanner/chunker';

export interface IndexData {
	chunks: Chunk[];
	fileTimestamps: Record<string, number>;
	lastIndexedAt: number;
}

const EMPTY_INDEX: IndexData = {
	chunks: [],
	fileTimestamps: {},
	lastIndexedAt: 0,
};

export class IndexStore {
	private data: IndexData;
	private saveFn: (data: string) => Promise<void>;
	private loadFn: () => Promise<string | null>;

	constructor(
		saveFn: (data: string) => Promise<void>,
		loadFn: () => Promise<string | null>
	) {
		this.data = { ...EMPTY_INDEX, chunks: [], fileTimestamps: {} };
		this.saveFn = saveFn;
		this.loadFn = loadFn;
	}

	async load(): Promise<void> {
		const raw = await this.loadFn();
		if (raw) {
			try {
				this.data = JSON.parse(raw);
			} catch {
				this.data = { ...EMPTY_INDEX, chunks: [], fileTimestamps: {} };
			}
		}
	}

	async save(): Promise<void> {
		await this.saveFn(JSON.stringify(this.data));
	}

	addChunks(chunks: Chunk[], filePath: string, mtime: number): void {
		this.removeChunksForFile(filePath);
		this.data.chunks.push(...chunks);
		this.data.fileTimestamps[filePath] = mtime;
		this.data.lastIndexedAt = Date.now();
	}

	removeChunksForFile(filePath: string): void {
		this.data.chunks = this.data.chunks.filter((c) => c.source !== filePath);
		delete this.data.fileTimestamps[filePath];
	}

	getAllChunks(): Chunk[] {
		return this.data.chunks;
	}

	getChunkById(id: string): Chunk | undefined {
		return this.data.chunks.find((c) => c.id === id);
	}

	getFileTimestamp(filePath: string): number | undefined {
		return this.data.fileTimestamps[filePath];
	}

	get lastIndexedAt(): number {
		return this.data.lastIndexedAt;
	}

	get chunkCount(): number {
		return this.data.chunks.length;
	}

	clear(): void {
		this.data = { ...EMPTY_INDEX, chunks: [], fileTimestamps: {} };
	}
}
