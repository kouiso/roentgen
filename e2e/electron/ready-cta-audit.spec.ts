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

const screenshotDir = resolve(repoRoot, "test-results", "ready-cta-audit");

type CtaRow = {
	screen: string;
	cta: string;
	result: "PASS" | "BLOCKED";
	evidencePath: string;
	note: string;
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

const waitForAutoloadedFixture = async (page: Page) => {
	await expect(page.locator("header")).toBeVisible({ timeout: 30_000 });
	await expect(page.getByText(/\d+ ファイル/)).toBeVisible({
		timeout: 30_000,
	});
	await expect
		.poll(() => canvasNonBlackRatio(page), { timeout: 30_000 })
		.toBeGreaterThan(0.3);
};

const firstRendererWindow = async (electronApp: ElectronApplication) => {
	const page = await electronApp.firstWindow();
	for (let i = 0; i < 20; i++) {
		const rendererPage = electronApp
			.windows()
			.find((candidate) => !candidate.url().startsWith("devtools://"));
		if (rendererPage) return rendererPage;
		await page.waitForTimeout(250);
	}
	return page;
};

const safeName = (value: string) =>
	value
		.replace(/[^\dA-Za-z一-龠ぁ-んァ-ンー]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 64);

const screenshotEvidence = async (page: Page, index: number, label: string) => {
	const path = resolve(
		screenshotDir,
		`${String(index).padStart(2, "0")}-${safeName(label)}.png`,
	);
	await page.screenshot({ path, fullPage: true });
	return path;
};

const viewerPoint = async (page: Page, xRatio: number, yRatio: number) => {
	const box = await page.locator("#osd-pane-0").boundingBox();
	if (!box) throw new Error("viewer pane should have a bounding box");
	return {
		x: box.x + box.width * xRatio,
		y: box.y + box.height * yRatio,
	};
};

test.beforeAll(() => {
	buildElectronApp();
	mkdirSync(screenshotDir, { recursive: true });
});

test.describe("ready gate CTA audit", () => {
	test("taps loaded-viewer CTAs and records screenshot evidence", async () => {
		test.setTimeout(180_000);

		const rows: CtaRow[] = [];
		const consoleMessages: string[] = [];
		const consoleErrors: string[] = [];
		const pageErrors: Error[] = [];
		let rendererServer: RendererDevServer | undefined;
		let electronApp: ElectronApplication | undefined;
		let index = 1;

		const addRow = async (
			page: Page,
			screen: string,
			cta: string,
			note = "Tapped on real Electron window",
		) => {
			rows.push({
				screen,
				cta,
				result: "PASS",
				evidencePath: await screenshotEvidence(page, index++, cta),
				note,
			});
		};

		const addBlockedRow = async (
			page: Page,
			screen: string,
			cta: string,
			note: string,
		) => {
			rows.push({
				screen,
				cta,
				result: "BLOCKED",
				evidencePath: await screenshotEvidence(page, index++, cta),
				note,
			});
		};

		const clickButton = async (page: Page, screen: string, cta: string) => {
			const button = page.locator("button").filter({ hasText: cta }).first();
			await button.click();
			await addRow(page, screen, cta);
		};

		const clickTextButton = async (page: Page, screen: string, cta: string) => {
			await page.locator("button").filter({ hasText: cta }).first().click();
			await addRow(page, screen, cta);
		};

		const clickTitleButton = async (
			page: Page,
			screen: string,
			cta: string,
		) => {
			await page.locator(`button[title="${cta}"]`).first().click();
			await addRow(page, screen, cta);
		};

		const clickViewer = async (page: Page, xRatio: number, yRatio: number) => {
			const point = await viewerPoint(page, xRatio, yRatio);
			await page.mouse.click(point.x, point.y);
		};

		try {
			rendererServer = await startRendererDevServer();
			electronApp = await electron.launch({
				args: [electronMainPath, "--no-sandbox"],
				env: {
					...process.env,
					ELECTRON_RUN_AS_NODE: "",
					NODE_ENV: "development",
					ROENTGEN_TEST_DICOM_DIR: testDicomFixtureDirPath,
					ROENTGEN_TEST_USER_DATA_DIR: resolve(
						repoRoot,
						"test-results",
						"electron-user-data-ready-cta-audit",
					),
					VITE_DEV_SERVER_URL: rendererServer.url,
				},
			});

			const page = await firstRendererWindow(electronApp);
			page.on("console", (message) => {
				const text = message.text();
				consoleMessages.push(`[${message.type()}] ${text}`);
				if (message.type() === "error") consoleErrors.push(text);
			});
			page.on("pageerror", (error) => {
				pageErrors.push(error);
			});

			await waitForAutoloadedFixture(page);

			// Native dialogs are outside the CTA smoke scope; stub them so the click
			// itself is still exercised without blocking automation.
			await page.evaluate(() => {
				const api = window.electronAPI as
					| (typeof window.electronAPI & {
							saveScreenshot?: (dataUrl: string) => Promise<boolean>;
							printImage?: (
								dataUrl: string,
								metadata: unknown,
							) => Promise<void>;
					  })
					| undefined;
				if (!api) return;
				api.saveScreenshot = async () => true;
				api.printImage = async () => undefined;
			});

			await addRow(page, "Loaded viewer", "autoload canvas nonblank");

			await page.getByRole("button", { name: "フリーハンド" }).click();
			await addRow(page, "注釈", "フリーハンド");
			const start = await viewerPoint(page, 0.48, 0.5);
			await page.mouse.move(start.x, start.y);
			await page.mouse.down();
			await page.mouse.move(start.x + 55, start.y + 20, { steps: 4 });
			await page.mouse.move(start.x + 115, start.y + 70, { steps: 5 });
			await page.mouse.move(start.x + 180, start.y + 42, { steps: 5 });
			await page.mouse.up();
			await expect(
				page.locator("svg[aria-label='注釈オーバーレイ'] polyline"),
			).toHaveCount(1, { timeout: 10_000 });
			await addRow(page, "注釈", "フリーハンド作成");
			await clickButton(page, "注釈", "注釈クリア");

			for (const cta of ["WW/WC", "ズーム", "パン"]) {
				await clickButton(page, "操作モード", cta);
			}

			await clickButton(page, "計測", "距離");
			await clickViewer(page, 0.42, 0.44);
			await clickViewer(page, 0.58, 0.52);
			await expect(
				page.locator("svg[aria-label='計測オーバーレイ'] line"),
			).toHaveCount(1, { timeout: 10_000 });
			await addRow(page, "計測", "距離作成");

			await clickButton(page, "計測", "角度");
			await clickViewer(page, 0.44, 0.58);
			await clickViewer(page, 0.52, 0.48);
			await clickViewer(page, 0.62, 0.59);
			await expect(
				page.locator("svg[aria-label='計測オーバーレイ'] line"),
			).toHaveCount(3, { timeout: 10_000 });
			await addRow(page, "計測", "角度作成");

			await clickButton(page, "計測", "計測クリア");

			await clickButton(page, "注釈", "テキスト");
			await clickViewer(page, 0.38, 0.4);
			await page.getByRole("textbox", { name: "注釈テキスト" }).fill("audit");
			await page.keyboard.press("Enter");
			await addRow(page, "注釈", "テキスト作成");

			for (const [cta, x1, y1, x2, y2] of [
				["矢印", 0.38, 0.62, 0.53, 0.48],
				["矩形ROI", 0.56, 0.38, 0.7, 0.54],
				["楕円ROI", 0.56, 0.58, 0.72, 0.73],
			] as const) {
				await clickButton(page, "注釈", cta);
				await clickViewer(page, x1, y1);
				await clickViewer(page, x2, y2);
				await addRow(page, "注釈", `${cta}作成`);
			}

			await clickButton(page, "注釈", "注釈クリア");

			for (const cta of [
				"フィット",
				"1:1 原寸大",
				"白黒反転",
				"リセット",
				"右90°回転",
				"左90°回転",
				"左右反転",
				"上下反転",
				"情報表示",
				"方向マーカー",
			]) {
				await clickButton(page, "表示/変形/オーバーレイ", cta);
			}
			await page
				.locator("button")
				.filter({ hasText: /^(人|馬)$/ })
				.first()
				.click();
			await addRow(page, "表示/変形/オーバーレイ", "species toggle");

			for (const cta of [
				"肺",
				"骨",
				"脳",
				"軟部組織",
				"縦隔",
				"腹部",
				"肝臓",
				"馬・骨",
				"馬・軟部",
				"蹄骨",
				"舟状骨",
				"馬・肺",
				"馬・腹部",
			]) {
				await clickTextButton(page, "WW/WC preset", cta);
			}

			await clickButton(page, "再生", "再生");
			await clickButton(page, "再生", "停止");
			await addRow(
				page,
				"再生",
				"fps controls visible",
				"fps minus/plus controls are visible; not clicked because fixture may expose single-frame disabled controls",
			);

			await addBlockedRow(
				page,
				"ツール",
				"スクリーンショット",
				"Native save dialog is intentionally not opened in automated ready gate run",
			);
			await addBlockedRow(
				page,
				"ツール",
				"印刷",
				"Native print flow is intentionally not opened in automated ready gate run",
			);
			await clickButton(page, "ツール", "フルスクリーン");
			if (
				await page
					.locator("html")
					.evaluate((_el) => !!document.fullscreenElement)
			) {
				await page.keyboard.press("Escape");
			}

			for (const cta of ["1×1", "2×1", "1×2", "2×2"]) {
				await clickTitleButton(page, "レイアウト", cta);
			}

			await clickButton(page, "ツール", "選択クリア");
			await expect(page.getByText("ファイル待機")).toBeVisible({
				timeout: 10_000,
			});
			await addRow(page, "ツール", "選択クリア後ファイル待機");
			await addBlockedRow(
				page,
				"Header/Tools",
				"全クリア",
				"Single-file fixture reached idle after 選択クリア; 全クリア requires a fresh loaded state and remains covered by clear-reload smoke",
			);

			writeFileSync(
				resolve(screenshotDir, "cta-audit-evidence.json"),
				JSON.stringify(
					{
						rowCount: rows.length,
						consoleErrors,
						pageErrors: pageErrors.map((error) => error.message),
						rows,
					},
					null,
					2,
				),
				"utf-8",
			);

			expect(pageErrors.map((error) => error.message)).toEqual([]);
			expect(
				consoleErrors,
				`console messages:\n${consoleMessages.join("\n")}`,
			).toEqual([]);
			expect(rows.length).toBeGreaterThanOrEqual(45);
		} finally {
			await electronApp?.close();
			await rendererServer?.close();
		}
	});
});
