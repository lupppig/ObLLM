import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { VectorDB } from '../src/storage/db';
import { IndexStore } from '../src/retrieval/index-store';
import type { Chunk } from '../src/scanner/chunker';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const testChunks: Chunk[] = [
	{ id: 'file1.md#chunk-0', text: 'First chunk content.', source: 'file1.md', heading: 'Intro', startOffset: 0, endOffset: 20 },
	{ id: 'file1.md#chunk-1', text: 'Second chunk content.', source: 'file1.md', startOffset: 21, endOffset: 42 },
	{ id: 'file2.md#chunk-0', text: 'Another file chunk.', source: 'file2.md', startOffset: 0, endOffset: 19 },
];

describe('IndexStore (SQLite)', () => {
	let db: VectorDB;
	let store: IndexStore;
	let dbPath: string;

	beforeEach(() => {
		dbPath = path.join(os.tmpdir(), `obllm-test-${Date.now()}.db`);
		// Use the project root (relative to tests/) to find node_modules
		const projectRoot = path.join(__dirname, '..');
		db = new VectorDB(projectRoot, 768, dbPath);
		store = new IndexStore(db);
	});

	afterEach(() => {
		db.close();
		try { fs.unlinkSync(dbPath); } catch { /* ignore */ }
	});

	it('starts with zero chunks', () => {
		expect(store.chunkCount).toBe(0);
		expect(store.getAllChunks()).toEqual([]);
	});

	it('adds and retrieves chunks', () => {
		store.addChunks(testChunks.slice(0, 2), 'file1.md', 1000);
		expect(store.chunkCount).toBe(2);

		const all = store.getAllChunks();
		expect(all).toHaveLength(2);
		expect(all[0].id).toBe('file1.md#chunk-0');
	});

	it('retrieves chunk by ID', () => {
		store.addChunks(testChunks, 'file1.md', 1000);
		const chunk = store.getChunkById('file1.md#chunk-0');
		expect(chunk).toBeDefined();
		expect(chunk!.text).toBe('First chunk content.');
	});

	it('returns undefined for missing chunk', () => {
		expect(store.getChunkById('nonexistent')).toBeUndefined();
	});

	it('retrieves chunks by source', () => {
		store.addChunks(testChunks.slice(0, 2), 'file1.md', 1000);
		store.addChunks([testChunks[2]], 'file2.md', 1000);

		const file1Chunks = store.getChunksBySource('file1.md');
		expect(file1Chunks).toHaveLength(2);

		const file2Chunks = store.getChunksBySource('file2.md');
		expect(file2Chunks).toHaveLength(1);
	});

	it('removes chunks for a file', () => {
		store.addChunks(testChunks.slice(0, 2), 'file1.md', 1000);
		store.addChunks([testChunks[2]], 'file2.md', 1000);

		store.removeChunksForFile('file1.md');
		expect(store.chunkCount).toBe(1);
		expect(store.getAllChunks()[0].source).toBe('file2.md');
	});

	it('tracks file timestamps', () => {
		store.addChunks(testChunks.slice(0, 2), 'file1.md', 12345);
		expect(store.getFileTimestamp('file1.md')).toBe(12345);
		expect(store.getFileTimestamp('nonexistent.md')).toBeUndefined();
	});

	it('replaces chunks when re-adding for same file', () => {
		store.addChunks(testChunks.slice(0, 2), 'file1.md', 1000);
		expect(store.chunkCount).toBe(2);

		const updated: Chunk[] = [
			{ id: 'file1.md#chunk-0', text: 'Updated content.', source: 'file1.md', startOffset: 0, endOffset: 16 },
		];
		store.addChunks(updated, 'file1.md', 2000);
		expect(store.chunkCount).toBe(1);
		expect(store.getAllChunks()[0].text).toBe('Updated content.');
	});

	it('clears all data', () => {
		store.addChunks(testChunks, 'file1.md', 1000);
		store.clear();
		expect(store.chunkCount).toBe(0);
	});

	it('persists data across IndexStore instances', () => {
		store.addChunks(testChunks.slice(0, 2), 'file1.md', 1000);

		// Close and reopen
		db.close();
		const projectRoot = path.join(__dirname, '..');
		const db2 = new VectorDB(projectRoot, 768, dbPath);
		const store2 = new IndexStore(db2);

		expect(store2.chunkCount).toBe(2);
		expect(store2.getChunkById('file1.md#chunk-0')?.text).toBe('First chunk content.');

		db2.close();
		// Re-assign for afterEach cleanup
		db = new VectorDB(projectRoot, 768, dbPath);
		store = new IndexStore(db);
	});
});
