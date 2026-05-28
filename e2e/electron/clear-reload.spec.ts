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
	testDicomFixtureDirPath,
} from "./helpers";

const screenshotDir = resolve(repoRoot, "test-results");

const canvasNonBlackRatio = async (page: Page) => {
	return page.evaluate(() => {
		const canvas = document.querySelector(
			".openseadragon-canvas canvas",
		) as HTMLCanvasElement | null;
		if (!canvas || canvas.width === 0 || canvas.height === 0) return 0;

		const context = canvas.getContext("2d");
		if (!context) return 0;

		const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
		let nonBlack = 0;
		for (let i = 0; i < data.length; i += 4) {
			if ((data[i] ?? 0) > 10) nonBlack++;
		}
		return nonBlack / (data.length / 4);
	});
};

const waitForAutoloadedFixture = async (page: Page) => {
	await expect(page.locator("header")).toBeVisible({ timeout: 30_000 });
	await expect(page.getByText(/\d+ ファイル/)).toBeVisible({
		timeout: 30_000,
	});
	await expect
		.poll(() => canvasNonBlackRatio(page), { timeout: 30_000 })
		.toBeGreaterThan(0.3);
};

const reloadFixtures = async (page: Page) => {
	// Reloading the renderer resets App's autoload ref, then Electron IPC
	// loadTestDicom reads the tracked test fixture directory again.
	await page.reload({ waitUntil: "domcontentloaded" });
	await waitForAutoloadedFixture(page);
};

const formatPageErrors = (errors: Error[]) =>
	errors.map((error) => error.stack ?? error.message);

const filterBugConsoleErrors = (errors: string[]) =>
	errors.filter(
		(error) =>
			error.includes("removeImageLoadObject") ||
			error.toLowerCase().includes("react"),
	);

test.beforeAll(() => {
	buildElectronApp();
	mkdirSync(screenshotDir, { recursive: true });
});

test.describe("real Electron Clear reload regression", () => {
	test("keeps the renderer alive when Clear is followed by fixture reloads", async () => {
		const consoleMessages: string[] = [];
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
					ROENTGEN_TEST_DICOM_DIR: testDicomFixtureDirPath,
					VITE_DEV_SERVER_URL: rendererServer.url,
				},
			});

			const page = await electronApp.firstWindow();
			page.on("console", (message) => {
				const text = message.text();
				consoleMessages.push(`[${message.type()}] ${text}`);
				if (message.type() === "error") consoleErrors.push(text);
			});
			page.on("pageerror", (error) => {
				pageErrors.push(error);
			});

			await waitForAutoloadedFixture(page);

			for (let cycle = 1; cycle <= 3; cycle++) {
				await page.screenshot({
					path: resolve(screenshotDir, `clear-cycle-${cycle}-before.png`),
				});

				page.once("dialog", (dialog) => dialog.accept());
				await page
					.getByRole("button", { name: "全クリア", exact: true })
					.first()
					.click();

				await page.screenshot({
					path: resolve(screenshotDir, `clear-cycle-${cycle}-after.png`),
				});

				await expect
					.poll(async () => {
						const idleVisible = await page
							.getByText("画像なし")
							.isVisible()
							.catch(() => false);
						const bugPageErrorSeen = pageErrors.some((error) =>
							error.message.includes("removeImageLoadObject"),
						);
						const bugConsoleErrorSeen =
							filterBugConsoleErrors(consoleErrors).length > 0;
						return idleVisible || bugPageErrorSeen || bugConsoleErrorSeen;
					})
					.toBe(true);

				expect(
					formatPageErrors(pageErrors),
					`cycle ${cycle} pageerror events: ${JSON.stringify(
						formatPageErrors(pageErrors),
					)}`,
				).toEqual([]);
				expect(
					filterBugConsoleErrors(consoleErrors),
					`cycle ${cycle} console messages:\n${consoleMessages.join("\n")}`,
				).toEqual([]);

				await expect(page.getByText("画像なし")).toBeVisible({
					timeout: 5000,
				});

				const aliveAfterClear = await page.evaluate(() => {
					return (
						document.readyState === "complete" &&
						typeof window.electronAPI === "object" &&
						document.querySelector("header") !== null
					);
				});
				expect(
					aliveAfterClear,
					`cycle ${cycle}: renderer dead after Clear`,
				).toBe(true);

				await reloadFixtures(page);
			}

			expect(
				formatPageErrors(pageErrors),
				`pageerror events: ${JSON.stringify(formatPageErrors(pageErrors))}`,
			).toEqual([]);
			expect(
				filterBugConsoleErrors(consoleErrors),
				`console messages:\n${consoleMessages.join("\n")}`,
			).toEqual([]);
		} finally {
			await electronApp?.close();
			await rendererServer?.close();
		}
	});
});
