import { App, PluginSettingTab, Setting } from 'obsidian';
import type ObLLMPlugin from './main';

export class ObLLMSettingTab extends PluginSettingTab {
	plugin: ObLLMPlugin;

	constructor(app: App, plugin: ObLLMPlugin) {
		super(app, plugin);
		this.plugin = plugin;
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
					.addOption('ollama', 'Ollama')
					.addOption('custom', 'Custom')
					.setValue(this.plugin.settings.llmProvider)
					.onChange(async (value) => {
						this.plugin.settings.llmProvider = value as any;
						await this.plugin.saveSettings();
						this.display();
					})
			);

		new Setting(containerEl)
			.setName('API Key')
			.setDesc('Your API key for the selected provider.')
			.addText((text) =>
				text
					.setPlaceholder('Enter API key...')
					.setValue(this.plugin.settings.apiKey)
					.onChange(async (value) => {
						this.plugin.settings.apiKey = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName('API Base URL')
			.setDesc('Base URL for the API. Change only for custom endpoints.')
			.addText((text) =>
				text
					.setPlaceholder('https://generativelanguage.googleapis.com')
					.setValue(this.plugin.settings.apiBaseUrl)
					.onChange(async (value) => {
						this.plugin.settings.apiBaseUrl = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName('Model')
			.setDesc('Model name to use for generation.')
			.addText((text) =>
				text
					.setPlaceholder('gemini-2.5-flash')
					.setValue(this.plugin.settings.model)
					.onChange(async (value) => {
						this.plugin.settings.model = value;
						await this.plugin.saveSettings();
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
					.addOption('ollama', 'Ollama')
					.addOption('none', 'None (keyword only)')
					.setValue(this.plugin.settings.embeddingProvider)
					.onChange(async (value) => {
						this.plugin.settings.embeddingProvider = value as any;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName('Embedding Model')
			.setDesc('Model to use for embeddings.')
			.addText((text) =>
				text
					.setPlaceholder('gemini-embedding-001')
					.setValue(this.plugin.settings.embeddingModel)
					.onChange(async (value) => {
						this.plugin.settings.embeddingModel = value;
						await this.plugin.saveSettings();
					})
			);

		containerEl.createEl('h2', { text: 'Vault Scanning' });

		new Setting(containerEl)
			.setName('Indexed Folders')
			.setDesc('Comma-separated list of folders to index. Leave empty to index the entire vault.')
			.addText((text) =>
				text
					.setPlaceholder('e.g. Notes, Research, Books')
					.setValue(this.plugin.settings.indexedFolders.join(', '))
					.onChange(async (value) => {
						this.plugin.settings.indexedFolders = value
							.split(',')
							.map((s) => s.trim())
							.filter((s) => s.length > 0);
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName('Excluded Folders')
			.setDesc('Comma-separated list of folders to skip.')
			.addText((text) =>
				text
					.setPlaceholder('e.g. Templates, Archive')
					.setValue(this.plugin.settings.excludedFolders.join(', '))
					.onChange(async (value) => {
						this.plugin.settings.excludedFolders = value
							.split(',')
							.map((s) => s.trim())
							.filter((s) => s.length > 0);
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName('Supported File Types')
			.setDesc('Comma-separated extensions to process.')
			.addText((text) =>
				text
					.setPlaceholder('.md, .pdf')
					.setValue(this.plugin.settings.supportedExtensions.join(', '))
					.onChange(async (value) => {
						this.plugin.settings.supportedExtensions = value
							.split(',')
							.map((s) => s.trim())
							.filter((s) => s.length > 0);
						await this.plugin.saveSettings();
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
					.setValue(this.plugin.settings.retrievalMethod)
					.onChange(async (value) => {
						this.plugin.settings.retrievalMethod = value as any;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName('Max Context Chunks')
			.setDesc('Maximum number of chunks to include in LLM context.')
			.addText((text) =>
				text
					.setPlaceholder('10')
					.setValue(String(this.plugin.settings.maxChunks))
					.onChange(async (value) => {
						const num = parseInt(value, 10);
						if (!isNaN(num) && num > 0) {
							this.plugin.settings.maxChunks = num;
							await this.plugin.saveSettings();
						}
					})
			);

		new Setting(containerEl)
			.setName('Chunk Size (tokens)')
			.setDesc('Approximate number of tokens per chunk.')
			.addText((text) =>
				text
					.setPlaceholder('512')
					.setValue(String(this.plugin.settings.chunkSize))
					.onChange(async (value) => {
						const num = parseInt(value, 10);
						if (!isNaN(num) && num > 0) {
							this.plugin.settings.chunkSize = num;
							await this.plugin.saveSettings();
						}
					})
			);

		new Setting(containerEl)
			.setName('Chunk Overlap (tokens)')
			.setDesc('Overlap between consecutive chunks for context continuity.')
			.addText((text) =>
				text
					.setPlaceholder('64')
					.setValue(String(this.plugin.settings.chunkOverlap))
					.onChange(async (value) => {
						const num = parseInt(value, 10);
						if (!isNaN(num) && num >= 0) {
							this.plugin.settings.chunkOverlap = num;
							await this.plugin.saveSettings();
						}
					})
			);
	}
}
