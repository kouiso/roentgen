import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		globals: true,
		environment: "node",
		include: [
			"src/**/*.test.{ts,tsx}",
			"electron/**/*.test.{ts,tsx}",
			"scripts/**/*.test.mjs",
		],
		coverage: {
			provider: "v8",
			include: [
				"src/**/*.{ts,tsx}",
				"electron/renderer-log.ts",
				"electron/main.ts",
				"electron/google-drive.ts",
				"scripts/dev-log.mjs",
				"scripts/log-digest.mjs",
			],
			exclude: ["src/main.tsx", "src/**/*.d.ts"],
		},
	},
	resolve: {
		alias: {
			"@": resolve(__dirname, "src"),
		},
	},
});
