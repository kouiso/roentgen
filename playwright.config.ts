import { defineConfig } from "@playwright/test";

export default defineConfig({
	testDir: "./e2e",
	timeout: 30_000,
	retries: 1,
	workers: 1,
	use: {
		baseURL: "http://localhost:5173",
		screenshot: "only-on-failure",
		trace: "retain-on-failure",
		headless: false,
		launchOptions: {
			args: ["--no-sandbox"],
		},
	},
	webServer: {
		command: "pnpm dev",
		url: "http://localhost:5173",
		timeout: 30_000,
		reuseExistingServer: true,
		env: { ELECTRON_RUN_AS_NODE: "" },
	},
	projects: [
		{
			name: "renderer",
		},
	],
});
