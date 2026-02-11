import type { ScoredChunk } from '../retrieval/retriever';
import type { ConversationHistory } from '../ui/conversation';

export type PromptTemplate = 'qa' | 'summary' | 'audio' | 'explain' | 'study-guide' | 'faq' | 'briefing' | 'ideation';

export class PromptBuilder {
	buildPrompt(template: PromptTemplate, query: string, chunks: ScoredChunk[]): string {
		const sources = this.formatSources(chunks);

		switch (template) {
			case 'qa':
				return this.qaPrompt(query, sources);
			case 'summary':
				return this.summaryPrompt(sources);
			case 'audio':
				return this.audioPrompt(sources);
			case 'explain':
				return this.explainPrompt(sources);
			case 'study-guide':
				return this.studyGuidePrompt(sources);
			case 'faq':
				return this.faqPrompt(sources);
			case 'briefing':
				return this.briefingPrompt(sources);
			case 'ideation':
				return this.ideationPrompt(sources);
		}
	}

	buildConversationPrompt(
		query: string,
		chunks: ScoredChunk[],
		history: ConversationHistory
	): string {
		const sources = chunks.length > 0 ? this.formatSources(chunks) : 'No specific notes found for this query.';
		const conversationContext = history.formatForPrompt();

		return [
			'You are ObLLM, a proactive AI research agent living inside the user\'s Obsidian vault.',
			'Your goal is to be a natural collaborator who curates and implements research.',
			'',
			'Core Behaviors:',
			'1. Context: ALWAYS ground answers in the provided notes, citing with [number].',
			'2. Naturalness: Respond naturally to greetings (e.g., "hi", "how are you").',
			'3. Proactive Research: If asked to research a topic, suggest a plan first.',
			'4. Agency (Implement): You can suggest creating new notes. When you want to propose a new note to the user, use this exact format at the END of your message:',
			'',
			'```note',
			'Title: [Short Descriptive Title]',
			'Content: [The markdown content of the note]',
			'```',
			'',
			'Style: Intellectual curiosity. Suggest links between notes. Suggest new tags or folders.',
			'',
			...(conversationContext ? ['### Previous Conversation:', conversationContext, ''] : []),
			'### Contextual Notes:',
			sources,
			'',
			`User: ${query}`,
			'ObLLM:',
		].join('\n');
	}

	formatContext(chunks: ScoredChunk[]): string {
		return this.formatSources(chunks);
	}

	private formatSources(chunks: ScoredChunk[]): string {
		return chunks
			.map((sc, i) => {
				const heading = sc.chunk.heading ? ` (${sc.chunk.heading})` : '';
				return `[${i + 1}] ${sc.chunk.source}${heading}\n${sc.chunk.text}`;
			})
			.join('\n\n');
	}

	private qaPrompt(query: string, sources: string): string {
		return [
			'You are ObLLM, a research agent.',
			'Answer the following question using the user\'s notes as context. If the answer is in the notes, ALWAYS cite them using [number].',
			'If the answer is not in the notes, provide a helpful general response and explain how it might relate to their existing knowledge.',
			'Never simply say "I don\'t know" for greetings or common questions.',
			'',
			`Question: ${query}`,
			'',
			'### Related Notes:',
			sources || 'No relevant notes found in vault.',
			'',
			'ObLLM:',
		].join('\n');
	}

	private summaryPrompt(sources: string): string {
		return [
			'You are a note summarizer.',
			'Summarize the following notes in a concise, readable markdown format.',
			'Include headings, bullet points, and citations using [number].',
			'',
			'Sources:',
			sources,
		].join('\n');
	}

	private audioPrompt(sources: string): string {
		return [
			'You are an AI narrator.',
			'Convert the following notes into a podcast-style script.',
			'Use simple language, explain clearly, and include citations as [number].',
			'',
			'Sources:',
			sources,
		].join('\n');
	}

	private explainPrompt(sources: string): string {
		return [
			'You are a knowledgeable tutor.',
			'Explain the following note in detail. Break down complex concepts,',
			'provide context, and highlight key takeaways.',
			'Use clear headings and cite specific parts using [number].',
			'',
			'Note contents:',
			sources,
		].join('\n');
	}

	private studyGuidePrompt(sources: string): string {
		return [
			'You are an academic study guide creator.',
			'Create a comprehensive study guide from the following notes.',
			'Include:',
			'1. **Key Concepts** — definitions and explanations',
			'2. **Important Details** — facts, dates, figures',
			'3. **Connections** — how concepts relate to each other',
			'4. **Review Questions** — 5-10 self-test questions with brief answers',
			'',
			'Cite all facts using [number]. Format in clean markdown.',
			'',
			'Sources:',
			sources,
		].join('\n');
	}

	private faqPrompt(sources: string): string {
		return [
			'You are a FAQ generator.',
			'Based on the following notes, create a comprehensive FAQ document.',
			'Generate 8-12 questions and answers that cover the most important topics.',
			'Questions should be natural and varied in complexity.',
			'Answers should be concise but thorough, citing sources using [number].',
			'',
			'Format each as:',
			'### Q: [question]',
			'**A:** [answer with citations]',
			'',
			'Sources:',
			sources,
		].join('\n');
	}

	private briefingPrompt(sources: string): string {
		return [
			'You are an executive briefing writer.',
			'Create a concise briefing document from the following notes.',
			'Structure:',
			'1. **Executive Summary** — 2-3 sentence overview',
			'2. **Key Findings** — the most important points',
			'3. **Action Items** — what decisions or next steps are implied',
			'4. **Supporting Details** — additional context',
			'',
			'Keep it professional and cite sources using [number].',
			'',
			'Sources:',
			sources,
		].join('\n');
	}

	private ideationPrompt(sources: string): string {
		return [
			'You are a creative research assistant.',
			'Analyze the following notes and:',
			'1. **Identify Trends** — patterns and recurring themes',
			'2. **Suggest Ideas** — project ideas, experiments, or directions to explore',
			'3. **Open Questions** — research questions worth investigating',
			'4. **Connections** — unexpected links between different topics',
			'',
			'Be creative but grounded. Cite sources using [number].',
			'',
			'Sources:',
			sources,
		].join('\n');
	}
}
