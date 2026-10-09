import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
	type ElectronApplication,
	_electron as electron,
	expect,
	type Page,
	test,
} from "@playwright/test";
import {
	buildElectronApp,
	electronLaunchArgs,
	type RendererDevServer,
	repoRoot,
	startRendererDevServer,
} from "./helpers";
import { writeLargeCtFixture } from "./large-ct-fixture";
import {
	readRendererWorkingSetMb,
	snapshotRendererMemory,
	stubFolderDialog,
} from "./memory-metrics";

const ROWS = 512;
const COLUMNS = 512;
// 512×512×16bit = 512 KiB/枚。1100 枚で約 577 MB（> 500 MB）
const FRAMES = 1100;

const FRAME_STEPS = 20;
const MAX_LOAD_MS = 60_000;
const MAX_FRAME_STEP_MEDIAN_MS = 500;
const MAX_RENDERER_GROWTH_RATIO = 2;
const MAX_MAIN_PEAK_RATIO = 1;
const MAX_RETAINED_AFTER_CLEAR_MB = 200;
const MAX_RELEASE_WAIT_MS = 15_000;

const resultDir = resolve(repoRoot, "test-results");

const progress = (message: string) =>
	console.log(`[large-ct ${new Date().toISOString()}] ${message}`);

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

// 骨（最も明るい画素）の重心を、写っている体（黒以外）の横幅に対する比率で返す。
// キャンバス幅で割るとウィンドウやパネル幅で画像の表示倍率が変わり、移動量が安定しない
const brightCentroidX = async (page: Page) => {
	return page.evaluate(() => {
		const canvas = document.querySelector(
			".openseadragon-canvas canvas",
		) as HTMLCanvasElement | null;
		if (!canvas || canvas.width === 0 || canvas.height === 0) return 0;
		const context = canvas.getContext("2d");
		if (!context) return 0;
		const { width, height } = canvas;
		const data = context.getImageData(0, 0, width, height).data;
		let sumX = 0;
		let count = 0;
		let minBodyX = width;
		let maxBodyX = -1;
		for (let i = 0; i < data.length; i += 4) {
			const value = data[i] ?? 0;
			const x = (i / 4) % width;
			if (value > 10) {
				minBodyX = Math.min(minBodyX, x);
				maxBodyX = Math.max(maxBodyX, x);
			}
			if (value > 240) {
				sumX += x;
				count++;
			}
		}
		const bodyWidth = maxBodyX - minBodyX;
		if (count === 0 || bodyWidth <= 0) return 0;
		return (sumX / count - minBodyX) / bodyWidth;
	});
};

const readMainWorkingSetMb = async (electronApp: ElectronApplication) => {
	const kilobytes = await electronApp.evaluate(({ app }) => {
		const metric = app
			.getAppMetrics()
			.find((entry) => entry.pid === process.pid);
		return metric?.memory.workingSetSize ?? 0;
	});
	return kilobytes / 1024;
};

test.beforeAll(() => {
	buildElectronApp();
	mkdirSync(resultDir, { recursive: true });
});

test.describe("real Electron large CT performance", () => {
	test("opens a >500 MB multi-frame CT and stays responsive", async () => {
		test.setTimeout(10 * 60_000);
		const pageErrors: Error[] = [];
		const fixtureDir = mkdtempSync(join(tmpdir(), "roentgen-large-ct-"));
		const emptyAutoloadDir = mkdtempSync(join(tmpdir(), "roentgen-empty-"));
		let rendererServer: RendererDevServer | undefined;
		let electronApp: ElectronApplication | undefined;

		try {
			const generatedAt = Date.now();
			const fixture = writeLargeCtFixture(join(fixtureDir, "large-ct.dcm"), {
				rows: ROWS,
				columns: COLUMNS,
				frames: FRAMES,
			});
			const fileMb = fixture.fileBytes / 1024 / 1024;
			progress(
				`generated ${fileMb.toFixed(0)} MB in ${Date.now() - generatedAt} ms`,
			);
			expect(fixture.fileBytes).toBeGreaterThan(500 * 1024 * 1024);

			rendererServer = await startRendererDevServer();
			electronApp = await electron.launch({
				args: electronLaunchArgs(),
				env: {
					...process.env,
					ELECTRON_RUN_AS_NODE: "",
					NODE_ENV: "development",
					ROENTGEN_TEST_DICOM_DIR: emptyAutoloadDir,
					VITE_DEV_SERVER_URL: rendererServer.url,
				},
			});
			const app = electronApp;

			const page = await app.firstWindow();
			page.on("pageerror", (error) => pageErrors.push(error));
			page.on("console", (message) => {
				if (message.type() === "error" || message.type() === "warning") {
					console.log(`[renderer ${message.type()}] ${message.text()}`);
				}
			});
			await expect(page.getByText("画像なし")).toBeVisible({
				timeout: 60_000,
			});
			const session = await page.context().newCDPSession(page);
			const idle = await snapshotRendererMemory(app, page, session, {
				gc: true,
			});
			await stubFolderDialog(app, fixtureDir);

			let peakRendererMb = idle.rendererWorkingSetMb;
			let peakMainMb = await readMainWorkingSetMb(app);
			let sampling = true;
			const sampler = (async () => {
				while (sampling) {
					peakRendererMb = Math.max(
						peakRendererMb,
						await readRendererWorkingSetMb(app).catch(() => 0),
					);
					peakMainMb = Math.max(
						peakMainMb,
						await readMainWorkingSetMb(app).catch(() => 0),
					);
					await new Promise((r) => setTimeout(r, 100));
				}
			})();

			const openedAt = Date.now();
			progress("open folder");
			await page.getByRole("button", { name: "フォルダを開く" }).click();
			await expect(page.getByText(`${FRAMES} 枚`, { exact: true })).toBeVisible(
				{ timeout: 180_000 },
			);
			const loadedMs = Date.now() - openedAt;
			await expect
				.poll(() => canvasNonBlackRatio(page), { timeout: 60_000 })
				.toBeGreaterThan(0.1);
			const firstImageMs = Date.now() - openedAt;
			progress(
				`loaded after ${loadedMs} ms, first image after ${firstImageMs} ms`,
			);
			sampling = false;
			await sampler;

			const loaded = await snapshotRendererMemory(app, page, session, {
				gc: true,
			});
			await expect(
				page.getByText(`1 / ${FRAMES}`, { exact: true }),
			).toBeVisible();
			const firstFrameBoneX = await brightCentroidX(page);
			await page.screenshot({
				path: resolve(resultDir, "large-ct-first-frame.png"),
			});

			// 1 枚ずつ送ったときの応答時間（表示番号が更新され、描画が落ち着くまで）
			await page.locator("#osd-pane-0").click({ timeout: 10_000 });
			const stepMs: number[] = [];
			for (let i = 1; i <= FRAME_STEPS; i++) {
				const stepStartedAt = Date.now();
				await page.keyboard.press("ArrowRight");
				await expect(
					page.getByText(`${i + 1} / ${FRAMES}`, { exact: true }),
				).toBeVisible({ timeout: 10_000 });
				stepMs.push(Date.now() - stepStartedAt);
			}

			const jumpStartedAt = Date.now();
			await page
				.getByRole("slider", { name: "スタックフレーム選択" })
				.fill(String(FRAMES - 1));
			await expect(
				page.getByText(`${FRAMES} / ${FRAMES}`, { exact: true }),
			).toBeVisible({ timeout: 10_000 });
			// 骨は体の幅の約 20% → 80% の位置へ動く。表示が本当に切り替わったかを画素で確かめる
			let lastFrameBoneX = firstFrameBoneX;
			await expect
				.poll(
					async () => {
						lastFrameBoneX = await brightCentroidX(page);
						return lastFrameBoneX - firstFrameBoneX;
					},
					{ timeout: 10_000 },
				)
				.toBeGreaterThan(0.4);
			const jumpMs = Date.now() - jumpStartedAt;
			await page.screenshot({
				path: resolve(resultDir, "large-ct-last-frame.png"),
			});

			page.once("dialog", (dialog) => dialog.accept());
			await page
				.getByRole("button", { name: "すべての画像を閉じる", exact: true })
				.click();
			await expect(page.getByText("画像なし")).toBeVisible({
				timeout: 15_000,
			});
			// 破棄済みビューアのタイマーが数秒だけ参照を持つため、解放されるまでの時間も測る
			const clearedAt = Date.now();
			let cleared = await snapshotRendererMemory(app, page, session, {
				gc: true,
			});
			while (
				cleared.rendererWorkingSetMb - idle.rendererWorkingSetMb >=
					MAX_RETAINED_AFTER_CLEAR_MB &&
				Date.now() - clearedAt < MAX_RELEASE_WAIT_MS
			) {
				await page.waitForTimeout(500);
				cleared = await snapshotRendererMemory(app, page, session, {
					gc: true,
				});
			}
			const releaseMs = Date.now() - clearedAt;

			const sortedSteps = [...stepMs].sort((a, b) => a - b);
			const stepMedianMs = sortedSteps[Math.floor(sortedSteps.length / 2)] ?? 0;
			const stepMaxMs = sortedSteps[sortedSteps.length - 1] ?? 0;
			const rendererGrowthMb = peakRendererMb - idle.rendererWorkingSetMb;
			const report = [
				"# 大容量 CT 性能検証",
				"",
				`- 入力: ${ROWS}×${COLUMNS} 16bit × ${FRAMES} フレーム、1 ファイル ${fileMb.toFixed(0)} MB`,
				`- 「${FRAMES} 枚」表示まで: ${loadedMs} ms / 最初の画像描画まで: ${firstImageMs} ms`,
				`- 1 枚送り (${FRAME_STEPS} 回): 中央値 ${stepMedianMs} ms / 最大 ${stepMaxMs} ms`,
				`- スライダーで最終フレームへ移動して描画確認まで: ${jumpMs} ms（骨の重心 x: ${firstFrameBoneX.toFixed(2)} → ${lastFrameBoneX.toFixed(2)}）`,
				`- レンダラー RSS: 起動直後 ${idle.rendererWorkingSetMb.toFixed(0)} MB / 読込中ピーク ${peakRendererMb.toFixed(0)} MB / 読込後 ${loaded.rendererWorkingSetMb.toFixed(0)} MB / クリア後 ${cleared.rendererWorkingSetMb.toFixed(0)} MB（${releaseMs} ms 後）`,
				`- メインプロセス RSS ピーク: ${peakMainMb.toFixed(0)} MB`,
				`- JS heap: 起動直後 ${idle.jsHeapUsedMb.toFixed(1)} MB / 読込後 ${loaded.jsHeapUsedMb.toFixed(1)} MB / クリア後 ${cleared.jsHeapUsedMb.toFixed(1)} MB`,
			].join("\n");
			writeFileSync(resolve(resultDir, "large-ct-report.md"), report);
			console.log(report);

			expect(pageErrors.map((error) => error.message)).toEqual([]);
			expect(loadedMs).toBeLessThan(MAX_LOAD_MS);
			expect(stepMedianMs).toBeLessThan(MAX_FRAME_STEP_MEDIAN_MS);
			// 一括 IPC 転送だった頃はファイルの約 4 倍に膨らんでいた
			expect(rendererGrowthMb).toBeLessThan(fileMb * MAX_RENDERER_GROWTH_RATIO);
			expect(peakMainMb).toBeLessThan(fileMb * MAX_MAIN_PEAK_RATIO);
			expect(
				cleared.rendererWorkingSetMb - idle.rendererWorkingSetMb,
			).toBeLessThan(MAX_RETAINED_AFTER_CLEAR_MB);
		} finally {
			await electronApp?.close();
			await rendererServer?.close();
			rmSync(fixtureDir, { recursive: true, force: true });
			rmSync(emptyAutoloadDir, { recursive: true, force: true });
		}
	});
});
