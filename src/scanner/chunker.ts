export interface Chunk {
	id: string;
	text: string;
	source: string;
	heading?: string;
	startOffset: number;
	endOffset: number;
}

export interface ChunkerOptions {
	chunkSize: number;
	chunkOverlap: number;
}

export class Chunker {
	private options: ChunkerOptions;

	constructor(options: ChunkerOptions) {
		this.options = options;
	}

	chunk(text: string, source: string, headings?: string[]): Chunk[] {
		if (!text || text.trim().length === 0) {
			return [];
		}

		const chunks: Chunk[] = [];
		const paragraphs = this.splitIntoParagraphs(text);

		let currentChunkParts: string[] = [];
		let currentLength = 0;
		let startOffset = 0;
		let chunkIndex = 0;
		let currentHeading: string | undefined;

		for (const para of paragraphs) {
			const headingMatch = para.match(/^#{1,6}\s+(.+)$/);
			if (headingMatch) {
				currentHeading = headingMatch[1].trim();
			}

			if (currentLength + para.length > this.options.chunkSize && currentChunkParts.length > 0) {
				const chunkText = currentChunkParts.join('\n\n');
				chunks.push({
					id: `${source}#chunk-${chunkIndex}`,
					text: chunkText,
					source,
					heading: currentHeading,
					startOffset,
					endOffset: startOffset + chunkText.length,
				});
				chunkIndex++;

				const overlapParts: string[] = [];
				let overlapLen = 0;
				for (let i = currentChunkParts.length - 1; i >= 0; i--) {
					if (overlapLen + currentChunkParts[i].length <= this.options.chunkOverlap) {
						overlapParts.unshift(currentChunkParts[i]);
						overlapLen += currentChunkParts[i].length;
					} else {
						break;
					}
				}

				startOffset = startOffset + chunkText.length - overlapLen;
				currentChunkParts = [...overlapParts];
				currentLength = overlapLen;
			}

			currentChunkParts.push(para);
			currentLength += para.length;
		}

		if (currentChunkParts.length > 0) {
			const chunkText = currentChunkParts.join('\n\n');
			chunks.push({
				id: `${source}#chunk-${chunkIndex}`,
				text: chunkText,
				source,
				heading: currentHeading,
				startOffset,
				endOffset: startOffset + chunkText.length,
			});
		}

		return chunks;
	}

	private splitIntoParagraphs(text: string): string[] {
		const raw = text.split(/\n\s*\n/);
		const result: string[] = [];

		for (const block of raw) {
			const trimmed = block.trim();
			if (trimmed.length === 0) continue;

			if (trimmed.length <= this.options.chunkSize) {
				result.push(trimmed);
			} else {
				const sentences = trimmed.match(/[^.!?]+[.!?]+[\s]*/g) || [trimmed];
				let current = '';
				for (const sentence of sentences) {
					if (current.length + sentence.length > this.options.chunkSize && current.length > 0) {
						result.push(current.trim());
						current = '';
					}
					current += sentence;
				}
				if (current.trim().length > 0) {
					result.push(current.trim());
				}
			}
		}

		return result;
	}
}
