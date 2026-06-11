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

const canvasAverageChannel = async (page: Page) => {
	return page.evaluate(() => {
		const canvas = document.querySelector(
			".openseadragon-canvas canvas",
		) as HTMLCanvasElement | null;
		if (!canvas || canvas.width === 0 || canvas.height === 0) return 0;

		const context = canvas.getContext("2d");
		if (!context) return 0;

		const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
		let sum = 0;
		let count = 0;
		for (let i = 0; i < data.length; i += 4) {
			sum += data[i] ?? 0;
			count++;
		}
		return count === 0 ? 0 : sum / count;
	});
};

const waitForAutoloadedFixture = async (page: Page) => {
	// First-run Vite compilation (Tailwind + React) can be slow in CI; use 60s.
	await expect(page.locator("header")).toBeVisible({ timeout: 60_000 });
	await expect(page.getByText(/\d+ 枚/)).toBeVisible({
		timeout: 60_000,
	});
	await expect
		.poll(() => canvasNonBlackRatio(page), { timeout: 60_000 })
		.toBeGreaterThan(0.3);
};

const waitForAverageShift = async (
	page: Page,
	before: number,
	label: string,
) => {
	let after = before;
	await expect
		.poll(
			async () => {
				after = await canvasAverageChannel(page);
				return Math.abs(after - before);
			},
			{
				message: `${label} should shift the rendered canvas average channel`,
				timeout: 10_000,
			},
		)
		.toBeGreaterThan(5);
	return Math.abs(after - before);
};

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

test.describe("real Electron baseline regression", () => {
	test("autoload + WW/WC keyboard + WW/WC mouse + clean close", async () => {
		const consoleMessages: string[] = [];
		const consoleErrors: string[] = [];
		const pageErrors: Error[] = [];
		let rendererServer: RendererDevServer | undefined;
		let electronApp: ElectronApplication | undefined;

		try {
			rendererServer = await startRendererDevServer();
			const launchedApp = await electron.launch({
				args: [electronMainPath, "--no-sandbox"],
				env: {
					...process.env,
					ELECTRON_RUN_AS_NODE: "",
					NODE_ENV: "development",
					ROENTGEN_TEST_DICOM_DIR: testDicomFixtureDirPath,
					VITE_DEV_SERVER_URL: rendererServer.url,
				},
			});
			electronApp = launchedApp;

			const page = await launchedApp.firstWindow();
			page.on("console", (message) => {
				const text = message.text();
				consoleMessages.push(`[${message.type()}] ${text}`);
				if (message.type() === "error") consoleErrors.push(text);
			});
			page.on("pageerror", (error) => {
				pageErrors.push(error);
			});

			await waitForAutoloadedFixture(page);
			await page.screenshot({
				path: resolve(screenshotDir, "baseline-autoload.png"),
			});

			const beforeKeyboard = await canvasAverageChannel(page);
			await page.keyboard.press("3");
			const keyboardDelta = await waitForAverageShift(
				page,
				beforeKeyboard,
				"keyboard WW/WC preset",
			);
			console.info(
				`[baseline] keyboard average-channel delta ${keyboardDelta}`,
			);

			await page.keyboard.press("P");
			await expect(page.getByRole("button", { name: /パン/ })).toHaveClass(
				/bg-sky-400/,
			);
			await page.keyboard.press("W");
			await expect(
				page.getByRole("button", { name: /コントラスト/ }),
			).toHaveClass(/bg-sky-400/);

			const beforeDrag = await canvasAverageChannel(page);
			const canvasBox = await page
				.locator(".openseadragon-canvas canvas")
				.boundingBox();
			expect(
				canvasBox,
				"viewer canvas should have a bounding box",
			).not.toBeNull();
			if (!canvasBox)
				throw new Error("viewer canvas should have a bounding box");

			const startX = canvasBox.x + Math.max(10, canvasBox.width * 0.2);
			const startY = canvasBox.y + Math.max(10, canvasBox.height * 0.3);
			await page.mouse.move(startX, startY);
			await page.mouse.down();
			await page.mouse.move(startX + 240, startY + 140, { steps: 8 });
			await page.mouse.up();

			const mouseDelta = await waitForAverageShift(
				page,
				beforeDrag,
				"mouse WW/WC drag",
			);
			console.info(`[baseline] mouse average-channel delta ${mouseDelta}`);

			expect(pageErrors.map((error) => error.message)).toEqual([]);
			expect(
				filterBugConsoleErrors(consoleErrors),
				`console messages:\n${consoleMessages.join("\n")}`,
			).toEqual([]);

			electronApp = undefined;
			await expect(launchedApp.close()).resolves.toBeUndefined();
		} finally {
			await electronApp?.close();
			await rendererServer?.close();
		}
	});
});
