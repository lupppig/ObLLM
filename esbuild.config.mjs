import esbuild from "esbuild";
import process from "process";
import builtins from "builtin-modules";
import fs from "fs";
import path from "path";

const prod = process.argv[2] === "production";

// Helper to copy WASM file
const copyWasm = () => {
	const wasmSrc = path.join(process.cwd(), "node_modules/@sqliteai/sqlite-wasm/sqlite-wasm/jswasm/sqlite3.wasm");
	const wasmDest = path.join(process.cwd(), "sqlite3.wasm");
	console.log(`Checking for WASM at: ${wasmSrc}`);
	if (fs.existsSync(wasmSrc)) {
		fs.copyFileSync(wasmSrc, wasmDest);
		console.log(`Successfully copied sqlite3.wasm to ${wasmDest}`);
	} else {
		console.error(`WASM source not found: ${wasmSrc}`);
	}
};

const context = await esbuild.context({
	entryPoints: ["src/main.ts"],
	bundle: true,
	external: [
		"obsidian",
		"electron",
		"@codemirror/autocomplete",
		"@codemirror/collab",
		"@codemirror/commands",
		"@codemirror/language",
		"@codemirror/lint",
		"@codemirror/search",
		"@codemirror/state",
		"@codemirror/view",
		"@lezer/common",
		"@lezer/highlight",
		"@lezer/lr",
		...builtins,
	],
	format: "cjs",
	target: "es2022",
	supported: {
		"bigint": true,
	},
	define: {
		"import.meta.url": "import_meta_url",
	},
	inject: ["./import-meta-url-shim.mjs"],
	logLevel: "info",
	sourcemap: prod ? false : "inline",
	treeShaking: true,
	outfile: "main.js",
	minify: prod,
});

copyWasm();

if (prod) {
	await context.rebuild();
	process.exit(0);
} else {
	await context.watch();
}
