import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import {
	type ElectronApplication,
	_electron as electron,
	expect,
	type Page,
	test,
} from "@playwright/test";
import {
	buildElectronApp,
	electronMainPath,
	type RendererDevServer,
	repoRoot,
	startRendererDevServer,
} from "./helpers";

const screenshotDir = resolve(repoRoot, "test-results");
const corruptFixtureDirPath = resolve(repoRoot, "public", "corrupt-fixture");

const waitForHeaderVisible = async (page: Page) => {
	await expect(page.locator("header")).toBeVisible({ timeout: 30_000 });
};

test.beforeAll(() => {
	buildElectronApp();
	mkdirSync(screenshotDir, { recursive: true });
});

test.describe("corrupt / non-DICOM file error surfacing", () => {
	test("shows a human-readable error in the header without crashing", async () => {
		const consoleErrors: string[] = [];
		const pageErrors: Error[] = [];
		let rendererServer: RendererDevServer | undefined;
		let electronApp: ElectronApplication | undefined;

		try {
			rendererServer = await startRendererDevServer();
			electronApp = await electron.launch({
				args: [electronMainPath, "--no-sandbox"],
				env: {
					...process.env,
					ELECTRON_RUN_AS_NODE: "",
					NODE_ENV: "development",
					// Point auto-loader at the corrupt fixture dir (contains only not-a-dicom.dcm)
					ROENTGEN_TEST_DICOM_DIR: corruptFixtureDirPath,
					VITE_DEV_SERVER_URL: rendererServer.url,
				},
			});

			const page = await electronApp.firstWindow();
			page.on("console", (message) => {
				if (message.type() === "error") consoleErrors.push(message.text());
			});
			page.on("pageerror", (error) => {
				pageErrors.push(error);
			});

			await waitForHeaderVisible(page);

			// The load-test-dicom IPC fires on startup; wait for the error chip to appear.
			// Expected: "エラー: レントゲン画像ではありません" (rose-colored chip in header)
			await expect(page.getByText(/エラー[:：]/)).toBeVisible({
				timeout: 30_000,
			});

			// Verify the error message specifically names the non-DICOM cause
			const errorChip = page.getByText(/エラー[:：]/);
			const errorText = await errorChip.textContent();
			expect(errorText).toMatch(/レントゲン画像ではありません/);

			// App must still be alive (header rendered, no renderer crash)
			await expect(page.locator("header")).toBeVisible();

			await page.screenshot({
				path: resolve(screenshotDir, "corrupt-file-error-state.png"),
			});

			// No unhandled page-level errors
			expect(pageErrors.map((e) => e.message)).toEqual([]);
		} finally {
			await electronApp?.close();
			await rendererServer?.close();
		}
	});
});
