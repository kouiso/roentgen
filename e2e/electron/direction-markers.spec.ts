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
import { writeGeometryFixture } from "./dicom-fixture";
import {
	buildElectronApp,
	electronMainPath,
	type RendererDevServer,
	repoRoot,
	startRendererDevServer,
} from "./helpers";

const screenshotDir = resolve(repoRoot, "test-results");

type Side = "top" | "bottom" | "left" | "right";
type Markers = Record<Side, string>;

// F マーカー（画像の左上隅に描いた最も明るい図形）が、リング中心から見て画面のどの隅にあるか
const readMarkerCorner = (
	page: Page,
): Promise<{ horizontal: Side; vertical: Side } | null> =>
	page.evaluate(() => {
		const canvas = document.querySelector(
			"#osd-pane-0 .openseadragon-canvas canvas",
		) as HTMLCanvasElement | null;
		if (!canvas || canvas.width === 0 || canvas.height === 0) return null;
		const context = canvas.getContext("2d");
		if (!context) return null;
		const { data, width, height } = context.getImageData(
			0,
			0,
			canvas.width,
			canvas.height,
		);
		let markerX = 0;
		let markerY = 0;
		let markerCount = 0;
		let ringX = 0;
		let ringY = 0;
		let ringCount = 0;
		for (let y = 0; y < height; y++) {
			for (let x = 0; x < width; x++) {
				const value = data[(y * width + x) * 4] ?? 0;
				if (value > 220) {
					markerX += x;
					markerY += y;
					markerCount++;
				} else if (value >= 60 && value <= 180) {
					ringX += x;
					ringY += y;
					ringCount++;
				}
			}
		}
		if (markerCount === 0 || ringCount === 0) return null;
		return {
			horizontal: markerX / markerCount < ringX / ringCount ? "left" : "right",
			vertical: markerY / markerCount < ringY / ringCount ? "top" : "bottom",
		};
	});

const readMarkers = (page: Page): Promise<Markers | null> =>
	page.evaluate(() => {
		const read = (side: string) =>
			document.querySelector(`[data-testid='direction-marker-${side}']`)
				?.textContent ?? null;
		const top = read("top");
		const bottom = read("bottom");
		const left = read("left");
		const right = read("right");
		if (top === null || bottom === null || left === null || right === null) {
			return null;
		}
		return { top, bottom, left, right };
	});

// 画像の左上隅は「近位」かつ「掌側/底側」側。回転・反転しても F マーカーの隅にこの2語が来ること
const expectMarkersFollowImage = async (
	page: Page,
	expected: Markers,
	label: string,
) => {
	await expect
		.poll(() => readMarkers(page), { message: label })
		.toEqual(expected);
	const isDicomCodes = expected.top === expected.top.toUpperCase();
	// 回転・リセット直後はキャンバスの再描画が終わるまで画素が読めないことがある
	await expect
		.poll(
			async () => {
				const corner = await readMarkerCorner(page);
				if (!corner) return null;
				return [expected[corner.horizontal], expected[corner.vertical]].sort();
			},
			{ message: `${label}: F marker corner labels` },
		)
		.toEqual(isDicomCodes ? ["PA/PL", "PR"] : ["Pa/Pl", "Pr"]);
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
	await page.setViewportSize({ width: 1400, height: 900 });
	await expect(page.getByText(/\d+ 枚/)).toBeVisible({ timeout: 30_000 });
	await expect
		.poll(() => readMarkerCorner(page), { timeout: 30_000 })
		.not.toBeNull();
	await page.getByRole("button", { name: /くわしい設定/ }).click();
	return { app, page, pageErrors };
};

let fixtureDir: string;

test.beforeAll(() => {
	buildElectronApp();
	mkdirSync(screenshotDir, { recursive: true });
	fixtureDir = mkdtempSync(join(tmpdir(), "roentgen-direction-fixture-"));
	// 前肢遠位の外内側像を想定: 画像の右が背側(D)、下が遠位(DI)
	writeGeometryFixture(join(fixtureDir, "lateromedial.dcm"), {
		rows: 240,
		columns: 320,
		pixelSpacing: [0.5, 0.5],
		uid: "20261009",
		patientOrientation: "D\\DI",
		anatomicalOrientationType: "QUADRUPED",
	});
});

test.describe("real Electron direction markers", () => {
	test("equine markers come from Patient Orientation, follow rotate/flip and the setting persists", async () => {
		let rendererServer: RendererDevServer | undefined;
		const apps: ElectronApplication[] = [];
		const userDataDir = mkdtempSync(join(tmpdir(), "roentgen-direction-user-"));
		try {
			rendererServer = await startRendererDevServer();
			const first = await launch(rendererServer.url, fixtureDir, userDataDir);
			apps.push(first.app);
			const { page } = first;

			await expectMarkersFollowImage(
				page,
				{ top: "Pr", bottom: "Di", left: "Pa/Pl", right: "Do" },
				"as loaded",
			);
			await page.screenshot({
				path: resolve(screenshotDir, "direction-markers-equine.png"),
			});

			await page.getByRole("button", { name: "右90°回転" }).click();
			await expectMarkersFollowImage(
				page,
				{ top: "Pa/Pl", bottom: "Do", left: "Di", right: "Pr" },
				"rotated 90° clockwise",
			);
			await page.screenshot({
				path: resolve(screenshotDir, "direction-markers-rotated.png"),
			});

			await page.getByRole("button", { name: "左右反転" }).click();
			await expectMarkersFollowImage(
				page,
				{ top: "Pa/Pl", bottom: "Do", left: "Pr", right: "Di" },
				"rotated then flipped horizontally",
			);

			await page.getByRole("button", { name: "最初の状態に戻す" }).click();
			await expectMarkersFollowImage(
				page,
				{ top: "Pr", bottom: "Di", left: "Pa/Pl", right: "Do" },
				"after reset",
			);

			const speciesToggle = page.getByRole("button", {
				name: "方向を馬の用語で表示",
			});
			await expect(speciesToggle).toHaveAttribute("aria-pressed", "true");
			await speciesToggle.click();
			await expect(speciesToggle).toHaveAttribute("aria-pressed", "false");
			await expectMarkersFollowImage(
				page,
				{ top: "PR", bottom: "DI", left: "PA/PL", right: "D" },
				"DICOM codes",
			);
			expect(first.pageErrors).toEqual([]);
			await first.app.close();
			apps.pop();

			const second = await launch(rendererServer.url, fixtureDir, userDataDir);
			apps.push(second.app);
			await expect(
				second.page.getByRole("button", { name: "方向を馬の用語で表示" }),
			).toHaveAttribute("aria-pressed", "false");
			await expectMarkersFollowImage(
				second.page,
				{ top: "PR", bottom: "DI", left: "PA/PL", right: "D" },
				"after restart",
			);
			expect(second.pageErrors).toEqual([]);
		} finally {
			for (const app of apps) await app.close().catch(() => undefined);
			await rendererServer?.close();
		}
	});
});
