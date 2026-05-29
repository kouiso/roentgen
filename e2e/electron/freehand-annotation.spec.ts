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

test.beforeAll(() => {
	buildElectronApp();
	mkdirSync(screenshotDir, { recursive: true });
});

test.describe("real Electron freehand annotation", () => {
	test("creates and renders a freehand annotation from the tool panel", async () => {
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

			// "注釈" section is collapsible and starts collapsed — expand it first
			const annotationSectionHeader = page.getByRole("button", {
				name: "注釈",
			});
			if (
				!(await page
					.getByRole("button", { name: "フリーハンド" })
					.isVisible()
					.catch(() => false))
			) {
				await annotationSectionHeader.click();
			}

			const clearAnnotationsButton = page.getByRole("button", {
				name: "注釈クリア",
			});
			if (await clearAnnotationsButton.isVisible().catch(() => false)) {
				await clearAnnotationsButton.click();
			}

			const freehandButton = page.getByRole("button", {
				name: "フリーハンド",
			});
			await freehandButton.click();
			await expect(freehandButton).toHaveAttribute("aria-pressed", "true");

			const viewer = page.locator("#osd-pane-0");
			await expect(viewer).toBeVisible();
			const viewerBox = await viewer.boundingBox();
			expect(viewerBox, "viewer should have a bounding box").not.toBeNull();
			if (!viewerBox) throw new Error("viewer should have a bounding box");

			const startX = viewerBox.x + viewerBox.width * 0.48;
			const startY = viewerBox.y + viewerBox.height * 0.5;
			await page.mouse.move(startX, startY);
			await page.mouse.down();
			await page.mouse.move(startX + 55, startY + 20, { steps: 4 });
			await page.mouse.move(startX + 115, startY + 70, { steps: 5 });
			await page.mouse.move(startX + 180, startY + 42, { steps: 5 });
			await page.mouse.up();

			const overlayPolyline = page.locator(
				"svg[aria-label='注釈オーバーレイ'] polyline",
			);
			await expect(overlayPolyline).toHaveCount(1, { timeout: 10_000 });

			const evidence = await page.evaluate(() => {
				const polyline = document.querySelector(
					"svg[aria-label='注釈オーバーレイ'] polyline",
				);
				const points = polyline?.getAttribute("points") ?? "";
				return {
					points,
					pointCount: points.trim().split(/\s+/).filter(Boolean).length,
					strokeLinecap: polyline?.getAttribute("stroke-linecap"),
					strokeLinejoin: polyline?.getAttribute("stroke-linejoin"),
				};
			});
			expect(evidence.pointCount).toBeGreaterThanOrEqual(4);
			expect(evidence.strokeLinecap).toBe("round");
			expect(evidence.strokeLinejoin).toBe("round");

			await page.screenshot({
				path: resolve(screenshotDir, "freehand-annotation-created.png"),
			});
			writeFileSync(
				resolve(screenshotDir, "freehand-annotation-evidence.json"),
				JSON.stringify(evidence, null, 2),
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
