#!/usr/bin/env node
// なぜ: 実検査画像を再利用せず、実 renderer の新しい検証証跡として再撮影する。
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, expect } from "@playwright/test";
import { createServer } from "vite";
import { createSyntheticDicom } from "./generate-synthetic-dicom.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const output = resolve(root, "test-results/synthetic-ui");
const git = (...args) =>
	execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
const baseCommit = git("rev-parse", "HEAD");
// なぜ: 機能変更を混ぜず、撮影時の未コミット最小差分もファイル別digestで再現できるようにする。
git(
	"diff",
	"--exit-code",
	"--",
	"src/hooks",
	"src/components",
	"src/app.tsx",
	"src/main.tsx",
	"electron",
	"app.css",
	"vite.config.ts",
	"e2e/vite-renderer.config.ts",
);
const fixture = readFileSync(resolve(root, "public/test.dcm"));
assert.ok(
	fixture.equals(createSyntheticDicom()),
	"Only the generated synthetic fixture is allowed",
);
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const sourcePaths = [
	...new Set([
		...git(
			"ls-files",
			"--",
			"src",
			"electron",
			"app.css",
			"index.html",
			"package.json",
			"pnpm-lock.yaml",
			"vite.config.ts",
			"vitest.config.ts",
			"e2e/vite-renderer.config.ts",
		).split("\n"),
		"scripts/generate-synthetic-dicom.mjs",
	]),
].sort();
const sourceFiles = Object.fromEntries(
	sourcePaths.map((path) => [path, sha256(readFileSync(resolve(root, path)))]),
);
const sourceTreeSha256 = sha256(
	sourcePaths.map((path) => `${path}\0${sourceFiles[path]}\n`).join(""),
);

const fixtureSha256 = sha256(fixture);
const comparisonFixture = createSyntheticDicom({ comparison: true });
const executablePath = process.env.ROENTGEN_CAPTURE_BROWSER;
assert.ok(
	executablePath && existsSync(executablePath),
	"Set ROENTGEN_CAPTURE_BROWSER to an existing test browser; no download is performed",
);
mkdirSync(output, { recursive: true });

let server;
let browser;
let page;
const errors = [];
const externalRequests = [];
const checks = [];
const captures = [];
const supplementaryChecks = [];
const check = (name, passed) => {
	assert.ok(passed, name);
	checks.push(name);
};

try {
	server = await createServer({
		root,
		cacheDir: resolve(root, "test-results/.vite-synthetic"),
		configFile: resolve(root, "e2e/vite-renderer.config.ts"),
		server: { host: "127.0.0.1", port: 5173, strictPort: true, watch: null },
		optimizeDeps: { include: ["openseadragon"] },
	});
	await server.listen();
	const origin = server.resolvedUrls.local[0];
	browser = await chromium.launch({
		headless: true,
		executablePath,
		args: ["--disable-background-networking", "--renderer-process-limit=1"],
	});
	const context = await browser.newContext({
		viewport: { width: 1440, height: 1000 },
		deviceScaleFactor: 1,
	});
	await context.route("**/*", async (route) => {
		const url = route.request().url();
		if (url === new URL("/__synthetic-comparison.dcm", origin).href) {
			return route.fulfill({
				status: 200,
				contentType: "application/dicom",
				body: comparisonFixture,
			});
		}
		if (url.startsWith(origin) || /^(data|blob):/.test(url))
			return route.continue();
		externalRequests.push(new URL(url).origin);
		await route.abort();
	});
	await context.addInitScript(() => {
		Object.defineProperty(navigator, "hardwareConcurrency", { get: () => 2 });
		const syntheticPath = "/synthetic/test.dcm";
		const comparisonPath = "/synthetic/comparison.dcm";
		const readSynthetic = async () => (await fetch("/test.dcm")).arrayBuffer();
		let onOpen;
		window.openSyntheticComparison = () => {
			if (!onOpen) throw new Error("Synthetic input bridge is not subscribed");
			onOpen([syntheticPath, comparisonPath]);
		};
		const unavailable = async () => {
			throw new Error("External services disabled for synthetic capture");
		};
		window.electronAPI = {
			loadTestDicom: async () => [
				{ path: syntheticPath, data: await readSynthetic() },
			],
			selectDicomFiles: async () => [syntheticPath],
			readFile: async (path) => {
				if (path === comparisonPath)
					return (await fetch("/__synthetic-comparison.dcm")).arrayBuffer();
				if (path !== syntheticPath)
					throw new Error("Only synthetic input is allowed");
				return readSynthetic();
			},
			loadAnnotations: async () => null,
			saveAnnotations: async () => true,
			onOpenDicomFiles: (callback) => {
				onOpen = callback;
				return () => {
					onOpen = undefined;
				};
			},
			windowState: {
				getWwwc: async () => undefined,
				setWwwc: async () => {},
				clearWwwc: async () => {},
			},
			crashReporter: { getStatus: async () => ({ enabled: false }) },
			gdrive: {
				hasCredentials: async () => false,
				authStatus: async () => ({ authenticated: false }),
				onDownloadProgress: () => () => {},
				authorize: unavailable,
				listDicom: unavailable,
				download: unavailable,
				syncToSeed: unavailable,
			},
		};
	});
	page = await context.newPage();
	page.on("pageerror", (error) => errors.push(error.message));
	page.on("console", (message) => {
		if (message.type() === "error") errors.push(message.text());
	});
	await page.goto(origin, { waitUntil: "networkidle" });
	await expect(page.locator("header")).toContainText("ROENTGEN");
	await expect(page.getByLabel("画像の操作パネル")).toBeVisible();
	await page.evaluate(
		({ sourceTreeSha256 }) => {
			// なぜ: 証跡のラベルは UI に重ねず、アプリの外側に専用領域を設ける。
			document.querySelector("#root > div").style.height = "calc(100vh - 64px)";
			const caption = document.createElement("aside");
			caption.id = "synthetic-capture-caption";
			caption.style.cssText =
				"position:fixed;left:0;bottom:0;width:100%;height:64px;box-sizing:border-box;background:#f8fafc;color:#111827;padding:8px 16px;font:12px/22px monospace;white-space:pre;border-top:2px solid #0f766e";
			caption.textContent = `SYNTHETIC FIXTURE — SYNTHETIC_DX_1 — NEW current renderer verification (not historical before/after)\nSource tree ${sourceTreeSha256} | renderer + synthetic IPC bridge | state: loading`;
			document.body.append(caption);
		},
		{ sourceTreeSha256 },
	);
	const stats = () =>
		page.locator(".openseadragon-canvas canvas").evaluateAll((canvases) =>
			canvases.map((canvas) => {
				const ctx = canvas.getContext("2d");
				if (!ctx || !canvas.width || !canvas.height)
					return { hash: "empty", ratio: 0 };
				const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
				let hash = 2166136261;
				let nonBlack = 0;
				let count = 0;
				for (let i = 0; i < data.length; i += 64) {
					hash = Math.imul(hash ^ data[i], 16777619);
					if (data[i] > 12 && data[i + 3] > 0) nonBlack++;
					count++;
				}
				return {
					width: canvas.width,
					height: canvas.height,
					hash: (hash >>> 0).toString(16),
					ratio: nonBlack / count,
				};
			}),
		);
	await expect
		.poll(async () => (await stats())[0]?.ratio ?? 0, { timeout: 60000 })
		.toBeGreaterThan(0.1);
	const stable = async () => {
		let previous;
		await expect
			.poll(
				async () => {
					const pixels = await stats();
					const current = JSON.stringify(pixels);
					const same =
						pixels.length > 0 &&
						pixels.every((value) => value.ratio > 0.1) &&
						current === previous;
					previous = current;
					return same;
				},
				{ timeout: 10000, intervals: [200, 300, 500] },
			)
			.toBe(true);
		return stats();
	};
	const changedFrom = async (hash) => {
		const current = (await stats())[0];
		return Boolean(current && current.ratio > 0.1 && current.hash !== hash);
	};
	const capture = async (file, state) => {
		await page.locator("#synthetic-capture-caption").evaluate(
			(caption, { sourceTreeSha256, state }) => {
				caption.textContent = `SYNTHETIC FIXTURE — SYNTHETIC_DX_1 — NEW current renderer verification (not historical before/after)\nSource tree ${sourceTreeSha256} | renderer + synthetic IPC bridge | state: ${state}`;
			},
			{ sourceTreeSha256, state },
		);
		const canvas = await stable();
		check(
			`${state}: nonempty grayscale canvas`,
			canvas.length > 0 && canvas.every((value) => value.ratio > 0.1),
		);
		check(`${state}: no console/page errors`, errors.length === 0);
		const path = resolve(output, file);
		await page.screenshot({ path });
		captures.push({
			file,
			state,
			sha256: sha256(readFileSync(path)),
			gitBlob: git("hash-object", path),
			canvas,
		});
	};
	// なぜ: 読込直後の自動 fit の途中を比較基準にせず、明示リセット後の状態を固定する。
	await page.getByRole("button", { name: "最初の状態に戻す" }).click();
	const baseline = await stable();
	await expect(
		page.getByRole("button", { name: "1枚表示（1×1）" }),
	).toHaveAttribute("aria-pressed", "true");
	check("baseline: exactly one rendered pane", baseline.length === 1);
	await capture(
		"synthetic-single-pane-default.png",
		"single pane baseline after explicit reset",
	);

	await page.getByRole("button", { name: "数値で合わせる・連続再生" }).click();
	const readout = page.getByText(/^WW \d+ \/ WC -?\d+$/);
	await expect(readout).toBeVisible();
	const originalReadout = await readout.textContent();
	const brightness = page.getByRole("slider", { name: "明るさ", exact: true });
	for (let i = 0; i < 5; i++) await brightness.press("ArrowRight");
	await expect.poll(() => readout.textContent()).not.toBe(originalReadout);
	await expect.poll(() => changedFrom(baseline[0].hash)).toBe(true);
	check("numeric controls: keyboard changes WW/WC and actual pixels", true);
	await readout.scrollIntoViewIfNeeded();
	await capture(
		"synthetic-single-pane-window-controls.png",
		"numeric controls expanded; brightness adjusted",
	);
	await page.getByRole("button", { name: "数値で合わせる・連続再生" }).click();
	await page.getByRole("button", { name: "最初の状態に戻す" }).click();
	await expect
		.poll(async () => (await stats())[0]?.hash)
		.toBe(baseline[0].hash);
	check("numeric reset restores baseline pixels", true);

	await page.getByRole("button", { name: "右90°回転" }).click();
	await expect.poll(() => changedFrom(baseline[0].hash)).toBe(true);
	check("rotation control changes actual rendered pixels", true);
	await capture(
		"synthetic-single-pane-rotate90.png",
		"right 90 degree rotation",
	);
	await page.getByRole("button", { name: "最初の状態に戻す" }).click();
	await expect
		.poll(async () => (await stats())[0]?.hash)
		.toBe(baseline[0].hash);
	check("rotation reset restores baseline pixels", true);

	await page.evaluate(() => window.openSyntheticComparison());
	await expect(page.locator("header")).toContainText(/2\s*枚/);
	await expect(page.locator(".openseadragon-canvas canvas")).toHaveCount(2);
	await expect(
		page.getByRole("button", { name: "左右表示（2×1）" }),
	).toHaveAttribute("aria-pressed", "true");
	await expect(page.getByText("左右に並べて表示")).toBeVisible();
	await expect
		.poll(
			async () => (await stats()).filter((value) => value.ratio > 0.1).length,
		)
		.toBe(2);
	check("two panes: both render the synthetic image", true);
	await capture(
		"synthetic-two-panes.png",
		"automatic side by side comparison; two synthetic series",
	);
	// なぜ: 撮影対象外の切替回帰も隠さず別結果として残し、失敗時は終了コードに反映する。
	try {
		await page.getByRole("button", { name: "1枚表示（1×1）" }).click();
		await expect(page.locator(".openseadragon-canvas canvas")).toHaveCount(1);
		await stable();
		await page.getByRole("button", { name: "左右表示（2×1）" }).click();
		await expect(page.locator(".openseadragon-canvas canvas")).toHaveCount(2, {
			timeout: 15000,
		});
		await expect
			.poll(
				async () => (await stats()).filter((value) => value.ratio > 0.1).length,
			)
			.toBe(2);
		supplementaryChecks.push({
			name: "two-pane to single-pane to two-pane round-trip",
			result: "PASS",
			canvas: await stable(),
		});
	} catch {
		supplementaryChecks.push({
			name: "two-pane to single-pane to two-pane round-trip",
			result: "FAIL",
			observedCanvasCount: await page
				.locator(".openseadragon-canvas canvas")
				.count(),
			expectedCanvasCount: 2,
		});
		process.exitCode = 1;
	}
	check("no external service requests", externalRequests.length === 0);
	writeFileSync(
		resolve(output, "synthetic-ui-capture.json"),
		`${JSON.stringify(
			{
				baseCommit,
				sourceTreeSha256,
				sourceFiles,
				fixtureVersion: "SYNTHETIC_DX_1",
				fixtureSha256,
				comparisonFixtureSha256: sha256(comparisonFixture),
				captureScriptSha256: sha256(
					readFileSync(fileURLToPath(import.meta.url)),
				),
				capturedAt: new Date().toISOString(),
				browser: browser.version(),
				viewport: { width: 1440, height: 1000 },
				method:
					"actual renderer, isolated headless browser, synthetic IPC bridge; no native Electron/service verification",
				checks,
				supplementaryChecks,
				captures,
				errors,
				externalRequests,
			},
			null,
			2,
		)}\n`,
	);
	console.log(
		JSON.stringify({
			output,
			sourceTreeSha256,
			checks: checks.length,
			captures: captures.length,
			supplementaryChecks,
		}),
	);
} catch (error) {
	writeFileSync(
		resolve(output, "capture-failure.json"),
		JSON.stringify(
			{
				error: error.message,
				errors,
				externalRequests,
				alerts: await page?.getByRole("alert").allTextContents(),
				canvasCount: await page
					?.locator(".openseadragon-canvas canvas")
					.count(),
				checks,
			},
			null,
			2,
		),
	);
	throw error;
} finally {
	await browser?.close();
	await server?.close();
}
