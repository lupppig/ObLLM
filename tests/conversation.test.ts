import { describe, it, expect } from 'vitest';
import { ConversationHistory } from '../src/ui/conversation';

describe('ConversationHistory', () => {
	it('starts empty', () => {
		const history = new ConversationHistory();
		expect(history.length).toBe(0);
		expect(history.getMessages()).toEqual([]);
	});

	it('adds messages', () => {
		const history = new ConversationHistory();
		history.add('user', 'Hello');
		history.add('assistant', 'Hi there!');

		expect(history.length).toBe(2);
		const msgs = history.getMessages();
		expect(msgs[0]).toEqual({ role: 'user', content: 'Hello' });
		expect(msgs[1]).toEqual({ role: 'assistant', content: 'Hi there!' });
	});

	it('formats for prompt', () => {
		const history = new ConversationHistory();
		history.add('user', 'What is AI?');
		history.add('assistant', 'AI is artificial intelligence.');

		const formatted = history.formatForPrompt();
		expect(formatted).toContain('User: What is AI?');
		expect(formatted).toContain('Assistant: AI is artificial intelligence.');
	});

	it('returns empty string when no messages', () => {
		const history = new ConversationHistory();
		expect(history.formatForPrompt()).toBe('');
	});

	it('trims old messages when exceeding token limit', () => {
		// Small limit: ~100 tokens * 4 chars = 400 char limit
		const history = new ConversationHistory(100);

		// Add messages that exceed the limit
		for (let i = 0; i < 20; i++) {
			history.add('user', `Question ${i}: ${'x'.repeat(50)}`);
			history.add('assistant', `Answer ${i}: ${'y'.repeat(50)}`);
		}

		// Should have trimmed old messages
		expect(history.length).toBeLessThan(40);
		// Should keep at least 2 messages
		expect(history.length).toBeGreaterThanOrEqual(2);
	});

	it('clears all messages', () => {
		const history = new ConversationHistory();
		history.add('user', 'Hello');
		history.add('assistant', 'Hi');
		history.clear();
		expect(history.length).toBe(0);
	});

	it('returns a copy of messages', () => {
		const history = new ConversationHistory();
		history.add('user', 'Test');
		const msgs = history.getMessages();
		msgs.push({ role: 'assistant', content: 'Injected' });
		expect(history.length).toBe(1);
	});
});
