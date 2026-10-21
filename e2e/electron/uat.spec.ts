import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
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
import { writeGeometryFixture } from "./dicom-fixture";
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
// 同じマシンの別クローンや並行ランと書き出し先を取り合わないよう、プロセスごとに分ける
const uatEvidenceDir = join(tmpdir(), `roentgen-uat-evidence-${process.pid}`);
const corruptFixtureDirPath = resolve(repoRoot, "public/corrupt-fixture");

// PNG は IEND チャンク（長さ0 + "IEND" + 固定CRC）で終わる。保存が原子的でないと
// 書き込み途中のファイルがパスに現れ、末尾が欠けてここで落ちる
const PNG_IEND_TRAILER = Buffer.from([
	0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
]);

const waitForExportedPng = async (filePath: string): Promise<Buffer> => {
	await expect.poll(() => existsSync(filePath), { timeout: 15_000 }).toBe(true);
	const png = readFileSync(filePath);
	expect(
		png.subarray(-PNG_IEND_TRAILER.length),
		`${filePath} が書き込み途中の状態で見えている (${png.length} bytes)`,
	).toEqual(PNG_IEND_TRAILER);
	return png;
};

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

// 書き出した PNG をオーバーレイ有り/無しで差分比較する。
// 外部デコーダを増やさず、nativeImage の BMP 化で比較する
const analyzeExportedPair = (
	app: ElectronApplication,
	withOverlay: string,
	plain: string,
) =>
	app.evaluate(
		({ nativeImage }, args) => {
			const a = nativeImage.createFromPath(args.withOverlay);
			const b = nativeImage.createFromPath(args.plain);
			const { width: w, height: h } = a.getSize();
			const ba = a.getBitmap();
			const bb = b.getBitmap();
			if (bb.length !== ba.length) {
				return {
					w,
					h,
					diff: -1,
					greenDiff: 0,
					orangeDiff: 0,
					centroidX: -1,
					centroidY: -1,
					whiteOnDark: -1,
					greenMinX: -1,
					greenMaxX: -1,
				};
			}
			let diff = 0;
			let greenDiff = 0;
			let orangeDiff = 0;
			let sumX = 0;
			let sumY = 0;
			let greenMinXPx = w;
			let greenMaxXPx = -1;
			const whiteIdx: number[] = [];
			for (let y = 0; y < h; y++) {
				for (let x = 0; x < w; x++) {
					const i = (y * w + x) * 4;
					const mag =
						Math.abs(ba[i] - bb[i]) +
						Math.abs(ba[i + 1] - bb[i + 1]) +
						Math.abs(ba[i + 2] - bb[i + 2]);
					if (mag < 40) continue;
					diff++;
					sumX += x;
					sumY += y;
					const blue = ba[i];
					const green = ba[i + 1];
					const red = ba[i + 2];
					if (green > 190 && red < 140 && green - red > 60) {
						greenDiff++;
						if (x < greenMinXPx) greenMinXPx = x;
						if (x > greenMaxXPx) greenMaxXPx = x;
					}
					if (red > 200 && green > 120 && green < 200 && blue < 90)
						orangeDiff++;
					if (red > 245 && green > 245 && blue > 245) whiteIdx.push(i);
				}
			}
			// 「×」ボタンの白文字は暗いボタン背景の上にしか現れない。
			// 明るい画像上のAAは除外するため、近傍が暗い白画素だけを数える
			let whiteOnDark = 0;
			for (const i of whiteIdx) {
				const p = i / 4;
				const x = p % w;
				const y = (p - x) / w;
				let dark = 0;
				let n = 0;
				for (const [dx, dy] of [
					[-4, 0],
					[4, 0],
					[0, -4],
					[0, 4],
					[-4, -4],
					[4, -4],
					[-4, 4],
					[4, 4],
				]) {
					const nx = x + dx;
					const ny = y + dy;
					if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
					const j = (ny * w + nx) * 4;
					if ((ba[j] + ba[j + 1] + ba[j + 2]) / 3 < 80) dark++;
					n++;
				}
				if (n > 0 && dark / n >= 0.5) whiteOnDark++;
			}
			return {
				w,
				h,
				diff,
				greenDiff,
				orangeDiff,
				centroidX: diff > 0 ? sumX / diff / w : -1,
				centroidY: diff > 0 ? sumY / diff / h : -1,
				whiteOnDark,
				greenMinX: greenDiff > 0 ? greenMinXPx / w : -1,
				greenMaxX: greenDiff > 0 ? greenMaxXPx / w : -1,
			};
		},
		{ withOverlay, plain },
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

// 回転やズームの描き直しは数フレームに分かれて届く。描画途中の指紋を基準にすると、
// 次の操作の前に描画が終わっただけで「変化なし」に見えるため、同じ指紋が続くまで待つ
const settledCanvasSignature = async (page: Page): Promise<string> => {
	let previous = await canvasSignature(page);
	await expect
		.poll(
			async () => {
				const current = await canvasSignature(page);
				const stable = current === previous;
				previous = current;
				return stable;
			},
			{ intervals: [250], timeout: 10_000 },
		)
		.toBe(true);
	return previous;
};

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

const waitForAutoloadedFixture = async (page: Page, minRatio = 0.3) => {
	await expect(page.locator("header")).toBeVisible({ timeout: 60_000 });
	await expect(page.getByText(/\d+ 枚/)).toBeVisible({ timeout: 60_000 });
	await expect
		.poll(() => canvasNonBlackRatio(page), { timeout: 60_000 })
		.toBeGreaterThan(minRatio);
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

// ツール切替・ズーム直後はリスナーの付け替え前に1点目が取りこぼされることがあるため、
// 点がちょうど1つ増えるまで押し直す（増えたら二重に押さない）。
// 人の操作では起きない間隔なので、押し直しは3回までに抑え、超えたら製品側の退行として落とす
const clickViewerPointAddsCircle = async (
	page: Page,
	xRatio: number,
	yRatio: number,
) => {
	const circles = page.locator("svg[aria-label='計測オーバーレイ'] circle");
	const baseline = await circles.count();
	let clicks = 0;
	await expect(async () => {
		if ((await circles.count()) === baseline) {
			clicks += 1;
			await clickViewerPoint(page, xRatio, yRatio);
		}
		await expect(circles).toHaveCount(baseline + 1, { timeout: 500 });
	}).toPass({ timeout: 10_000 });
	expect(clicks).toBeLessThanOrEqual(3);
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
			const sig0 = await settledCanvasSignature(page);
			await page.getByRole("button", { name: "右90°回転" }).click();
			await expect
				.poll(async () => canvasSignature(page), { timeout: 10_000 })
				.not.toBe(sig0);
			const sigRotated = await settledCanvasSignature(page);
			await page.locator(".openseadragon-canvas").first().hover();
			await page.mouse.wheel(0, -600);
			await expect
				.poll(async () => canvasSignature(page), { timeout: 10_000 })
				.not.toBe(sigRotated);
			const sigZoomed = await settledCanvasSignature(page);
			await page.getByRole("button", { name: "全体を表示" }).click();
			await expect
				.poll(async () => canvasSignature(page), { timeout: 10_000 })
				.not.toBe(sigZoomed);
			await page.getByRole("button", { name: "最初の状態に戻す" }).click();
			await page.screenshot({ path: join(screenshotDir, "u2-operations.png") });

			// ---- U3: オーナー向け見やすさプリセット
			for (const name of ["骨", "腱・筋肉", "蹄"]) {
				await settledCanvasSignature(page);
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
				page.locator("#osd-pane-0[data-measurement-tool='distance']"),
			).toBeVisible({ timeout: 5_000 });
			await clickViewerPointAddsCircle(page, 0.38, 0.35);
			await clickViewerPoint(page, 0.55, 0.6);
			const overlay = page.getByRole("img", { name: "計測オーバーレイ" });
			await expect(overlay).toBeVisible({ timeout: 10_000 });
			await expect(overlay.locator("text").first()).toContainText(/(mm|px)/);

			await page.getByRole("button", { name: "角度を測る" }).click();
			await expect(
				page.locator("#osd-pane-0[data-measurement-tool='angle']"),
			).toBeVisible({ timeout: 5_000 });
			await clickViewerPointAddsCircle(page, 0.4, 0.6);
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
			const plainPath = join(uatEvidenceDir, "uat-export-plain.png");
			const zoomedPath = join(uatEvidenceDir, "uat-export-zoomed.png");
			const zoomedPlainPath = join(
				uatEvidenceDir,
				"uat-export-zoomed-plain.png",
			);
			// evidence dir はランを跨いで残るため、前回のファイルが
			// existsSync で誤検出されないよう先に消す
			for (const p of [savePath, plainPath, zoomedPath, zoomedPlainPath]) {
				rmSync(p, { force: true });
			}
			await app.evaluate(({ dialog }, filePath) => {
				dialog.showSaveDialog = () =>
					Promise.resolve({ canceled: false, filePath });
			}, savePath);
			await page.getByRole("button", { name: "画像で保存" }).click();
			const png = await waitForExportedPng(savePath);
			expect(png.subarray(0, 8)).toEqual(
				Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
			);
			expect(png.length).toBeGreaterThan(10_000);
			console.info(`[uat] exported PNG bytes: ${png.length}`);

			// オーバーレイがPNGに焼き込まれているかを、計測を消した対照PNGとの
			// 画素差分で検査する（viewBox/foreignObject の退化はここで検出できる）
			await app.evaluate(({ dialog }, filePath) => {
				dialog.showSaveDialog = () =>
					Promise.resolve({ canceled: false, filePath });
			}, plainPath);
			// 「測った線を消す」は window.confirm を挟む — Playwright 既定は
			// ダイアログを dismiss するので、accept しないと消去が発火しない
			page.on("dialog", (dialog) => void dialog.accept());
			await page.getByRole("button", { name: "測った線を消す" }).click();
			await expect(
				page.locator("svg[aria-label='計測オーバーレイ'] circle"),
			).toHaveCount(0, { timeout: 5_000 });
			await page.getByRole("button", { name: "画像で保存" }).click();
			await waitForExportedPng(plainPath);

			const stats = await analyzeExportedPair(app, savePath, plainPath);
			console.info(`[uat] export pixel diff: ${JSON.stringify(stats)}`);
			// 線・丸・ラベル分の面積が差分として現れる
			expect(stats.diff).toBeGreaterThan(100);
			// 距離グリーン(#00ff88)・角度オレンジ(#ffaa00)の両方が入っている
			expect(stats.greenDiff).toBeGreaterThan(20);
			expect(stats.orangeDiff).toBeGreaterThan(10);
			// 差分の重心が計測位置（画面中央帯）にある — viewBox 無しで
			// 左上1:1スタンプに退化すると重心が画面左上へ寄って落ちる
			expect(stats.centroidX).toBeGreaterThan(0.32);
			expect(stats.centroidX).toBeLessThan(0.68);
			expect(stats.centroidY).toBeGreaterThan(0.35);
			expect(stats.centroidY).toBeLessThan(0.75);
			// 「×」削除ボタンの白文字が混入していないこと
			expect(stats.whiteOnDark).toBe(0);

			// ---- U7b: ズーム状態でのPNG保存 — オーバーレイが画像座標へ正しく写ること
			// 画面座標のSVGを画像解像度キャンバスへ全面引き延ばす旧実装では、
			// 線が画像全域へ引き延ばされてずれる退行をここで検出する
			const sigPreZoom = await settledCanvasSignature(page);
			await page.locator(".openseadragon-canvas").first().hover();
			await page.mouse.wheel(0, -600);
			await page.mouse.wheel(0, -600);
			await expect
				.poll(async () => canvasSignature(page), { timeout: 10_000 })
				.not.toBe(sigPreZoom);
			// ズームの描き直しが終わってから測る（途中だとクリック位置が画像上でずれる）
			await settledCanvasSignature(page);

			await page.getByRole("button", { name: "長さを測る" }).click();
			await expect(
				page.locator("#osd-pane-0[data-measurement-tool='distance']"),
			).toBeVisible({ timeout: 5_000 });
			await clickViewerPointAddsCircle(page, 0.3, 0.5);
			await clickViewerPointAddsCircle(page, 0.7, 0.5);

			await app.evaluate(({ dialog }, filePath) => {
				dialog.showSaveDialog = () =>
					Promise.resolve({ canceled: false, filePath });
			}, zoomedPath);
			await page.getByRole("button", { name: "画像で保存" }).click();
			await waitForExportedPng(zoomedPath);

			await app.evaluate(({ dialog }, filePath) => {
				dialog.showSaveDialog = () =>
					Promise.resolve({ canceled: false, filePath });
			}, zoomedPlainPath);
			await page.getByRole("button", { name: "測った線を消す" }).click();
			await expect(
				page.locator("svg[aria-label='計測オーバーレイ'] circle"),
			).toHaveCount(0, { timeout: 5_000 });
			await page.getByRole("button", { name: "画像で保存" }).click();
			await waitForExportedPng(zoomedPlainPath);

			const zoomedStats = await analyzeExportedPair(
				app,
				zoomedPath,
				zoomedPlainPath,
			);
			console.info(
				`[uat] zoomed export pixel diff: ${JSON.stringify(zoomedStats)}`,
			);
			expect(zoomedStats.greenDiff).toBeGreaterThan(20);
			// ズーム中は画像がペインより狭く(768/1100程度)なり、線が画像上で
			// 占める割合は画面比率(30-70%)より広く張る。全面引き延ばしの旧実装なら
			// 正規化範囲が常に 0.30-0.70 (=幅0.40) に留まりここで落ちる
			expect(zoomedStats.greenMinX).toBeLessThan(0.28);
			expect(zoomedStats.greenMaxX).toBeGreaterThan(0.72);
			expect(zoomedStats.greenMaxX - zoomedStats.greenMinX).toBeGreaterThan(
				0.45,
			);
			expect(zoomedStats.whiteOnDark).toBe(0);

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

	test("U9: WW/WC persists across frame switch, second pane, and restart", async () => {
		// 同シリーズ2枚（スタック）+ 別シリーズ1枚（2ペイン自動レイアウト）で、
		// ユーザーが選んだ WW/WC が後続の全画像へ DICOM 既定より優先されること
		test.setTimeout(300_000);
		const errors: string[] = [];
		const pageErrors: Error[] = [];
		const fixtureDir = mkdtempSync(join(tmpdir(), "roentgen-u9-"));
		const common = {
			rows: 256,
			columns: 256,
			pixelSpacing: [0.3, 0.3] as [number, number],
		};
		writeGeometryFixture(join(fixtureDir, "stack-1.dcm"), {
			...common,
			uid: "3101",
		});
		writeGeometryFixture(join(fixtureDir, "stack-2.dcm"), {
			...common,
			uid: "3101",
		});
		writeGeometryFixture(join(fixtureDir, "other-series.dcm"), {
			...common,
			uid: "3102",
		});
		const rendererServer = await startRendererDevServer();
		const userDataDir = createIsolatedUserDataDir();
		const launch = () =>
			electron.launch({
				args: electronLaunchArgs(userDataDir),
				env: {
					...process.env,
					ELECTRON_RUN_AS_NODE: "",
					NODE_ENV: "development",
					ROENTGEN_TEST_DICOM_DIR: fixtureDir,
					VITE_DEV_SERVER_URL: rendererServer.url,
				},
			});

		let app = await launch();
		let page = await app.firstWindow();
		trackConsole(page, errors, pageErrors);
		try {
			// 2シリーズ → 2ペイン自動レイアウト
			// リング+マーカーの疎な図形なので非黒率の閾値は実DICOMより低く取る
			await waitForAutoloadedFixture(page, 0.02);
			await expect(page.locator("#osd-pane-1")).toBeVisible({
				timeout: 30_000,
			});
			await page.screenshot({ path: join(screenshotDir, "u9-two-panes.png") });

			// プリセット適用（アクティブは pane-0）→ IPC 保存値を確認
			await page
				.getByRole("button", { name: /くわしい設定/ })
				.first()
				.click();
			await page
				.getByRole("button", { name: /馬・骨/ })
				.first()
				.click();
			await expect
				.poll(() => getWwwc(page), { timeout: 15_000 })
				.toEqual({ ww: 2500, wc: 500 });
			await expect(page.getByText(/WW 2500 \/ WC 500/)).toBeVisible({
				timeout: 10_000,
			});

			// スタック送り — fixture の DICOM 既定(3600/2150)でなく保持値が効く
			await page.locator("#osd-pane-0").click();
			await page.getByRole("button", { name: "次のフレーム" }).first().click();
			await expect(page.getByText("2 / 2")).toBeVisible({
				timeout: 10_000,
			});
			await page.locator("#osd-pane-0").click();
			await expect(page.getByText(/WW 2500 \/ WC 500/)).toBeVisible({
				timeout: 10_000,
			});
			// 2枚目のロード完了後も DICOM 既定値(3600)が出ていないこと（素通り防止）
			await expect
				.poll(
					async () => {
						await page.waitForTimeout(300);
						return page.getByText(/WW 3600 \/ WC 2150/).count();
					},
					{ timeout: 10_000 },
				)
				.toBe(0);
			await page.screenshot({
				path: join(screenshotDir, "u9-frame2-wwwc.png"),
			});

			await app.close();

			// 再起動 — pane-0 の2枚目送りでも pane-1 にも保存値が復元される
			app = await launch();
			page = await app.firstWindow();
			trackConsole(page, errors, pageErrors);
			await waitForAutoloadedFixture(page, 0.02);
			await expect(page.locator("#osd-pane-1")).toBeVisible({
				timeout: 30_000,
			});
			await page
				.getByRole("button", { name: "くわしい設定（獣医さん向け）" })
				.click();
			await page.getByRole("button", { name: "次のフレーム" }).first().click();
			await expect(page.getByText("2 / 2")).toBeVisible({ timeout: 10_000 });
			await page.locator("#osd-pane-0").click();
			await expect(page.getByText(/WW 2500 \/ WC 500/)).toBeVisible({
				timeout: 10_000,
			});
			// ペイン切替 — pane-1 にも同じ保存値がロード完了起点で適用されている
			await page.locator("#osd-pane-1").click();
			await expect(page.getByText(/WW 2500 \/ WC 500/)).toBeVisible({
				timeout: 10_000,
			});
			await page.screenshot({
				path: join(screenshotDir, "u9-restored-pane1.png"),
			});

			// 「最初の状態に戻す」— 選んだ値と保存値を破棄し、DICOM 既定値へ戻る
			await page
				.getByRole("button", { name: /最初の状態に戻す/ })
				.first()
				.click();
			await expect
				.poll(() => getWwwc(page), { timeout: 15_000 })
				.toBeUndefined();
			await expect(page.getByText(/WW 3600 \/ WC 2150/)).toBeVisible({
				timeout: 10_000,
			});
			// 戻した後に読み込む画像(前のフレーム)も DICOM 既定値のまま
			await page.locator("#osd-pane-0").click();
			await page.getByRole("button", { name: "前のフレーム" }).first().click();
			await expect(page.getByText("1 / 2")).toBeVisible({ timeout: 10_000 });
			await expect(page.getByText(/WW 3600 \/ WC 2150/)).toBeVisible({
				timeout: 10_000,
			});
			await expect(page.getByText(/WW 2500 \/ WC 500/)).toHaveCount(0);

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
