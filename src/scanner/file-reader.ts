export interface FileReaderResult {
	text: string;
	headings: string[];
}

export interface IFileReader {
	read(content: string | ArrayBuffer): Promise<FileReaderResult>;
}

export class MarkdownReader implements IFileReader {
	async read(content: string | ArrayBuffer): Promise<FileReaderResult> {
		let text = typeof content === 'string' ? content : new TextDecoder().decode(content);

		const frontmatterMatch = text.match(/^---\n[\s\S]*?\n---\n/);
		if (frontmatterMatch) {
			text = text.slice(frontmatterMatch[0].length);
		}

		const headings: string[] = [];
		const headingRegex = /^(#{1,6})\s+(.+)$/gm;
		let match;
		while ((match = headingRegex.exec(text)) !== null) {
			headings.push(match[2].trim());
		}

		return { text: text.trim(), headings };
	}
}

export class PdfReader implements IFileReader {
	async read(content: string | ArrayBuffer): Promise<FileReaderResult> {
		let pdfParse: any;
		try {
			pdfParse = require('pdf-parse');
		} catch {
			throw new Error('pdf-parse is not available. Install it with: pnpm add pdf-parse');
		}

		const buffer = content instanceof ArrayBuffer ? Buffer.from(content) : Buffer.from(content, 'binary');
		const data = await pdfParse(buffer);

		return {
			text: data.text?.trim() ?? '',
			headings: [],
		};
	}
}

export function getFileReader(extension: string): IFileReader {
	switch (extension.toLowerCase()) {
		case '.md':
		case 'md':
			return new MarkdownReader();
		case '.pdf':
		case 'pdf':
			return new PdfReader();
		default:
			return new MarkdownReader();
	}
}
