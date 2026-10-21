import { copyFileSync, mkdtempSync } from "node:fs";
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
	electronLaunchArgs,
	repoRoot,
	startRendererDevServer,
} from "./helpers";

// docs/user-guide.md のマウス操作の記述（ホイールの役割・起動時のモード）を実物で固定する。
// 以前はキーとボタン名だけ照合していて、2枚以上でのホイールの説明が実装とずれた
const screenshotDir = resolve(repoRoot, "test-results/mouse-wheel");

const fixtureDirWith = (count: number) => {
	const dir = mkdtempSync(join(tmpdir(), "roentgen-wheel-"));
	for (let i = 0; i < count; i++) {
		copyFileSync(
			resolve(repoRoot, "public/test.dcm"),
			join(dir, `image-${i}.dcm`),
		);
	}
	return dir;
};

const canvasSignature = async (page: Page) =>
	page.evaluate(() => {
		const canvas = document.querySelector(
			".openseadragon-canvas canvas",
		) as HTMLCanvasElement | null;
		if (!canvas) return "no-canvas";
		const context = canvas.getContext("2d");
		if (!context) return "no-context";
		const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
		let acc = 0;
		// 全画素のハッシュは重いので、一定間隔でサンプルした画素の和を指紋に使う
		for (let i = 0; i < data.length; i += 4096) acc = (acc + data[i]) % 1e9;
		return `${canvas.width}x${canvas.height}:${acc}`;
	});

// ズームの描き直しは数フレームに分かれるので、同じ指紋が続くまで待ってから基準にする
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

const launchWith = async (count: number) => {
	const server = await startRendererDevServer();
	const app = await electron.launch({
		args: electronLaunchArgs(),
		env: {
			...process.env,
			ELECTRON_RUN_AS_NODE: "",
			NODE_ENV: "development",
			ROENTGEN_TEST_DICOM_DIR: fixtureDirWith(count),
			VITE_DEV_SERVER_URL: server.url,
		},
	});
	const page = await app.firstWindow();
	await page.setViewportSize({ width: 1400, height: 900 });
	await expect(
		page.locator(".openseadragon-canvas canvas").first(),
	).toBeVisible({ timeout: 30_000 });
	return { app, page, server };
};

test.describe("user guide mouse claims", () => {
	test.beforeAll(() => {
		buildElectronApp();
	});

	test("one image: starts in 動かす mode and a plain wheel zooms", async () => {
		const { app, page, server } = await launchWith(1);
		try {
			await expect(
				page.getByRole("button", { name: "ドラッグで動かす" }),
			).toHaveAttribute("aria-pressed", "true");
			await expect(
				page.getByRole("button", { name: "ドラッグで明るさ調整" }),
			).toHaveAttribute("aria-pressed", "false");

			const before = await settledCanvasSignature(page);
			await page.locator(".openseadragon-canvas").first().hover();
			await page.mouse.wheel(0, -600);
			await expect
				.poll(async () => canvasSignature(page), { timeout: 10_000 })
				.not.toBe(before);
			await page.screenshot({
				path: join(screenshotDir, "one-image-wheel.png"),
			});
		} finally {
			await app.close();
			await server.close();
		}
	});

	test("two images: a plain wheel changes the image and Ctrl+wheel zooms", async () => {
		const { app, page, server } = await launchWith(2);
		try {
			await expect(page.getByText("1 / 2")).toBeVisible({ timeout: 30_000 });
			const canvas = page.locator(".openseadragon-canvas").first();

			await canvas.hover();
			await page.mouse.wheel(0, 300);
			await expect(page.getByText("2 / 2")).toBeVisible({ timeout: 10_000 });
			await page.mouse.wheel(0, -300);
			await expect(page.getByText("1 / 2")).toBeVisible({ timeout: 10_000 });

			const before = await settledCanvasSignature(page);
			await canvas.hover();
			await page.keyboard.down("Control");
			await page.mouse.wheel(0, -600);
			await page.keyboard.up("Control");
			await expect
				.poll(async () => canvasSignature(page), { timeout: 10_000 })
				.not.toBe(before);
			// 拡大しただけで画像は切り替わっていない
			await expect(page.getByText("1 / 2")).toBeVisible();
			await page.screenshot({
				path: join(screenshotDir, "two-images-ctrl-wheel.png"),
			});
		} finally {
			await app.close();
			await server.close();
		}
	});
});
