import { describe, it, expect } from 'vitest';
import { CitationLinker } from '../src/prompt/citation-linker';
import type { ScoredChunk } from '../src/retrieval/retriever';

const chunks: ScoredChunk[] = [
	{
		chunk: {
			id: 'notes/ai.md#chunk-0',
			text: 'AI is intelligence demonstrated by machines.',
			source: 'notes/ai.md',
			heading: 'Definition',
			startOffset: 0,
			endOffset: 44,
		},
		score: 0.9,
	},
	{
		chunk: {
			id: 'research.md#chunk-0',
			text: 'Deep learning uses neural networks.',
			source: 'research.md',
			startOffset: 0,
			endOffset: 34,
		},
		score: 0.8,
	},
];

describe('CitationLinker', () => {
	const linker = new CitationLinker();

	it('converts [1] to wikilink with heading', () => {
		const result = linker.linkCitations('According to [1], AI is real.', chunks);
		expect(result).toBe('According to [[notes/ai#Definition|[1]]], AI is real.');
	});

	it('converts [2] to wikilink without heading', () => {
		const result = linker.linkCitations('See [2] for details.', chunks);
		expect(result).toBe('See [[research|[2]]] for details.');
	});

	it('handles multiple citations', () => {
		const result = linker.linkCitations('Sources [1] and [2] agree.', chunks);
		expect(result).toContain('[[notes/ai#Definition|[1]]]');
		expect(result).toContain('[[research|[2]]]');
	});

	it('leaves out-of-range citations unchanged', () => {
		const result = linker.linkCitations('See [3] and [0].', chunks);
		expect(result).toBe('See [3] and [0].');
	});

	it('handles text with no citations', () => {
		const result = linker.linkCitations('No citations here.', chunks);
		expect(result).toBe('No citations here.');
	});

	it('strips .md extension from note path', () => {
		const result = linker.linkCitations('[1]', chunks);
		expect(result).not.toContain('.md');
	});
});
