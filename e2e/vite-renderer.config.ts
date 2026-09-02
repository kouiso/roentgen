import { resolve } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import renderer from "vite-plugin-electron-renderer";

const ignoredWatcherPaths = [
	"**/build/**",
	"**/coverage/**",
	"**/dist/**",
	"**/dist-electron/**",
	"**/playwright-report/**",
	"**/release/**",
	"**/test-results/**",
];

export default defineConfig({
	plugins: [react(), tailwindcss(), renderer()],
	server: {
		watch: {
			ignored: ignoredWatcherPaths,
		},
	},
	resolve: {
		alias: {
			"@": resolve(__dirname, "../src"),
			zlib: resolve(__dirname, "../src/shims/zlib.ts"),
		},
	},
});
