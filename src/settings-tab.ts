import { App, Plugin, PluginSettingTab, Setting } from 'obsidian';
import type { ObLLMSettings } from './settings';

interface SettingsHost {
	settings: ObLLMSettings;
	saveSettings(): Promise<void>;
}

export class ObLLMSettingTab extends PluginSettingTab {
	private host: SettingsHost;

	constructor(app: App, plugin: Plugin & SettingsHost) {
		super(app, plugin);
		this.host = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		containerEl.createEl('h2', { text: 'LLM Provider' });

		new Setting(containerEl)
			.setName('Provider')
			.setDesc('Choose the LLM provider to use for generation.')
			.addDropdown((dropdown) =>
				dropdown
					.addOption('gemini', 'Gemini AI')
					.addOption('openai', 'OpenAI')
					.addOption('custom', 'Custom')
					.setValue(this.host.settings.llmProvider)
					.onChange(async (value) => {
						this.host.settings.llmProvider = value as any;
						await this.host.saveSettings();
						this.display();
					})
			);

		new Setting(containerEl)
			.setName('API Key')
			.setDesc('Your API key for the selected provider.')
			.addText((text) => {
				text.inputEl.type = 'password';
				text.setPlaceholder('Enter API key...')
					.setValue(this.host.settings.apiKey)
					.onChange(async (value) => {
						this.host.settings.apiKey = value;
						await this.host.saveSettings();
					});
			});

		new Setting(containerEl)
			.setName('API Base URL')
			.setDesc('Base URL for the API. Change only for custom endpoints.')
			.addText((text) =>
				text
					.setPlaceholder('https://generativelanguage.googleapis.com')
					.setValue(this.host.settings.apiBaseUrl)
					.onChange(async (value) => {
						this.host.settings.apiBaseUrl = value;
						await this.host.saveSettings();
					})
			);



		new Setting(containerEl)
			.setName('Model')
			.setDesc('Model name to use for generation.')
			.addText((text) =>
				text
					.setPlaceholder('gemini-2.0-flash')
					.setValue(this.host.settings.model)
					.onChange(async (value) => {
						this.host.settings.model = value;
						await this.host.saveSettings();
					})
			);

		containerEl.createEl('h2', { text: 'Embeddings' });

		new Setting(containerEl)
			.setName('Embedding Provider')
			.setDesc('Provider for generating text embeddings.')
			.addDropdown((dropdown) =>
				dropdown
					.addOption('gemini', 'Gemini AI')
					.addOption('openai', 'OpenAI')
					.addOption('none', 'None (keyword only)')
					.setValue(this.host.settings.embeddingProvider)
					.onChange(async (value) => {
						this.host.settings.embeddingProvider = value as any;
						await this.host.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName('Embedding Model')
			.setDesc('Model to use for embeddings.')
			.addText((text) =>
				text
					.setPlaceholder('text-embedding-004')
					.setValue(this.host.settings.embeddingModel)
					.onChange(async (value) => {
						this.host.settings.embeddingModel = value;
						await this.host.saveSettings();
					})
			);

		containerEl.createEl('h2', { text: 'Vault Scanning' });

		new Setting(containerEl)
			.setName('Indexed Folders')
			.setDesc('Comma-separated list of folders to index. Leave empty to index the entire vault.')
			.addText((text) =>
				text
					.setPlaceholder('e.g. Notes, Research, Books')
					.setValue(this.host.settings.indexedFolders.join(', '))
					.onChange(async (value) => {
						this.host.settings.indexedFolders = value
							.split(',')
							.map((s) => s.trim())
							.filter((s) => s.length > 0);
						await this.host.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName('Excluded Folders')
			.setDesc('Comma-separated list of folders to skip.')
			.addText((text) =>
				text
					.setPlaceholder('e.g. Templates, Archive')
					.setValue(this.host.settings.excludedFolders.join(', '))
					.onChange(async (value) => {
						this.host.settings.excludedFolders = value
							.split(',')
							.map((s) => s.trim())
							.filter((s) => s.length > 0);
						await this.host.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName('Supported File Types')
			.setDesc('Comma-separated extensions to process.')
			.addText((text) =>
				text
					.setPlaceholder('.md, .pdf')
					.setValue(this.host.settings.supportedExtensions.join(', '))
					.onChange(async (value) => {
						this.host.settings.supportedExtensions = value
							.split(',')
							.map((s) => s.trim())
							.filter((s) => s.length > 0);
						await this.host.saveSettings();
					})
			);

		containerEl.createEl('h2', { text: 'Retrieval' });

		new Setting(containerEl)
			.setName('Retrieval Method')
			.setDesc('How to find relevant chunks for your queries.')
			.addDropdown((dropdown) =>
				dropdown
					.addOption('keyword', 'Keyword (TF-IDF)')
					.addOption('embedding', 'Embedding (Vector)')
					.addOption('hybrid', 'Hybrid')
					.setValue(this.host.settings.retrievalMethod)
					.onChange(async (value) => {
						this.host.settings.retrievalMethod = value as any;
						await this.host.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName('Max Context Chunks')
			.setDesc('Maximum number of chunks to include in LLM context.')
			.addText((text) =>
				text
					.setPlaceholder('10')
					.setValue(String(this.host.settings.maxChunks))
					.onChange(async (value) => {
						const num = parseInt(value, 10);
						if (!isNaN(num) && num > 0) {
							this.host.settings.maxChunks = num;
							await this.host.saveSettings();
						}
					})
			);

		new Setting(containerEl)
			.setName('Chunk Size (tokens)')
			.setDesc('Approximate number of tokens per chunk.')
			.addText((text) =>
				text
					.setPlaceholder('512')
					.setValue(String(this.host.settings.chunkSize))
					.onChange(async (value) => {
						const num = parseInt(value, 10);
						if (!isNaN(num) && num > 0) {
							this.host.settings.chunkSize = num;
							await this.host.saveSettings();
						}
					})
			);

		new Setting(containerEl)
			.setName('Chunk Overlap (tokens)')
			.setDesc('Overlap between consecutive chunks for context continuity.')
			.addText((text) =>
				text
					.setPlaceholder('64')
					.setValue(String(this.host.settings.chunkOverlap))
					.onChange(async (value) => {
						const num = parseInt(value, 10);
						if (!isNaN(num) && num >= 0) {
							this.host.settings.chunkOverlap = num;
							await this.host.saveSettings();
						}
					})
			);

		containerEl.createEl('h2', { text: 'Text-to-Speech' });

		new Setting(containerEl)
			.setName('TTS Engine')
			.setDesc('Engine for audio overview generation.')
			.addDropdown((dropdown) =>
				dropdown
					.addOption('browser', 'Browser (free, built-in)')
					.addOption('gemini', 'Gemini TTS')
					.addOption('openai', 'OpenAI TTS')
					.setValue(this.host.settings.ttsProvider)
					.onChange(async (value) => {
						this.host.settings.ttsProvider = value as any;
						await this.host.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName('TTS Voice')
			.setDesc('Voice name. Browser: system voice name. Gemini: Kore, Puck, etc. OpenAI: alloy, echo, fable, nova, onyx, shimmer.')
			.addText((text) =>
				text
					.setPlaceholder('Leave empty for default')
					.setValue(this.host.settings.ttsVoice)
					.onChange(async (value) => {
						this.host.settings.ttsVoice = value;
						await this.host.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName('TTS Speed')
			.setDesc('Playback speed (0.5 to 2.0).')
			.addText((text) =>
				text
					.setPlaceholder('1.0')
					.setValue(String(this.host.settings.ttsSpeed))
					.onChange(async (value) => {
						const num = parseFloat(value);
						if (!isNaN(num) && num >= 0.5 && num <= 2.0) {
							this.host.settings.ttsSpeed = num;
							await this.host.saveSettings();
						}
					})
			);
	}
}
