import { defineConfig } from "@playwright/test";

const isHeaded = process.env.PLAYWRIGHT_HEADED === "1";
const testTimeout = process.env.CI ? 120_000 : 30_000;

export default defineConfig({
	testDir: "./e2e",
	timeout: testTimeout,
	retries: 1,
	workers: 1,
	use: {
		screenshot: "only-on-failure",
		trace: "retain-on-failure",
		headless: !isHeaded,
		launchOptions: {
			args: ["--no-sandbox"],
		},
	},
	projects: [
		{
			name: "renderer",
			testMatch: /app-launch\.spec\.ts/,
			use: {
				baseURL: "http://localhost:5173",
			},
			webServer: {
				command: "pnpm dev",
				url: "http://localhost:5173",
				timeout: 30_000,
				reuseExistingServer: true,
				env: { ELECTRON_RUN_AS_NODE: "" },
			},
		},
		{
			name: "electron",
			retries: 0,
			testMatch: /electron\/.*\.spec\.ts/,
		},
	],
});
