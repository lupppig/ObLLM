import sqlite3InitModule from '@sqliteai/sqlite-wasm';
import type { Chunk } from '../scanner/chunker';

export interface VectorSearchResult {
	chunk: Chunk;
	distance: number;
}

export class VectorDB {
	private db: any;
	private sqlite3: any;
	private embeddingDimension: number;

	private constructor(sqlite3: any, db: any, embeddingDimension = 768) {
		this.sqlite3 = sqlite3;
		this.db = db;
		this.embeddingDimension = embeddingDimension;
	}

	/**
	 * Creates a new VectorDB instance.
	 * If initialData is provided, it is loaded into the database.
	 * wasmBinary can be provided to skip WASM file loading from disk/URL.
	 */
	static async create(embeddingDimension = 768, initialData?: Uint8Array, wasmBinary?: Uint8Array): Promise<VectorDB> {
		const sqlite3 = await sqlite3InitModule({
			wasmBinary: wasmBinary,
			wasmBinaryFile: 'sqlite3.wasm',
			locateFile: (path: string) => path,
		} as any);
		const db = new sqlite3.oo1.DB();

		if (initialData && initialData.byteLength > 0) {
			const p = sqlite3.wasm.alloc(initialData.byteLength);
			sqlite3.wasm.heap8u().set(new Uint8Array(initialData), p);

			// SQLITE_DESERIALIZE_FREEONCLOSE = 1
			// SQLITE_DESERIALIZE_RESIZEABLE = 2
			sqlite3.capi.sqlite3_deserialize(
				db.pointer!,
				'main',
				p,
				initialData.byteLength,
				initialData.byteLength,
				1 | 2
			);
		}

		const vdb = new VectorDB(sqlite3, db, embeddingDimension);
		vdb.initSchema();
		return vdb;
	}

	private initSchema(): void {
		// Base chunks table
		this.db.exec(`
      CREATE TABLE IF NOT EXISTS chunks (
        id TEXT PRIMARY KEY,
        source TEXT NOT NULL,
        heading TEXT,
        text TEXT NOT NULL,
        start_offset INTEGER NOT NULL,
        end_offset INTEGER NOT NULL,
        mtime INTEGER NOT NULL DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS idx_chunks_source ON chunks(source);
    `);

		// sqlite-vector uses standard tables for embeddings
		this.db.exec(`
			CREATE TABLE IF NOT EXISTS chunk_embeddings (
				chunk_id TEXT PRIMARY KEY,
				embedding BLOB
			);
		`);

		// Initialize vector extension for the connection
		// Note: sqlite-vector requires vector_init for search functions to work on a table
		this.db.exec(`
			SELECT vector_init(
				'chunk_embeddings', 
				'embedding', 
				'dimension=${this.embeddingDimension},type=FLOAT32,distance=cosine'
			);
		`);
	}

	// ── Chunk CRUD ──

	addChunks(chunks: Chunk[], filePath: string, mtime: number): void {
		this.db.transaction(() => {
			this.db.exec({
				sql: 'DELETE FROM chunk_embeddings WHERE chunk_id IN (SELECT id FROM chunks WHERE source = ?)',
				bind: [filePath]
			});
			this.db.exec({
				sql: 'DELETE FROM chunks WHERE source = ?',
				bind: [filePath]
			});

			const stmt = this.db.prepare(
				'INSERT OR REPLACE INTO chunks (id, source, heading, text, start_offset, end_offset, mtime) VALUES (?, ?, ?, ?, ?, ?, ?)'
			);
			try {
				for (const chunk of chunks) {
					stmt.bind([
						chunk.id, chunk.source, chunk.heading ?? null,
						chunk.text, chunk.startOffset, chunk.endOffset, mtime
					]).stepReset();
				}
			} finally {
				stmt.finalize();
			}
		});
	}

	removeChunksForFile(filePath: string): void {
		this.db.transaction(() => {
			const ids = this.db.selectValues('SELECT id FROM chunks WHERE source = ?', [filePath]);

			if (ids.length > 0) {
				const placeholders = ids.map(() => '?').join(',');
				this.db.exec({
					sql: `DELETE FROM chunk_embeddings WHERE chunk_id IN (${placeholders})`,
					bind: ids
				});
			}
			this.db.exec({
				sql: 'DELETE FROM chunks WHERE source = ?',
				bind: [filePath]
			});
		});
	}

	getAllChunks(): Chunk[] {
		const rows = this.db.selectObjects('SELECT * FROM chunks');
		return rows.map(this.rowToChunk);
	}

	getChunkById(id: string): Chunk | undefined {
		const row = this.db.selectObject('SELECT * FROM chunks WHERE id = ?', [id]);
		return row ? this.rowToChunk(row) : undefined;
	}

	getChunksBySource(source: string): Chunk[] {
		const rows = this.db.selectObjects('SELECT * FROM chunks WHERE source = ?', [source]);
		return rows.map(this.rowToChunk);
	}

	getFileTimestamp(filePath: string): number | undefined {
		return this.db.selectValue('SELECT mtime FROM chunks WHERE source = ? LIMIT 1', [filePath]);
	}

	get chunkCount(): number {
		return this.db.selectValue('SELECT COUNT(*) FROM chunks') as number;
	}

	// ── Embedding Storage & Vector Search ──

	storeEmbeddings(entries: { chunkId: string; embedding: number[] }[]): void {
		this.db.transaction(() => {
			const stmt = this.db.prepare(
				'INSERT OR REPLACE INTO chunk_embeddings (chunk_id, embedding) VALUES (?, ?)'
			);
			try {
				for (const entry of entries) {
					const floatArr = new Float32Array(entry.embedding);
					stmt.bind([
						entry.chunkId,
						floatArr.buffer as ArrayBuffer
					]).stepReset();
				}
			} finally {
				stmt.finalize();
			}
		});
	}

	hasEmbedding(chunkId: string): boolean {
		return !!this.db.selectValue('SELECT chunk_id FROM chunk_embeddings WHERE chunk_id = ?', [chunkId]);
	}

	vectorSearch(queryEmbedding: number[], topK: number, sourceFilter?: string[]): VectorSearchResult[] {
		const queryArr = new Float32Array(queryEmbedding);

		let sql: string;
		let params: any[];

		if (sourceFilter && sourceFilter.length > 0) {
			const placeholders = sourceFilter.map(() => '?').join(',');
			sql = `
        SELECT ce.chunk_id, v.distance, c.*
        FROM chunk_embeddings ce
        JOIN chunks c ON c.id = ce.chunk_id
        JOIN vector_full_scan(
					'chunk_embeddings',
					'embedding',
					?,
					?
				) v ON ce.rowid = v.rowid
        WHERE c.source IN (${placeholders})
        ORDER BY v.distance
      `;
			params = [queryArr.buffer as ArrayBuffer, topK, ...sourceFilter];
		} else {
			sql = `
        SELECT ce.chunk_id, v.distance, c.*
        FROM chunk_embeddings ce
        JOIN chunks c ON c.id = ce.chunk_id
        JOIN vector_full_scan(
					'chunk_embeddings',
					'embedding',
					?,
					?
				) v ON ce.rowid = v.rowid
        ORDER BY v.distance
      `;
			params = [queryArr.buffer as ArrayBuffer, topK];
		}

		const rows = this.db.selectObjects(sql, params);
		return rows.map((row: any) => ({
			chunk: this.rowToChunk(row),
			distance: row.distance,
		}));
	}

	// ── Persistence & Utilities ──

	/**
	 * Exports the database as a Uint8Array for persistence.
	 */
	export(): Uint8Array {
		const capi = this.sqlite3.capi;
		const wasm = this.sqlite3.wasm;
		const dbPtr = this.db.pointer!;

		const pSize = wasm.alloc(8);
		try {
			const pData = capi.sqlite3_serialize(dbPtr, 'main', pSize, 0);
			if (pData === 0) return new Uint8Array(0);

			const sizeRaw = wasm.getPtrValue(pSize, 'i32');
			const size = Array.isArray(sizeRaw) ? sizeRaw[0] : sizeRaw;

			const bytes = new Uint8Array(wasm.heap8u().buffer, pData, size).slice();
			capi.sqlite3_free(pData);

			return bytes;
		} finally {
			wasm.dealloc(pSize);
		}
	}

	clear(): void {
		this.db.exec('DELETE FROM chunk_embeddings');
		this.db.exec('DELETE FROM chunks');
	}

	close(): void {
		this.db.close();
	}

	private rowToChunk(row: any): Chunk {
		return {
			id: row.id,
			text: row.text,
			source: row.source,
			heading: row.heading ?? undefined,
			startOffset: row.start_offset,
			endOffset: row.end_offset,
		};
	}
}
