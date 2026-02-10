import { App, TFile } from 'obsidian';
import type { ObLLMSettings } from '../settings';

export interface FileInfo {
	path: string;
	extension: string;
	mtime: number;
	size: number;
}

export class VaultScanner {
	private app: App;
	private settings: ObLLMSettings;

	constructor(app: App, settings: ObLLMSettings) {
		this.app = app;
		this.settings = settings;
	}

	getFiles(): FileInfo[] {
		return this.app.vault.getFiles()
			.filter((file) => this.isSupported(file))
			.map((file) => ({
				path: file.path,
				extension: file.extension,
				mtime: file.stat.mtime,
				size: file.stat.size,
			}));
	}

	getModifiedSince(sinceMs: number): FileInfo[] {
		return this.getFiles().filter((f) => f.mtime > sinceMs);
	}

	async readFileContent(path: string): Promise<string> {
		const file = this.app.vault.getAbstractFileByPath(path);
		if (!file || !(file instanceof TFile)) {
			throw new Error(`File not found: ${path}`);
		}
		return this.app.vault.cachedRead(file);
	}

	async readFileBinary(path: string): Promise<ArrayBuffer> {
		const file = this.app.vault.getAbstractFileByPath(path);
		if (!file || !(file instanceof TFile)) {
			throw new Error(`File not found: ${path}`);
		}
		return this.app.vault.readBinary(file);
	}

	private isSupported(file: TFile): boolean {
		const ext = '.' + file.extension;
		if (!this.settings.supportedExtensions.includes(ext)) {
			return false;
		}

		for (const excluded of this.settings.excludedFolders) {
			if (file.path.startsWith(excluded + '/') || file.path.startsWith(excluded + '\\')) {
				return false;
			}
		}

		if (this.settings.indexedFolders.length > 0) {
			const inIndexed = this.settings.indexedFolders.some(
				(folder) => file.path.startsWith(folder + '/') || file.path.startsWith(folder + '\\')
			);
			if (!inIndexed) return false;
		}

		return true;
	}
}
