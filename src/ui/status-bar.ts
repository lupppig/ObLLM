import type ObLLMPlugin from '../main';

export class StatusBarManager {
	private statusBarEl: HTMLElement;
	private plugin: ObLLMPlugin;

	constructor(plugin: ObLLMPlugin, statusBarEl: HTMLElement) {
		this.plugin = plugin;
		this.statusBarEl = statusBarEl;
		this.update('ObLLM: Ready');
	}

	update(text: string) {
		this.statusBarEl.setText(text);
	}

	showIndexing(current: number, total: number) {
		this.update(`ObLLM: Indexing ${current}/${total}`);
	}

	showReady(chunkCount: number) {
		this.update(`ObLLM: ${chunkCount} chunks indexed`);
	}

	showError(message: string) {
		this.update(`ObLLM: ⚠ ${message}`);
	}
}
