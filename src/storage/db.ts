// Native modules — loaded at runtime, externalized in esbuild
// eslint-disable-next-line @typescript-eslint/no-var-requires
const Database = require('better-sqlite3');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const sqliteVec = require('sqlite-vec');
import type { Chunk } from '../scanner/chunker';

export interface VectorSearchResult {
	chunk: Chunk;
	distance: number;
}

export class VectorDB {
	private db: any;
	private embeddingDimension: number;

	constructor(dbPath: string, embeddingDimension = 768) {
		this.embeddingDimension = embeddingDimension;
		this.db = new Database(dbPath);
		this.db.pragma('journal_mode = WAL');
		sqliteVec.load(this.db);
		this.initSchema();
	}

	private initSchema(): void {
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

		const vecTableExists = this.db
			.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='chunk_embeddings'")
			.get();

		if (!vecTableExists) {
			this.db.exec(`
        CREATE VIRTUAL TABLE chunk_embeddings USING vec0(
          chunk_id TEXT PRIMARY KEY,
          embedding float[${this.embeddingDimension}]
        );
      `);
		}
	}

	// ── Chunk CRUD ──

	addChunks(chunks: Chunk[], filePath: string, mtime: number): void {
		const deleteEmbeddings = this.db.prepare(
			'DELETE FROM chunk_embeddings WHERE chunk_id IN (SELECT id FROM chunks WHERE source = ?)'
		);
		const deleteChunks = this.db.prepare('DELETE FROM chunks WHERE source = ?');
		const insertChunk = this.db.prepare(
			'INSERT OR REPLACE INTO chunks (id, source, heading, text, start_offset, end_offset, mtime) VALUES (?, ?, ?, ?, ?, ?, ?)'
		);

		const txn = this.db.transaction(() => {
			deleteEmbeddings.run(filePath);
			deleteChunks.run(filePath);
			for (const chunk of chunks) {
				insertChunk.run(
					chunk.id, chunk.source, chunk.heading ?? null,
					chunk.text, chunk.startOffset, chunk.endOffset, mtime
				);
			}
		});
		txn();
	}

	removeChunksForFile(filePath: string): void {
		const txn = this.db.transaction(() => {
			const ids = this.db
				.prepare('SELECT id FROM chunks WHERE source = ?')
				.all(filePath) as { id: string }[];

			if (ids.length > 0) {
				const placeholders = ids.map(() => '?').join(',');
				this.db.prepare(`DELETE FROM chunk_embeddings WHERE chunk_id IN (${placeholders})`)
					.run(...ids.map((r: any) => r.id));
			}
			this.db.prepare('DELETE FROM chunks WHERE source = ?').run(filePath);
		});
		txn();
	}

	getAllChunks(): Chunk[] {
		const rows = this.db.prepare('SELECT * FROM chunks').all() as any[];
		return rows.map(this.rowToChunk);
	}

	getChunkById(id: string): Chunk | undefined {
		const row = this.db.prepare('SELECT * FROM chunks WHERE id = ?').get(id) as any;
		return row ? this.rowToChunk(row) : undefined;
	}

	getChunksBySource(source: string): Chunk[] {
		const rows = this.db.prepare('SELECT * FROM chunks WHERE source = ?').all(source) as any[];
		return rows.map(this.rowToChunk);
	}

	getFileTimestamp(filePath: string): number | undefined {
		const row = this.db
			.prepare('SELECT mtime FROM chunks WHERE source = ? LIMIT 1')
			.get(filePath) as { mtime: number } | undefined;
		return row?.mtime;
	}

	get chunkCount(): number {
		const row = this.db.prepare('SELECT COUNT(*) as cnt FROM chunks').get() as { cnt: number };
		return row.cnt;
	}

	// ── Embedding Storage & Vector Search ──

	storeEmbedding(chunkId: string, embedding: number[]): void {
		this.db.prepare(
			'INSERT OR REPLACE INTO chunk_embeddings (chunk_id, embedding) VALUES (?, ?)'
		).run(chunkId, this.float32ArrayToBuffer(embedding));
	}

	storeEmbeddings(entries: { chunkId: string; embedding: number[] }[]): void {
		const stmt = this.db.prepare(
			'INSERT OR REPLACE INTO chunk_embeddings (chunk_id, embedding) VALUES (?, ?)'
		);
		const txn = this.db.transaction(() => {
			for (const entry of entries) {
				stmt.run(entry.chunkId, this.float32ArrayToBuffer(entry.embedding));
			}
		});
		txn();
	}

	hasEmbedding(chunkId: string): boolean {
		return !!this.db
			.prepare('SELECT chunk_id FROM chunk_embeddings WHERE chunk_id = ?')
			.get(chunkId);
	}

	vectorSearch(queryEmbedding: number[], topK: number, sourceFilter?: string[]): VectorSearchResult[] {
		const queryBuf = this.float32ArrayToBuffer(queryEmbedding);

		let sql: string;
		let params: any[];

		if (sourceFilter && sourceFilter.length > 0) {
			const placeholders = sourceFilter.map(() => '?').join(',');
			sql = `
        SELECT ce.chunk_id, ce.distance, c.*
        FROM chunk_embeddings ce
        JOIN chunks c ON c.id = ce.chunk_id
        WHERE ce.embedding MATCH ? AND k = ?
          AND c.source IN (${placeholders})
        ORDER BY ce.distance
      `;
			params = [queryBuf, topK, ...sourceFilter];
		} else {
			sql = `
        SELECT ce.chunk_id, ce.distance, c.*
        FROM chunk_embeddings ce
        JOIN chunks c ON c.id = ce.chunk_id
        WHERE ce.embedding MATCH ? AND k = ?
        ORDER BY ce.distance
      `;
			params = [queryBuf, topK];
		}

		const rows = this.db.prepare(sql).all(...params) as any[];
		return rows.map((row: any) => ({
			chunk: this.rowToChunk(row),
			distance: row.distance,
		}));
	}

	// ── Utilities ──

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

	private float32ArrayToBuffer(arr: number[]): Buffer {
		const float32 = new Float32Array(arr);
		return Buffer.from(float32.buffer);
	}
}
