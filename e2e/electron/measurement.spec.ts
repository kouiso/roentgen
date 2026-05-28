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
	await expect(page.getByText(/\d+ ファイル/)).toBeVisible({
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
	const canvas = page.locator(".openseadragon-canvas canvas");
	await expect(canvas).toBeVisible();
	const canvasBox = await canvas.boundingBox();
	expect(canvasBox, "viewer canvas should have a bounding box").not.toBeNull();
	if (!canvasBox) throw new Error("viewer canvas should have a bounding box");

	await page.evaluate(
		({ clientX, clientY }) => {
			const container = document.getElementById("osd-pane-0");
			if (!container) throw new Error("viewer container not found");
			container.dispatchEvent(
				new MouseEvent("click", {
					bubbles: true,
					cancelable: true,
					clientX,
					clientY,
				}),
			);
		},
		{
			clientX: canvasBox.x + canvasBox.width * xRatio,
			clientY: canvasBox.y + canvasBox.height * yRatio,
		},
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

			const distanceButton = page.getByRole("button", { name: "距離" });
			await distanceButton.click();
			await expect(distanceButton).toHaveAttribute("aria-pressed", "true");
			await clickViewerPoint(page, 0.25, 0.65);
			await clickViewerPoint(page, 0.65, 0.78);

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

			const angleButton = page.getByRole("button", { name: "角度" });
			await angleButton.click();
			await expect(angleButton).toHaveAttribute("aria-pressed", "true");
			await clickViewerPoint(page, 0.25, 0.4);
			await clickViewerPoint(page, 0.45, 0.65);
			await clickViewerPoint(page, 0.75, 0.35);

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
