export class StatusBarManager {
	private statusBarEl: HTMLElement;

	constructor(statusBarEl: HTMLElement) {
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
