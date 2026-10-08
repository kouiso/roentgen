import { mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
	type ElectronApplication,
	_electron as electron,
	expect,
	type Page,
	test,
} from "@playwright/test";
import { type GeometryFixture, writeGeometryFixture } from "./dicom-fixture";
import {
	buildElectronApp,
	electronMainPath,
	type RendererDevServer,
	repoRoot,
	startRendererDevServer,
} from "./helpers";

const screenshotDir = resolve(repoRoot, "test-results");

type Features = {
	ring: { left: number; right: number; top: number; bottom: number };
	marker: { x: number; y: number };
};

// OSD キャンバスの実ピクセルから、リングの外接矩形と F マーカーの重心をクライアント座標で求める
const readFeatures = (page: Page): Promise<Features | null> =>
	page.evaluate(() => {
		const container = document.getElementById("osd-pane-0");
		const canvas = container?.querySelector(
			".openseadragon-canvas canvas",
		) as HTMLCanvasElement | null;
		if (!canvas || canvas.width === 0 || canvas.height === 0) return null;
		const context = canvas.getContext("2d");
		if (!context) return null;
		const rect = canvas.getBoundingClientRect();
		const scaleX = rect.width / canvas.width;
		const scaleY = rect.height / canvas.height;
		const { data, width, height } = context.getImageData(
			0,
			0,
			canvas.width,
			canvas.height,
		);

		let markerMinX = Number.POSITIVE_INFINITY;
		let markerMaxX = Number.NEGATIVE_INFINITY;
		let markerMinY = Number.POSITIVE_INFINITY;
		let markerMaxY = Number.NEGATIVE_INFINITY;
		let markerSumX = 0;
		let markerSumY = 0;
		let markerCount = 0;
		for (let y = 0; y < height; y++) {
			for (let x = 0; x < width; x++) {
				if ((data[(y * width + x) * 4] ?? 0) > 220) {
					markerSumX += x;
					markerSumY += y;
					markerCount++;
					markerMinX = Math.min(markerMinX, x);
					markerMaxX = Math.max(markerMaxX, x);
					markerMinY = Math.min(markerMinY, y);
					markerMaxY = Math.max(markerMaxY, y);
				}
			}
		}
		if (markerCount === 0) return null;
		// マーカー輪郭のアンチエイリアスがリング判定に混ざらないよう、周囲を除外する
		const pad = 4;
		let ringLeft = Number.POSITIVE_INFINITY;
		let ringRight = Number.NEGATIVE_INFINITY;
		let ringTop = Number.POSITIVE_INFINITY;
		let ringBottom = Number.NEGATIVE_INFINITY;
		for (let y = 0; y < height; y++) {
			for (let x = 0; x < width; x++) {
				const value = data[(y * width + x) * 4] ?? 0;
				if (value < 60 || value > 180) continue;
				if (
					x >= markerMinX - pad &&
					x <= markerMaxX + pad &&
					y >= markerMinY - pad &&
					y <= markerMaxY + pad
				) {
					continue;
				}
				ringLeft = Math.min(ringLeft, x);
				ringRight = Math.max(ringRight, x);
				ringTop = Math.min(ringTop, y);
				ringBottom = Math.max(ringBottom, y);
			}
		}
		if (!Number.isFinite(ringLeft)) return null;
		return {
			ring: {
				left: rect.left + ringLeft * scaleX,
				right: rect.left + (ringRight + 1) * scaleX,
				top: rect.top + ringTop * scaleY,
				bottom: rect.top + (ringBottom + 1) * scaleY,
			},
			marker: {
				x: rect.left + (markerSumX / markerCount + 0.5) * scaleX,
				y: rect.top + (markerSumY / markerCount + 0.5) * scaleY,
			},
		};
	});

const ringCenter = (features: Features) => ({
	x: (features.ring.left + features.ring.right) / 2,
	y: (features.ring.top + features.ring.bottom) / 2,
});

const dispatchViewerClick = async (
	page: Page,
	point: { x: number; y: number },
) => {
	// OSD キャンバスがイベントを止める場合があるため、コンテナへ直接 click を送る
	await page.evaluate(({ x, y }) => {
		const container = document.getElementById("osd-pane-0");
		if (!container) throw new Error("#osd-pane-0 not found");
		container.dispatchEvent(
			new MouseEvent("click", {
				clientX: x,
				clientY: y,
				bubbles: true,
				cancelable: true,
			}),
		);
	}, point);
};

const readArrowEnd = (page: Page) =>
	page.evaluate(() => {
		const svg = document.querySelector("svg[aria-label='注釈オーバーレイ']");
		const line = svg?.querySelector("line");
		if (!svg || !line) return null;
		const rect = svg.getBoundingClientRect();
		return {
			x: rect.left + Number(line.getAttribute("x2")),
			y: rect.top + Number(line.getAttribute("y2")),
		};
	});

const expectArrowOnMarker = async (page: Page, label: string) => {
	await expect
		.poll(
			async () => {
				const features = await readFeatures(page);
				const arrowEnd = await readArrowEnd(page);
				if (!features || !arrowEnd) return Number.POSITIVE_INFINITY;
				return Math.hypot(
					arrowEnd.x - features.marker.x,
					arrowEnd.y - features.marker.y,
				);
			},
			{ message: `arrow tip should stay on the F marker (${label})` },
		)
		.toBeLessThan(6);
};

const waitForFixture = async (page: Page) => {
	await expect(page.getByText(/\d+ 枚/)).toBeVisible({ timeout: 30_000 });
	await expect
		.poll(() => readFeatures(page), { timeout: 30_000 })
		.not.toBeNull();
};

const measuredMm = async (page: Page) => {
	const label = page.locator("svg[aria-label='計測オーバーレイ'] text").first();
	await expect(label).toContainText("mm");
	const text = (await label.textContent()) ?? "";
	return Number.parseFloat(text);
};

const launch = async (
	rendererUrl: string,
	fixtureDir: string,
	userDataDir: string,
) => {
	const app = await electron.launch({
		args: [electronMainPath, "--no-sandbox", `--user-data-dir=${userDataDir}`],
		env: {
			...process.env,
			ELECTRON_RUN_AS_NODE: "",
			NODE_ENV: "development",
			ROENTGEN_TEST_DICOM_DIR: fixtureDir,
			VITE_DEV_SERVER_URL: rendererUrl,
		},
	});
	const page = await app.firstWindow();
	const pageErrors: Error[] = [];
	page.on("pageerror", (error) => pageErrors.push(error));
	page.on("dialog", (dialog) => dialog.accept());
	await page.setViewportSize({ width: 1400, height: 900 });
	return { app, page, pageErrors };
};

let fixture: GeometryFixture;
let fixtureDir: string;

test.beforeAll(() => {
	buildElectronApp();
	mkdirSync(screenshotDir, { recursive: true });
	fixtureDir = mkdtempSync(join(tmpdir(), "roentgen-geometry-fixture-"));
	// 0.6mm × 0.3mm の非正方ピクセル。物理的には 120mm 四方の正方形になる
	fixture = writeGeometryFixture(join(fixtureDir, "non-square.dcm"), {
		rows: 200,
		columns: 400,
		pixelSpacing: [0.6, 0.3],
		uid: "20261008",
	});
});

test.describe("real Electron image geometry", () => {
	test("non-square pixels keep the physical aspect ratio and measure true mm", async () => {
		let rendererServer: RendererDevServer | undefined;
		let electronApp: ElectronApplication | undefined;
		try {
			rendererServer = await startRendererDevServer();
			const userDataDir = mkdtempSync(join(tmpdir(), "roentgen-geo-user-"));
			const { app, page, pageErrors } = await launch(
				rendererServer.url,
				fixtureDir,
				userDataDir,
			);
			electronApp = app;
			await waitForFixture(page);

			const features = await readFeatures(page);
			if (!features) throw new Error("fixture features not found");
			const ringWidth = features.ring.right - features.ring.left;
			const ringHeight = features.ring.bottom - features.ring.top;
			// 物理的に真円なので、表示上も縦横がほぼ一致するはず（2倍歪むと比は 0.5 か 2）
			expect(ringWidth / ringHeight).toBeGreaterThan(0.97);
			expect(ringWidth / ringHeight).toBeLessThan(1.03);
			await page.screenshot({
				path: resolve(screenshotDir, "geometry-non-square.png"),
			});

			const outerDiameterMm =
				2 * (fixture.ringRadiusMm + fixture.ringHalfThicknessMm);
			const center = ringCenter(features);
			await page.getByRole("button", { name: "長さを測る" }).click();
			await expect(
				page.locator("#osd-pane-0[data-measurement-ready='true']"),
			).toBeVisible();

			await dispatchViewerClick(page, { x: features.ring.left, y: center.y });
			await expect(
				page.locator("svg[aria-label='計測オーバーレイ'] circle"),
			).toHaveCount(1);
			await dispatchViewerClick(page, { x: features.ring.right, y: center.y });
			const horizontalMm = await measuredMm(page);

			await page.getByRole("button", { name: "測った線を消す" }).click();
			const distanceButton = page.getByRole("button", { name: "長さを測る" });
			if ((await distanceButton.getAttribute("aria-pressed")) !== "true") {
				await distanceButton.click();
			}
			await expect(
				page.locator("#osd-pane-0[data-measurement-ready='true']"),
			).toBeVisible();
			await dispatchViewerClick(page, { x: center.x, y: features.ring.top });
			await expect(
				page.locator("svg[aria-label='計測オーバーレイ'] circle"),
			).toHaveCount(1);
			await dispatchViewerClick(page, {
				x: center.x,
				y: features.ring.bottom,
			});
			const verticalMm = await measuredMm(page);

			expect(Math.abs(horizontalMm - outerDiameterMm)).toBeLessThan(1.5);
			expect(Math.abs(verticalMm - outerDiameterMm)).toBeLessThan(1.5);
			expect(pageErrors.map((error) => error.message)).toEqual([]);
		} finally {
			await electronApp?.close();
			await rendererServer?.close();
		}
	});

	test("annotations added while rotated stay on the same anatomy after reset, flip and restart", async () => {
		let rendererServer: RendererDevServer | undefined;
		let electronApp: ElectronApplication | undefined;
		try {
			rendererServer = await startRendererDevServer();
			const userDataDir = mkdtempSync(join(tmpdir(), "roentgen-geo-user-"));
			const first = await launch(rendererServer.url, fixtureDir, userDataDir);
			electronApp = first.app;
			const page = first.page;
			await waitForFixture(page);

			await page.getByRole("button", { name: /くわしい設定/ }).click();
			const before = await readFeatures(page);
			if (!before) throw new Error("fixture features not found");
			await page.getByRole("button", { name: "右90°回転" }).click();
			// 時計回り 90° で左上の F は右上へ移る
			await expect
				.poll(async () => {
					const features = await readFeatures(page);
					return features ? features.marker.x > ringCenter(features).x : false;
				})
				.toBe(true);
			const rotated = await readFeatures(page);
			if (!rotated) throw new Error("rotated features not found");

			await page.getByRole("button", { name: "矢印" }).click();
			await expect(
				page.locator("#osd-pane-0[data-measurement-ready='true']"),
			).toBeVisible();
			await dispatchViewerClick(page, ringCenter(rotated));
			await dispatchViewerClick(page, rotated.marker);
			await expect(
				page.locator("svg[aria-label='注釈オーバーレイ'] line"),
			).toHaveCount(1);
			await expectArrowOnMarker(page, "rotated 90°");
			await page.screenshot({
				path: resolve(screenshotDir, "geometry-arrow-rotated.png"),
			});
			await page.keyboard.press("Escape");

			await page.getByRole("button", { name: "最初の状態に戻す" }).click();
			await expect
				.poll(async () => {
					const features = await readFeatures(page);
					return features ? features.marker.x < ringCenter(features).x : false;
				})
				.toBe(true);
			await expectArrowOnMarker(page, "after reset");

			await page.getByRole("button", { name: "左右反転" }).click();
			await expect
				.poll(async () => {
					const features = await readFeatures(page);
					return features ? features.marker.x > ringCenter(features).x : false;
				})
				.toBe(true);
			await expectArrowOnMarker(page, "flipped horizontally");
			await page.getByRole("button", { name: "上下反転" }).click();
			await expectArrowOnMarker(page, "flipped both ways");
			await page.getByRole("button", { name: "左90°回転" }).click();
			await expectArrowOnMarker(page, "flipped and rotated -90°");
			await page.screenshot({
				path: resolve(screenshotDir, "geometry-arrow-flipped.png"),
			});
			expect(first.pageErrors.map((error) => error.message)).toEqual([]);

			await first.app.close();
			electronApp = undefined;

			const second = await launch(rendererServer.url, fixtureDir, userDataDir);
			electronApp = second.app;
			await waitForFixture(second.page);
			await expect(
				second.page.locator("svg[aria-label='注釈オーバーレイ'] line"),
			).toHaveCount(1, { timeout: 15_000 });
			await expectArrowOnMarker(second.page, "after restart");
			expect(second.pageErrors.map((error) => error.message)).toEqual([]);
		} finally {
			await electronApp?.close();
			await rendererServer?.close();
		}
	});
});
