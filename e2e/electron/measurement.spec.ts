import { mkdirSync, writeFileSync } from "node:fs";
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
	await expect(page.getByText(/\d+ 枚/)).toBeVisible({
		timeout: 30_000,
	});
	await expect
		.poll(() => canvasNonBlackRatio(page), { timeout: 30_000 })
		.toBeGreaterThan(0.3);
};

const filterBugConsoleErrors = (errors: string[]) =>
	errors.filter(
		(error) =>
			error.includes("removeImageLoadObject") ||
			error.toLowerCase().includes("react"),
	);

const clickViewerPoint = async (page: Page, xRatio: number, yRatio: number) => {
	const viewer = page.locator("#osd-pane-0");
	await expect(viewer).toBeVisible();
	const viewerBox = await viewer.boundingBox();
	expect(
		viewerBox,
		"viewer container should have a bounding box",
	).not.toBeNull();
	if (!viewerBox)
		throw new Error("viewer container should have a bounding box");

	const clientX = viewerBox.x + viewerBox.width * xRatio;
	const clientY = viewerBox.y + viewerBox.height * yRatio;

	// Dispatch directly on #osd-pane-0 to bypass OSD canvas interception.
	// page.mouse.click() targets the topmost element at the coordinate (OSD canvas),
	// which may stop propagation before our listener on the container fires.
	await page.evaluate(
		({ clientX, clientY }) => {
			const container = document.getElementById("osd-pane-0");
			if (!container) throw new Error("#osd-pane-0 not found");
			container.dispatchEvent(
				new MouseEvent("click", {
					clientX,
					clientY,
					bubbles: true,
					cancelable: true,
				}),
			);
		},
		{ clientX, clientY },
	);
};

test.beforeAll(() => {
	buildElectronApp();
	mkdirSync(screenshotDir, { recursive: true });
});

test.describe("real Electron measurement overlay", () => {
	test("creates distance and angle measurements on the loaded DICOM", async () => {
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
			page.on("dialog", (dialog) => dialog.accept());

			await waitForAutoloadedFixture(page);

			const clearMeasurementsButton = page.getByRole("button", {
				name: "計測クリア",
			});
			if (await clearMeasurementsButton.isVisible().catch(() => false)) {
				await clearMeasurementsButton.click();
				await expect(
					page.getByRole("img", { name: "計測オーバーレイ" }),
				).toBeHidden();
			}
			const clearAnnotationsButton = page.getByRole("button", {
				name: "注釈クリア",
			});
			if (await clearAnnotationsButton.isVisible().catch(() => false)) {
				await clearAnnotationsButton.click();
				await expect(
					page.getByRole("img", { name: "注釈オーバーレイ" }),
				).toBeHidden();
			}

			const distanceButton = page.getByRole("button", { name: "距離を測る" });
			await distanceButton.click();
			await expect(distanceButton).toHaveAttribute("aria-pressed", "true");
			// Wait until the click listener is actually attached (signalled by data-measurement-ready)
			await expect(
				page.locator("#osd-pane-0[data-measurement-ready='true']"),
			).toBeVisible({ timeout: 5_000 });
			// x-ratios must land within the image area (pillarbox: ~28% on each side for 40x40 fixture in landscape container)
			await clickViewerPoint(page, 0.38, 0.35);
			await clickViewerPoint(page, 0.55, 0.6);

			const overlay = page.getByRole("img", { name: "計測オーバーレイ" });
			await expect(overlay).toBeVisible({ timeout: 10_000 });
			await expect(overlay.locator("line")).toHaveCount(1, {
				timeout: 10_000,
			});
			await expect(overlay.locator("text").first()).toContainText(/(mm|px)/);
			const distanceEvidence = await page.evaluate(() => {
				const overlay = document.querySelector(
					"svg[aria-label='計測オーバーレイ']",
				);
				const labels = [...(overlay?.querySelectorAll("text") ?? [])].map(
					(node) => node.textContent ?? "",
				);
				return {
					labelCount: labels.length,
					labels,
					lineCount: overlay?.querySelectorAll("line").length ?? 0,
					circleCount: overlay?.querySelectorAll("circle").length ?? 0,
				};
			});
			expect(distanceEvidence.labelCount).toBe(1);
			expect(distanceEvidence.lineCount).toBe(1);
			expect(distanceEvidence.circleCount).toBe(2);
			await page.screenshot({
				path: resolve(screenshotDir, "measurement-distance-created.png"),
			});

			await page.getByRole("button", { name: "計測クリア" }).click();
			await expect(overlay).toBeHidden();

			const angleButton = page.getByRole("button", { name: "角度を測る" });
			await angleButton.click();
			await expect(angleButton).toHaveAttribute("aria-pressed", "true");
			// Wait until the click listener is actually attached (signalled by data-measurement-ready)
			await expect(
				page.locator("#osd-pane-0[data-measurement-ready='true']"),
			).toBeVisible({ timeout: 5_000 });
			// x-ratios must land within the image area (pillarbox: ~28% on each side for 40x40 fixture in landscape container)
			await clickViewerPoint(page, 0.4, 0.35);
			await clickViewerPoint(page, 0.48, 0.55);
			await clickViewerPoint(page, 0.6, 0.4);

			await expect(overlay.locator("line")).toHaveCount(2, {
				timeout: 10_000,
			});
			await expect(overlay.locator("text")).toHaveCount(1);
			await expect(overlay.locator("text").first()).toContainText("°");

			const angleEvidence = await page.evaluate(() => {
				const overlay = document.querySelector(
					"svg[aria-label='計測オーバーレイ']",
				);
				const labels = [...(overlay?.querySelectorAll("text") ?? [])].map(
					(node) => node.textContent ?? "",
				);
				return {
					labelCount: labels.length,
					labels,
					lineCount: overlay?.querySelectorAll("line").length ?? 0,
					circleCount: overlay?.querySelectorAll("circle").length ?? 0,
				};
			});
			expect(angleEvidence.labelCount).toBe(1);
			expect(angleEvidence.lineCount).toBe(2);
			expect(angleEvidence.circleCount).toBe(3);

			await page.screenshot({
				path: resolve(screenshotDir, "measurement-angle-created.png"),
			});
			writeFileSync(
				resolve(screenshotDir, "measurement-overlay-evidence.json"),
				JSON.stringify({ distanceEvidence, angleEvidence }, null, 2),
				"utf-8",
			);

			expect(pageErrors.map((error) => error.message)).toEqual([]);
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
