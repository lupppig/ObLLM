# How to Test ObLLM Locally

Since ObLLM is a local-first Obsidian plugin, testing it requires building the code and loading it into a real Obsidian vault. Here is the step-by-step workflow:

## 1. Prerequisites
- **Node.js** (v18+)
- **Obsidian** (Installed on your machine)
- A **Test Vault** (Create a new empty vault or use a copy of an existing one. **Do not use your primary vault for dev testing.**)

## 2. One-Time Setup
1.  Open your terminal in the `ObLLM` project root.
2.  Install dependencies:
    ```bash
    npm install
    ```
3.  **Link the Plugin**: You need to copy the built files to your test vault's plugin directory.
    - Path: `<VaultFolder>/.obsidian/plugins/obllm/`
    - You can create a symlink or manually copy.
    - *Tip:* Create a script or use `cp` to copy `main.js`, `manifest.json`, `styles.css`, and `sqlite3.wasm` to that folder.

## 3. The Dev Cycle (Build & Reload)

### Step A: Build the Code
Run the build command to compile TypeScript into `main.js`:
```bash
npm run build
```
*Wait for it to finish. It should say "Build ended with..."*

### Step B: Install in Vault
Copy the generated files to your test vault:
```bash
# Example copy command (adjust path to YOUR vault)
cp main.js manifest.json styles.css sqlite3.wasm /path/to/TestVault/.obsidian/plugins/obllm/
```

### Step C: Reload in Obsidian
1.  Open Obsidian.
2.  Go to **Settings > Community Plugins**.
3.  Refresh the list and ensure **ObLLM** is toggled **ON**.
4.  **Important**: Whenever you re-build, you must **Reload the Plugin**:
    - Open Command Palette (`Ctrl/Cmd + P`).
    - Type: `Reload app without saving` (reloads entire window).
    - OR: Toggle the plugin OFF and then ON again in settings.

## 4. Verification Checklist
Once reloaded, check these 3 things to confirm your code is active:
1.  **Version Tag**: Open the chat view. Does the version number match your `package.json`? (e.g., `v0.1.8-SECURE`).
2.  **Console Logs**: Open Developer Tools (`Ctrl/Cmd + Shift + I`). Look for `ObLLM: Loading plugin...`.
3.  **Functionality**:
    - Click the **Stethoscope (🩺)** to test health.
    - Type "hi" to test the LLM connection.
    - Type "research [topic]" to test the RAG pipeline.

## 5. Troubleshooting
- **"Plugin failed to load"**: Check the Console (`Ctrl+Shift+I`) for errors. Usually missing `sqlite3.wasm` or a syntax error.
- **Changes not showing?**: You probably forgot to copy the new `main.js` to the vault, or forgot to reload the plugin.
