import { describe, it, expect } from 'vitest';
import { PromptBuilder } from '../src/prompt/prompt-builder';
import type { ScoredChunk } from '../src/retrieval/retriever';
import { ConversationHistory } from '../src/ui/conversation';

const mockChunks: ScoredChunk[] = [
	{
		chunk: {
			id: 'note1.md#chunk-0',
			text: 'Machine learning is a subset of AI.',
			source: 'note1.md',
			heading: 'Introduction',
			startOffset: 0,
			endOffset: 35,
		},
		score: 0.9,
	},
	{
		chunk: {
			id: 'note2.md#chunk-0',
			text: 'Neural networks are inspired by the brain.',
			source: 'note2.md',
			startOffset: 0,
			endOffset: 43,
		},
		score: 0.8,
	},
];

describe('PromptBuilder', () => {
	const builder = new PromptBuilder();

	it('builds QA prompt with question and sources', () => {
		const prompt = builder.buildPrompt('qa', 'What is ML?', mockChunks);
		expect(prompt).toContain('What is ML?');
		expect(prompt).toContain('Machine learning');
		expect(prompt).toContain('[1]');
		expect(prompt).toContain('[2]');
	});

	it('builds summary prompt', () => {
		const prompt = builder.buildPrompt('summary', '', mockChunks);
		expect(prompt).toContain('summarize');
		expect(prompt).toContain('Machine learning');
	});

	it('builds audio prompt', () => {
		const prompt = builder.buildPrompt('audio', '', mockChunks);
		expect(prompt).toContain('narrator');
		expect(prompt).toContain('Machine learning');
	});

	it('builds explain prompt', () => {
		const prompt = builder.buildPrompt('explain', '', mockChunks);
		expect(prompt).toContain('tutor');
	});

	it('builds study-guide prompt', () => {
		const prompt = builder.buildPrompt('study-guide', '', mockChunks);
		expect(prompt).toContain('Key Concepts');
		expect(prompt).toContain('Review Questions');
	});

	it('builds faq prompt', () => {
		const prompt = builder.buildPrompt('faq', '', mockChunks);
		expect(prompt).toContain('FAQ');
	});

	it('builds briefing prompt', () => {
		const prompt = builder.buildPrompt('briefing', '', mockChunks);
		expect(prompt).toContain('Executive Summary');
	});

	it('builds ideation prompt', () => {
		const prompt = builder.buildPrompt('ideation', '', mockChunks);
		expect(prompt).toContain('Identify Trends');
		expect(prompt).toContain('Suggest Ideas');
	});

	it('includes heading in source formatting', () => {
		const prompt = builder.buildPrompt('qa', 'test', mockChunks);
		expect(prompt).toContain('(Introduction)');
	});

	it('builds conversation prompt with history', () => {
		const history = new ConversationHistory();
		history.add('user', 'Previous question');
		history.add('assistant', 'Previous answer');

		const prompt = builder.buildConversationPrompt('Follow up?', mockChunks, history);
		expect(prompt).toContain('Previous question');
		expect(prompt).toContain('Previous answer');
		expect(prompt).toContain('Follow up?');
		expect(prompt).toContain('Machine learning');
	});

	it('formats context with numbered sources', () => {
		const context = builder.formatContext(mockChunks);
		expect(context).toContain('[1]');
		expect(context).toContain('[2]');
		expect(context).toContain('note1.md');
		expect(context).toContain('note2.md');
	});
});
