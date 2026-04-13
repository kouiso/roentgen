import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import electron from "vite-plugin-electron";
import renderer from "vite-plugin-electron-renderer";

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
	plugins: [
		react(),
		tailwindcss(),
		electron([
			{
				entry: "electron/main.ts",
				onstart(args) {
					// ELECTRON_RUN_AS_NODE=1 が親プロセス（Claude Code等）から継承されると
					// Electron が Node.js モードで起動し、BrowserWindow が作れない。
					// spawn に渡す env から明示的に除外する。
					const { ELECTRON_RUN_AS_NODE: _, ...cleanEnv } = process.env;
					const spawnOptions = { env: cleanEnv };

					args.startup(
						process.env.VSCODE_DEBUG
							? [
									".",
									"--no-sandbox",
									"--inspect=9229",
									"--remote-debugging-port=9222",
								]
							: [".", "--no-sandbox", "--remote-debugging-port=9224"],
						spawnOptions,
					);
				},
				vite: {
					build: {
						outDir: "dist-electron",
						sourcemap: true,
					},
				},
			},
			{
				entry: "electron/preload.ts",
				onstart(args) {
					args.reload();
				},
				vite: {
					build: {
						outDir: "dist-electron",
						sourcemap: true,
					},
				},
			},
		]),
		renderer(),
	],
	resolve: {
		alias: {
			"@": resolve(__dirname, "src"),
			zlib: resolve(__dirname, "src/shims/zlib.ts"),
		},
	},
});
