import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
	test: {
		globals: true,
		environment: "node",
		include: ["src/**/*.test.{ts,tsx}", "electron/**/*.test.{ts,tsx}"],
		coverage: {
			provider: "v8",
			include: ["src/**/*.{ts,tsx}"],
			exclude: ["src/main.tsx", "src/**/*.d.ts"],
		},
	},
	resolve: {
		alias: {
			"@": resolve(__dirname, "src"),
		},
	},
});
