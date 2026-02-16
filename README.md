# ObLLM — Obsidian LLM Plugin

A local-first AI research assistant for [Obsidian](https://obsidian.md). ObLLM indexes your vault, retrieves relevant context, and uses LLMs to answer questions, generate documents, and create audio overviews — all grounded in **your notes**.

## Features

| Feature | Description |
|---------|-------------|
| **Smart Q&A** | Ask questions answered from your notes with citation links |
| **Multi-turn Chat** | Conversational follow-ups with history |
| **Source Filtering** | Scope queries to specific notes via source pills |
| **Explain Note** | Get a plain-language explanation of the active note |
| **Suggested Questions** | Auto-generated questions from your indexed notes |
| **Study Guide** | Comprehensive study guide with key concepts and review questions |
| **FAQ** | Q&A document generated from your notes |
| **Briefing Doc** | Executive summary with action items |
| **Research Ideation** | Trends, connections, and research questions |
| **Audio Overview** | Podcast-style audio from notes (Browser, Gemini, or OpenAI TTS) |
| **Multi-source Combine** | Cross-reference insights across sources |
| **Stop Generation** | Cancel ongoing AI responses instantly |
| **Premium Audio UI** | Blinking microphone indicator during generation |

## Retrieval Methods

- **Keyword** — TF-IDF scoring (no API key needed)
- **Embedding** — Vector similarity via SQLite + sqlite-vec
- **Hybrid** — Combines both for best results

## Supported LLM Providers

| Provider | Text Generation | Embeddings | TTS |
|----------|:-:|:-:|:-:|
| Gemini | ✅ | ✅ | ✅ |
| OpenAI | ✅ | ✅ | ✅ |
| Custom | ✅ | — | — |

## Installation

1. Clone into your vault's `.obsidian/plugins/` directory:
   ```bash
   cd /path/to/vault/.obsidian/plugins
   git clone https://github.com/lupppig/ObLLM.git
   cd ObLLM
   
   # Enable pnpm via Node's corepack (recommended)
   corepack enable
   corepack prepare pnpm@latest --activate
   
   pnpm install
   pnpm run build
   ```
2. Restart Obsidian and enable **ObLLM** in Settings → Community Plugins.
3. Set your LLM provider and API key in the ObLLM settings tab.

## Settings

### LLM Provider
- **Provider** — Gemini, OpenAI, or Custom
- **API Key** — Your provider API key
- **Model** — Model name (e.g. `gemini-2.5-flash`)

### Embeddings
- **Embedding Provider** — Gemini, OpenAI, or None
- **Embedding Model** — e.g. `gemini-embedding-001`

### Vault Scanning
- **Indexed Folders** — Folders to include (empty = entire vault)
- **Excluded Folders** — Folders to skip
- **Supported Extensions** — `.md`, `.pdf`

### Retrieval
- **Method** — Keyword, Embedding, or Hybrid
- **Max Chunks** — Context window size
- **Chunk Size / Overlap** — Chunking parameters

### Text-to-Speech
- **TTS Engine** — Browser (free), Gemini, or OpenAI
- **Voice** — Voice name per engine
- **Speed** — 0.5x to 2.0x


## Development

```bash
pnpm install
pnpm run dev      # Watch mode
pnpm run build    # Production build
pnpm test         # Run tests (vitest)
```

## Troubleshooting

### pnpm Issues
If you encounter issues running `pnpm`, it is likely because it hasn't been enabled on your system. Since Node.js v16.13, `pnpm` is managed via `corepack`.

**Run these commands to enable it:**
```bash
corepack enable
corepack prepare pnpm@latest --activate
```

Alternatively, you can install it globally via npm:
```bash
npm install -g pnpm
```

## License

MIT
