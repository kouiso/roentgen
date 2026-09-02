import { defineConfig } from "@playwright/test";

const isHeaded = process.env.PLAYWRIGHT_HEADED === "1";
const testTimeout = process.env.CI ? 120_000 : 30_000;
const rendererPort = process.env.PLAYWRIGHT_RENDERER_PORT ?? "5174";
const rendererBaseUrl = `http://127.0.0.1:${rendererPort}`;

export default defineConfig({
	testDir: "./e2e",
	timeout: testTimeout,
	retries: 1,
	workers: 1,
	webServer: {
		command: `pnpm exec vite --config e2e/vite-renderer.config.ts --host 127.0.0.1 --port ${rendererPort} --strictPort`,
		url: rendererBaseUrl,
		timeout: 30_000,
		reuseExistingServer: false,
		env: { ELECTRON_RUN_AS_NODE: "" },
	},
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
			testMatch: /(app-launch|overlay-pixel)\.spec\.ts/,
			use: {
				baseURL: rendererBaseUrl,
			},
		},
		{
			name: "electron",
			retries: 0,
			testMatch: /electron\/.*\.spec\.ts/,
		},
	],
});
