import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
	_electron as electron,
	expect,
	type Page,
	test,
} from "@playwright/test";
import {
	buildElectronApp,
	createIsolatedUserDataDir,
	electronLaunchArgs,
	repoRoot,
	startRendererDevServer,
	testDicomFixtureDirPath,
} from "./helpers";

// UAT(#111) は同一 userDataDir で再起動まで跨ぐため、生成したパスを保持する
const screenshotDir = resolve(repoRoot, "test-results/uat");
const uatEvidenceDir = join(tmpdir(), "roentgen-uat-evidence");
const corruptFixtureDirPath = resolve(repoRoot, "public/corrupt-fixture");

type RendererWindow = Window & {
	electronAPI: {
		windowState: {
			getWwwc: () => Promise<{ ww: number; wc: number } | undefined>;
		};
		gdrive: { hasCredentials: () => Promise<boolean> };
	};
};

const getWwwc = (page: Page) =>
	page.evaluate(() =>
		(window as unknown as RendererWindow).electronAPI.windowState.getWwwc(),
	);

const getGdriveHasCredentials = (page: Page) =>
	page.evaluate(() =>
		(window as unknown as RendererWindow).electronAPI.gdrive.hasCredentials(),
	);

const canvasSignature = async (page: Page) =>
	page.evaluate(() => {
		const canvas = document.querySelector(
			".openseadragon-canvas canvas",
		) as HTMLCanvasElement | null;
		if (!canvas) return "no-canvas";
		const context = canvas.getContext("2d");
		if (!context) return "no-context";
		const w = canvas.width;
		const h = canvas.height;
		const data = context.getImageData(0, 0, w, h).data;
		let acc = 0;
		// 全画素のハッシュは重いので、一定間隔でサンプルした画素の和を指紋に使う
		for (let i = 0; i < data.length; i += 4096) acc = (acc + data[i]) % 1e9;
		return `${w}x${h}:${acc}`;
	});

const canvasNonBlackRatio = async (page: Page) =>
	page.evaluate(() => {
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

const canvasAverageChannel = async (page: Page) =>
	page.evaluate(() => {
		const canvas = document.querySelector(
			".openseadragon-canvas canvas",
		) as HTMLCanvasElement | null;
		if (!canvas) return 0;
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

const waitForAutoloadedFixture = async (page: Page) => {
	await expect(page.locator("header")).toBeVisible({ timeout: 60_000 });
	await expect(page.getByText(/\d+ 枚/)).toBeVisible({ timeout: 60_000 });
	await expect
		.poll(() => canvasNonBlackRatio(page), { timeout: 60_000 })
		.toBeGreaterThan(0.3);
};

const clickViewerPoint = async (page: Page, xRatio: number, yRatio: number) => {
	const viewer = page.locator("#osd-pane-0");
	const viewerBox = await viewer.boundingBox();
	if (!viewerBox) throw new Error("viewer container has no bounding box");
	const clientX = viewerBox.x + viewerBox.width * xRatio;
	const clientY = viewerBox.y + viewerBox.height * yRatio;
	// page.mouse.click だと最前面の OSD canvas がイベントを止めるため、
	// 計測リスナーの張られたコンテナへ直接ディスパッチする
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

const trackConsole = (page: Page, errors: string[], pageErrors: Error[]) => {
	page.on("console", (message) => {
		if (message.type() === "error") errors.push(message.text());
	});
	page.on("pageerror", (error) => pageErrors.push(error));
};

test.beforeAll(() => {
	buildElectronApp();
	mkdirSync(screenshotDir, { recursive: true });
	mkdirSync(uatEvidenceDir, { recursive: true });
});

test.describe("UAT: real DICOM acceptance (U1-U8)", () => {
	test("U5: corrupt file surfaces Japanese error without crash", async () => {
		const errors: string[] = [];
		const pageErrors: Error[] = [];
		const rendererServer = await startRendererDevServer();
		const app = await electron.launch({
			args: electronLaunchArgs(),
			env: {
				...process.env,
				ELECTRON_RUN_AS_NODE: "",
				NODE_ENV: "development",
				ROENTGEN_TEST_DICOM_DIR: corruptFixtureDirPath,
				VITE_DEV_SERVER_URL: rendererServer.url,
			},
		});
		const page = await app.firstWindow();
		trackConsole(page, errors, pageErrors);
		try {
			await expect(page.locator("header")).toBeVisible({ timeout: 60_000 });
			const errorChip = page.getByText(/エラー[:：]/);
			await expect(errorChip).toBeVisible({ timeout: 30_000 });
			await expect(errorChip).toContainText(/レントゲン画像ではありません/);
			await page.screenshot({ path: join(screenshotDir, "u5-corrupt.png") });
			expect(pageErrors.map((e) => e.message)).toEqual([]);
		} finally {
			await app.close();
			await rendererServer.close();
		}
	});

	test("U1-U4, U6-U8: load, operate, presets, measure, save, restore", async () => {
		// 起動→操作→計測→保存→再起動復元まで踏む長めシナリオのため延長
		test.setTimeout(240_000);
		const errors: string[] = [];
		const pageErrors: Error[] = [];
		const rendererServer = await startRendererDevServer();
		const userDataDir = createIsolatedUserDataDir();
		const launch = () =>
			electron.launch({
				args: electronLaunchArgs(userDataDir),
				env: {
					...process.env,
					ELECTRON_RUN_AS_NODE: "",
					NODE_ENV: "development",
					ROENTGEN_TEST_DICOM_DIR: testDicomFixtureDirPath,
					VITE_DEV_SERVER_URL: rendererServer.url,
				},
			});

		let app = await launch();
		let page = await app.firstWindow();
		trackConsole(page, errors, pageErrors);
		try {
			// ---- U1: 起動と実DICOM読み込み
			await waitForAutoloadedFixture(page);
			await page.screenshot({ path: join(screenshotDir, "u1-loaded.png") });

			// ---- U6: Google Drive — 認証情報の有無だけ記録（実接続は資格情報が要るため）
			const gdriveReady = await getGdriveHasCredentials(page);
			console.info(`[uat] gdrive credentials configured: ${gdriveReady}`);

			// ---- U2: 日常操作（回転 → ズーム → 全体表示 → リセット）
			// 回転ボタンは「くわしい設定」折りたたみ内にあるため先に展開する
			await page
				.getByRole("button", { name: "くわしい設定（獣医さん向け）" })
				.click();
			const sig0 = await canvasSignature(page);
			await page.getByRole("button", { name: "右90°回転" }).click();
			await expect
				.poll(async () => canvasSignature(page), { timeout: 10_000 })
				.not.toBe(sig0);
			const sigRotated = await canvasSignature(page);
			await page.locator(".openseadragon-canvas").first().hover();
			await page.mouse.wheel(0, -600);
			await expect
				.poll(async () => canvasSignature(page), { timeout: 10_000 })
				.not.toBe(sigRotated);
			const sigZoomed = await canvasSignature(page);
			await page.getByRole("button", { name: "全体を表示" }).click();
			await expect
				.poll(async () => canvasSignature(page), { timeout: 10_000 })
				.not.toBe(sigZoomed);
			await page.getByRole("button", { name: "最初の状態に戻す" }).click();
			await page.screenshot({ path: join(screenshotDir, "u2-operations.png") });

			// ---- U3: オーナー向け見やすさプリセット
			for (const name of ["骨", "腱・筋肉", "蹄"]) {
				const before = await canvasAverageChannel(page);
				await page.getByRole("button", { name: `${name}を見やすく` }).click();
				await expect
					.poll(
						async () => Math.abs((await canvasAverageChannel(page)) - before),
						{ timeout: 10_000 },
					)
					.toBeGreaterThan(2);
			}
			await page.screenshot({ path: join(screenshotDir, "u3-presets.png") });

			// ---- U4: 距離・角度計測
			await page.getByRole("button", { name: "長さを測る" }).click();
			await expect(
				page.locator("#osd-pane-0[data-measurement-ready='true']"),
			).toBeVisible({ timeout: 5_000 });
			await clickViewerPoint(page, 0.38, 0.35);
			await expect(
				page.locator("svg[aria-label='計測オーバーレイ'] circle"),
			).toHaveCount(1, { timeout: 5_000 });
			await clickViewerPoint(page, 0.55, 0.6);
			const overlay = page.getByRole("img", { name: "計測オーバーレイ" });
			await expect(overlay).toBeVisible({ timeout: 10_000 });
			await expect(overlay.locator("text").first()).toContainText(/(mm|px)/);

			await page.getByRole("button", { name: "角度を測る" }).click();
			await expect(
				page.locator("#osd-pane-0[data-measurement-ready='true']"),
			).toBeVisible({ timeout: 5_000 });
			await clickViewerPoint(page, 0.4, 0.6);
			await clickViewerPoint(page, 0.5, 0.35);
			await clickViewerPoint(page, 0.6, 0.6);
			await expect(overlay.locator("text").last()).toContainText(/°/, {
				timeout: 10_000,
			});
			await page.screenshot({
				path: join(screenshotDir, "u4-measurement.png"),
			});

			// ---- U7: PNG保存（ネイティブ保存ダイアログは stub し、実ファイル書き込みを検証）
			const savePath = join(uatEvidenceDir, "uat-export.png");
			await app.evaluate(({ dialog }, filePath) => {
				dialog.showSaveDialog = () =>
					Promise.resolve({ canceled: false, filePath });
			}, savePath);
			await page.getByRole("button", { name: "画像で保存" }).click();
			await expect
				.poll(() => existsSync(savePath), { timeout: 15_000 })
				.toBe(true);
			const png = readFileSync(savePath);
			expect(png.subarray(0, 8)).toEqual(
				Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
			);
			expect(png.length).toBeGreaterThan(10_000);
			console.info(`[uat] exported PNG bytes: ${png.length}`);

			// ---- U8: WW/WC を変更して終了 → 同プロファイルで再起動して復元
			await page
				.getByRole("button", { name: /馬・骨/ })
				.first()
				.click();
			await expect
				.poll(() => getWwwc(page), { timeout: 15_000 })
				.toEqual({ ww: 2500, wc: 500 });
			await app.close();

			app = await launch();
			page = await app.firstWindow();
			trackConsole(page, errors, pageErrors);
			await waitForAutoloadedFixture(page);
			expect(await getWwwc(page)).toEqual({ ww: 2500, wc: 500 });
			// 復元値が実際に表示中の画像へ適用されていること（DICOM既定でなく保存値）
			await page
				.getByRole("button", { name: "くわしい設定（獣医さん向け）" })
				.click();
			await expect(page.getByText(/WW 2500 \/ WC 500/)).toBeVisible({
				timeout: 10_000,
			});
			await page.screenshot({ path: join(screenshotDir, "u8-restored.png") });

			// コンソール error は既知の allowlist を除きゼロであること
			const realErrors = errors.filter(
				(e) =>
					!e.includes("removeImageLoadObject") &&
					!e.toLowerCase().includes("react"),
			);
			expect(realErrors).toEqual([]);
			expect(pageErrors.map((e) => e.message)).toEqual([]);
		} finally {
			await app.close();
			await rendererServer.close();
		}
	});
});
