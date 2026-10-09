import {
	copyFileSync,
	linkSync,
	mkdirSync,
	mkdtempSync,
	rmSync,
	statSync,
	writeFileSync,
} from "node:fs";
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
import {
	type RendererMemorySnapshot,
	snapshotRendererMemory,
	stubFolderDialog,
} from "./memory-metrics";

const FILE_COUNT = Number(process.env.ROENTGEN_LEAK_FILE_COUNT ?? 100);
const CYCLES = 3;
const FRAMES_TO_VISIT = Math.min(10, FILE_COUNT - 1);
// 1 回分の読込量（約 960 MB）に比べて十分小さく、GC の揺らぎよりは大きい値。
// 画像データ（ArrayBuffer）を 1 回でも取りこぼすと 9.6 MB 単位で増えるため検出できる。
const MAX_HEAP_GROWTH_MB = 16;
const MAX_WORKING_SET_GROWTH_MB = 160;
const MAX_DOM_NODE_GROWTH = 300;

const resultDir = resolve(repoRoot, "test-results");
const sourceDicomPath = resolve(repoRoot, "public/test.dcm");

// 実画像のコピーを用意する。OS 一時ディレクトリはアプリの読込許可ルートに含まれる。
const prepareFixtureFiles = (dirPath: string) => {
	for (let i = 0; i < FILE_COUNT; i++) {
		const filePath = join(dirPath, `leak-${String(i).padStart(3, "0")}.dcm`);
		try {
			linkSync(sourceDicomPath, filePath);
		} catch {
			copyFileSync(sourceDicomPath, filePath);
		}
	}
};

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

const loadAllAndBrowse = async (page: Page) => {
	const startedAt = Date.now();
	progress("open folder");
	await page.getByRole("button", { name: "フォルダを開く" }).click();
	await expect(page.getByText(`${FILE_COUNT} 枚`, { exact: true })).toBeVisible(
		{ timeout: 180_000 },
	);
	await expect
		.poll(() => canvasNonBlackRatio(page), { timeout: 30_000 })
		.toBeGreaterThan(0.3);
	const loadMs = Date.now() - startedAt;
	progress(`loaded in ${loadMs} ms`);

	// 表示したことのある画像だけがデコード済みキャッシュに載るため、何枚か送って確認する
	await page.locator("#osd-pane-0").click({ timeout: 10_000 });
	for (let i = 1; i <= FRAMES_TO_VISIT; i++) {
		await page.keyboard.press("ArrowRight");
		await expect(
			page.getByText(`${i + 1} / ${FILE_COUNT}`, { exact: true }),
		).toBeVisible({ timeout: 15_000 });
	}
	progress("browsed frames");
	return loadMs;
};

const clearAll = async (page: Page) => {
	page.once("dialog", (dialog) => dialog.accept());
	await page
		.getByRole("button", { name: "すべての画像を閉じる", exact: true })
		.click();
	await expect(page.getByText("画像なし")).toBeVisible({ timeout: 15_000 });
	progress("cleared");
};

const progress = (message: string) =>
	console.log(`[memory-leak ${new Date().toISOString()}] ${message}`);

const formatRow = (label: string, snapshot: RendererMemorySnapshot) =>
	`| ${label} | ${snapshot.jsHeapUsedMb.toFixed(1)} | ${snapshot.rendererWorkingSetMb.toFixed(1)} | ${snapshot.domNodes} | ${snapshot.jsEventListeners} |`;

test.beforeAll(() => {
	buildElectronApp();
	mkdirSync(resultDir, { recursive: true });
});

test.describe("real Electron memory leak", () => {
	test(`releases memory after loading and clearing ${FILE_COUNT} files ${CYCLES} times`, async () => {
		test.setTimeout(10 * 60_000);
		const pageErrors: Error[] = [];
		const fixtureDir = mkdtempSync(join(tmpdir(), "roentgen-leak-"));
		// 自動読込を無効にするため、空のディレクトリを開発用フィクスチャとして渡す
		const emptyAutoloadDir = mkdtempSync(join(tmpdir(), "roentgen-empty-"));
		let rendererServer: RendererDevServer | undefined;
		let electronApp: ElectronApplication | undefined;

		try {
			prepareFixtureFiles(fixtureDir);
			const totalInputMb =
				(statSync(sourceDicomPath).size * FILE_COUNT) / 1024 / 1024;

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

			const page = await electronApp.firstWindow();
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
			await stubFolderDialog(electronApp, fixtureDir);

			// 初回はコード・ワーカー・コーデックの読込でメモリが増えるため、
			// 1 回目のクリア後を基準にして 2〜4 回目で増え続けないかを見る
			const idle = await snapshotRendererMemory(electronApp, page, session, {
				gc: true,
			});
			const warmupLoadMs = await loadAllAndBrowse(page);
			const warmupPeak = await snapshotRendererMemory(
				electronApp,
				page,
				session,
				{
					gc: false,
				},
			);
			await clearAll(page);
			const baseline = await snapshotRendererMemory(
				electronApp,
				page,
				session,
				{
					gc: true,
				},
			);

			const rows = [
				formatRow("起動直後", idle),
				formatRow(`ウォームアップ読込中 (${warmupLoadMs} ms)`, warmupPeak),
				formatRow("ウォームアップ後クリア（基準）", baseline),
			];
			const afterClear: RendererMemorySnapshot[] = [];
			for (let cycle = 1; cycle <= CYCLES; cycle++) {
				const loadMs = await loadAllAndBrowse(page);
				const loaded = await snapshotRendererMemory(
					electronApp,
					page,
					session,
					{
						gc: false,
					},
				);
				await clearAll(page);
				const cleared = await snapshotRendererMemory(
					electronApp,
					page,
					session,
					{
						gc: true,
					},
				);
				afterClear.push(cleared);
				rows.push(
					formatRow(`${cycle} 回目 読込中 (${loadMs} ms)`, loaded),
					formatRow(`${cycle} 回目 クリア後`, cleared),
				);
			}

			const final = afterClear[afterClear.length - 1];
			if (!final) throw new Error("no cycle snapshot");
			const growth = {
				jsHeapUsedMb: final.jsHeapUsedMb - baseline.jsHeapUsedMb,
				rendererWorkingSetMb:
					final.rendererWorkingSetMb - baseline.rendererWorkingSetMb,
				domNodes: final.domNodes - baseline.domNodes,
			};

			const report = [
				`# メモリリーク検証: ${FILE_COUNT} 枚読込 → クリア × ${CYCLES}`,
				"",
				`- 入力: ${FILE_COUNT} ファイル / 計 ${totalInputMb.toFixed(0)} MB（1 回あたり）`,
				`- 各回 ${FRAMES_TO_VISIT} 枚を送り表示してデコード済みキャッシュも経由`,
				"",
				"| 時点 | JS heap (MB) | レンダラー RSS (MB) | DOM ノード | JS リスナー |",
				"|---|---:|---:|---:|---:|",
				...rows,
				"",
				`- 基準→最終 JS heap 増加: ${growth.jsHeapUsedMb.toFixed(2)} MB（上限 ${MAX_HEAP_GROWTH_MB} MB）`,
				`- 基準→最終 RSS 増加: ${growth.rendererWorkingSetMb.toFixed(1)} MB（上限 ${MAX_WORKING_SET_GROWTH_MB} MB）`,
				`- 基準→最終 DOM ノード増加: ${growth.domNodes}（上限 ${MAX_DOM_NODE_GROWTH}）`,
			].join("\n");
			writeFileSync(resolve(resultDir, "memory-leak-report.md"), report);
			console.log(report);

			expect(pageErrors.map((error) => error.message)).toEqual([]);
			expect(growth.jsHeapUsedMb).toBeLessThan(MAX_HEAP_GROWTH_MB);
			expect(growth.rendererWorkingSetMb).toBeLessThan(
				MAX_WORKING_SET_GROWTH_MB,
			);
			expect(growth.domNodes).toBeLessThan(MAX_DOM_NODE_GROWTH);
		} finally {
			await electronApp?.close();
			await rendererServer?.close();
			rmSync(fixtureDir, { recursive: true, force: true });
			rmSync(emptyAutoloadDir, { recursive: true, force: true });
		}
	});
});
