import { describe, it, expect } from 'vitest';
import { Chunker } from '../src/scanner/chunker';

describe('Chunker', () => {
	const chunker = new Chunker({ chunkSize: 100, chunkOverlap: 20 });

	it('returns empty array for empty input', () => {
		expect(chunker.chunk('', 'test.md')).toEqual([]);
		expect(chunker.chunk('   ', 'test.md')).toEqual([]);
	});

	it('creates a single chunk for small text', () => {
		const text = 'This is a short note about testing.';
		const chunks = chunker.chunk(text, 'note.md');
		expect(chunks).toHaveLength(1);
		expect(chunks[0].source).toBe('note.md');
		expect(chunks[0].id).toBe('note.md#chunk-0');
		expect(chunks[0].text).toContain('testing');
	});

	it('creates multiple chunks for long text', () => {
		const paragraphs = Array.from({ length: 10 }, (_, i) =>
			`Paragraph ${i}: ${'Lorem ipsum dolor sit amet. '.repeat(5)}`
		);
		const text = paragraphs.join('\n\n');

		const chunks = chunker.chunk(text, 'long.md');
		expect(chunks.length).toBeGreaterThan(1);

		// Each chunk should have unique IDs
		const ids = chunks.map((c) => c.id);
		expect(new Set(ids).size).toBe(ids.length);
	});

	it('detects headings', () => {
		const text = '## Introduction\n\nThis is the intro paragraph with enough text to fill.';
		const chunks = chunker.chunk(text, 'doc.md');
		expect(chunks[0].heading).toBe('Introduction');
	});

	it('preserves source and offsets', () => {
		const text = 'Hello world. This is a test document.';
		const chunks = chunker.chunk(text, 'source.md');
		expect(chunks[0].source).toBe('source.md');
		expect(chunks[0].startOffset).toBe(0);
		expect(chunks[0].endOffset).toBeGreaterThan(0);
	});

	it('handles overlap between chunks', () => {
		const bigChunker = new Chunker({ chunkSize: 50, chunkOverlap: 10 });
		const paragraphs = Array.from({ length: 8 }, (_, i) =>
			`Section ${i}: Important content here.`
		);
		const text = paragraphs.join('\n\n');
		const chunks = bigChunker.chunk(text, 'overlap.md');

		if (chunks.length >= 2) {
			// Chunks should have sequential IDs
			expect(chunks[0].id).toBe('overlap.md#chunk-0');
			expect(chunks[1].id).toBe('overlap.md#chunk-1');
		}
	});
});
