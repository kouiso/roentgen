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
					args.startup(
						process.env.VSCODE_DEBUG
							? ["--inspect=9229", "--remote-debugging-port=9222"]
							: [],
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
