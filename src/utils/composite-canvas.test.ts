// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { compositeCanvasById } from "./composite-canvas";

const makeCanvas = (width = 100, height = 80): HTMLCanvasElement => {
	const canvas = document.createElement("canvas");
	canvas.width = width;
	canvas.height = height;
	return canvas;
};

const makeSvg = (ariaLabel: string): SVGSVGElement => {
	const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
	svg.setAttribute("aria-label", ariaLabel);
	svg.setAttribute("width", "100");
	svg.setAttribute("height", "80");
	return svg;
};

const makeStructure = () => {
	// compositeCanvasById は osdContainer の祖父要素内で
	// オーバーレイSVGを探す（実DOM: wrapper → div.absolute → #osd-pane）
	const relativeWrapper = document.createElement("div");
	const absolute = document.createElement("div");
	const osdContainer = document.createElement("div");
	relativeWrapper.appendChild(absolute);
	absolute.appendChild(osdContainer);
	return { relativeWrapper, osdContainer };
};

// jsdom の canvas.getContext は常に null を返すので、
// drawImage 呼び出しを記録する偽コンテキストに差し替える
const stubCanvasContext = () => {
	const drawImage = vi.fn();
	const ctx = { drawImage } as unknown as CanvasRenderingContext2D;
	vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
		() => ctx,
	);
	vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue(
		"data:image/png;base64,stub",
	);
	return { drawImage };
};

// src が代入された時点の data URI を捕捉し、onload/onerror を手動発火する
const stubImage = (fireError: boolean) => {
	const captured: { src?: string } = {};
	class StubImage {
		onload: (() => void) | null = null;
		onerror: (() => void) | null = null;
		set src(value: string) {
			captured.src = value;
			queueMicrotask(() => {
				if (fireError) this.onerror?.();
				else this.onload?.();
			});
		}
	}
	vi.stubGlobal("Image", StubImage);
	return captured;
};

const decodeSvgSrc = (src: string): string => {
	const prefix = "data:image/svg+xml;charset=utf-8,";
	expect(src.startsWith(prefix)).toBe(true);
	return decodeURIComponent(src.slice(prefix.length));
};

const rect = (x: number, y: number, width: number, height: number): DOMRect =>
	({
		x,
		y,
		width,
		height,
		top: y,
		left: x,
		right: x + width,
		bottom: y + height,
		toJSON: () => ({}),
	}) as DOMRect;

// jsdom の getBoundingClientRect は全て 0 を返すので、
// 「画面上の表示矩形」をテストごとに差し込む
const stubRect = (el: HTMLElement | SVGSVGElement, r: DOMRect) => {
	vi.spyOn(el, "getBoundingClientRect").mockReturnValue(r);
};

// imageToContainerCoord 経路を通る最小の偽 viewport。
// 全体表示: 画像(240x160)がコンテナ(0,0,240,160)にぴったり収まる状態
const fitView = {
	viewport: {
		getZoom: () => 1,
		getCenter: () => ({ x: 0.5, y: 160 / 480 }),
	},
	imageWidth: 240,
	imageHeight: 160,
};

// 4倍ズーム: 画像の表示矩形がコンテナの4倍に広がる状態
// (viewportToContainerPoint の逆算で center を決める)
const zoom4View = {
	viewport: {
		getZoom: () => 4,
		getCenter: () => ({ x: 0.625, y: 0.5 }),
	},
	imageWidth: 240,
	imageHeight: 160,
};

describe("compositeCanvasById", () => {
	afterEach(() => {
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
	});

	it("falls back to canvas-only when osdContainer has no grandparent", async () => {
		const canvas = makeCanvas();
		const detached = document.createElement("div");
		const result = await compositeCanvasById(canvas, detached, fitView);
		expect(result).toBe(canvas.toDataURL("image/png"));
	});

	it("falls back to canvas-only when osdContainer has parent but no grandparent", async () => {
		const canvas = makeCanvas();
		const parent = document.createElement("div");
		const osdContainer = document.createElement("div");
		parent.appendChild(osdContainer);
		const result = await compositeCanvasById(canvas, osdContainer, fitView);
		expect(result).toBe(canvas.toDataURL("image/png"));
	});

	it("falls back to canvas-only when relativeWrapper has no SVG overlays", async () => {
		const canvas = makeCanvas();
		const { osdContainer } = makeStructure();
		// オーバーレイが無い保存は正常経路なので警告を出さない
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		const result = await compositeCanvasById(canvas, osdContainer, fitView);
		expect(result).toBe(canvas.toDataURL("image/png"));
		expect(warn).not.toHaveBeenCalled();
	});

	it("stamps viewBox + explicit size on the serialized SVG so display coords map to canvas pixels", async () => {
		const { drawImage } = stubCanvasContext();
		const { relativeWrapper, osdContainer } = makeStructure();
		const svg = makeSvg("計測オーバーレイ");
		// 画面内SVGは属性を持たないため、CSSレイアウト寸法を getBoundingClientRect から取る
		stubRect(svg, rect(0, 0, 240, 160));
		relativeWrapper.appendChild(svg);
		const captured = stubImage(false);

		const canvas = makeCanvas(480, 320);
		// 全体表示時はコンテナの矩形とSVGの矩形が一致する
		stubRect(osdContainer, rect(0, 0, 240, 160));
		await compositeCanvasById(canvas, osdContainer, fitView);

		expect(captured.src).toBeDefined();
		const serialized = decodeSvgSrc(captured.src ?? "");
		expect(serialized).toContain('viewBox="0 0 240 160"');
		expect(serialized).toContain('width="240"');
		expect(serialized).toContain('height="160"');
		// キャンバス全面へ拡大描画されること（1:1左上スタンプではない）
		expect(drawImage).toHaveBeenCalledWith(
			expect.anything(),
			0,
			0,
			240,
			160,
			0,
			0,
			480,
			320,
		);
	});

	it("maps overlay into image coordinates when the view is zoomed or panned", async () => {
		const { drawImage } = stubCanvasContext();
		const { relativeWrapper, osdContainer } = makeStructure();
		const svg = makeSvg("計測オーバーレイ");
		stubRect(svg, rect(0, 0, 240, 160));
		relativeWrapper.appendChild(svg);
		stubImage(false);

		const canvas = makeCanvas(480, 320);
		stubRect(osdContainer, rect(0, 0, 240, 160));
		await compositeCanvasById(canvas, osdContainer, zoom4View);

		// 4倍ズームで画像の表示矩形は (-480,-400)-(480,240) に広がる。
		// 画面全体に見えているのは画像の中央 960x640 のうち (0,0)-(240,160) で、
		// オーバーレイは画像キャンバスの中央 240..360 × 200..280 に写る
		expect(drawImage).toHaveBeenCalledWith(
			expect.anything(),
			0,
			0,
			240,
			160,
			240,
			200,
			120,
			80,
		);
	});

	it("skips an overlay that lies entirely outside the displayed image", async () => {
		const { drawImage } = stubCanvasContext();
		const { relativeWrapper, osdContainer } = makeStructure();
		const svg = makeSvg("計測オーバーレイ");
		stubRect(svg, rect(500, 500, 100, 100));
		relativeWrapper.appendChild(svg);
		stubImage(false);

		const canvas = makeCanvas(480, 320);
		stubRect(osdContainer, rect(0, 0, 240, 160));
		await compositeCanvasById(canvas, osdContainer, fitView);

		// 1回目は元キャンバスの貼り付けのみで、オーバーレイの描画は呼ばれない
		expect(drawImage).toHaveBeenCalledTimes(1);
	});

	it("strips foreignObject (×削除ボタン) from the serialized overlay SVG", async () => {
		stubCanvasContext();
		const { relativeWrapper, osdContainer } = makeStructure();
		const svg = makeSvg("計測オーバーレイ");
		const fo = document.createElementNS(
			"http://www.w3.org/2000/svg",
			"foreignObject",
		);
		const button = document.createElement("button");
		button.textContent = "×";
		fo.appendChild(button);
		svg.appendChild(fo);
		const circle = document.createElementNS(
			"http://www.w3.org/2000/svg",
			"circle",
		);
		circle.setAttribute("r", "3");
		svg.appendChild(circle);
		relativeWrapper.appendChild(svg);
		const captured = stubImage(false);

		const canvas = makeCanvas();
		stubRect(osdContainer, rect(0, 0, 240, 160));
		await compositeCanvasById(canvas, osdContainer, fitView);

		const serialized = decodeSvgSrc(captured.src ?? "");
		expect(serialized).not.toContain("foreignObject");
		expect(serialized).not.toContain("×");
		// SVG要素そのものは残る
		expect(serialized).toContain("circle");
	});

	it("warns and falls back gracefully when an SVG layer fails to rasterize", async () => {
		stubCanvasContext();
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		const { relativeWrapper, osdContainer } = makeStructure();
		relativeWrapper.appendChild(makeSvg("計測オーバーレイ"));
		stubImage(true); // 読込失敗を再現（CSP遮断・シリアライズ不能など）

		const canvas = makeCanvas();
		stubRect(osdContainer, rect(0, 0, 240, 160));
		const result = await compositeCanvasById(canvas, osdContainer, fitView);

		expect(warn).toHaveBeenCalledOnce();
		expect(warn.mock.calls[0]?.[0]).toContain("composite-canvas");
		expect(result).toBe("data:image/png;base64,stub");
	});
});
