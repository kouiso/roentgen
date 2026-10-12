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

describe("compositeCanvasById", () => {
	afterEach(() => {
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
	});

	it("falls back to canvas-only when osdContainer has no grandparent", async () => {
		const canvas = makeCanvas();
		const detached = document.createElement("div");
		const result = await compositeCanvasById(canvas, detached);
		expect(result).toBe(canvas.toDataURL("image/png"));
	});

	it("falls back to canvas-only when osdContainer has parent but no grandparent", async () => {
		const canvas = makeCanvas();
		const parent = document.createElement("div");
		const osdContainer = document.createElement("div");
		parent.appendChild(osdContainer);
		const result = await compositeCanvasById(canvas, osdContainer);
		expect(result).toBe(canvas.toDataURL("image/png"));
	});

	it("falls back to canvas-only when relativeWrapper has no SVG overlays", async () => {
		const canvas = makeCanvas();
		const { osdContainer } = makeStructure();
		const result = await compositeCanvasById(canvas, osdContainer);
		expect(result).toBe(canvas.toDataURL("image/png"));
	});

	it("stamps viewBox + explicit size on the serialized SVG so display coords map to canvas pixels", async () => {
		const { drawImage } = stubCanvasContext();
		const { relativeWrapper, osdContainer } = makeStructure();
		const svg = makeSvg("計測オーバーレイ");
		// 画面内SVGは属性を持たないため、CSSレイアウト寸法を getBoundingClientRect から取る
		vi.spyOn(svg, "getBoundingClientRect").mockReturnValue({
			width: 240,
			height: 160,
			x: 0,
			y: 0,
			top: 0,
			left: 0,
			right: 240,
			bottom: 160,
			toJSON: () => ({}),
		});
		relativeWrapper.appendChild(svg);
		const captured = stubImage(false);

		const canvas = makeCanvas(480, 320);
		await compositeCanvasById(canvas, osdContainer);

		expect(captured.src).toBeDefined();
		const serialized = decodeSvgSrc(captured.src ?? "");
		expect(serialized).toContain('viewBox="0 0 240 160"');
		expect(serialized).toContain('width="240"');
		expect(serialized).toContain('height="160"');
		// キャンバス全面へ拡大描画されること（1:1左上スタンプではない）
		expect(drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 480, 320);
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

		await compositeCanvasById(makeCanvas(), osdContainer);

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

		const result = await compositeCanvasById(makeCanvas(), osdContainer);

		expect(warn).toHaveBeenCalledOnce();
		expect(warn.mock.calls[0]?.[0]).toContain("composite-canvas");
		expect(result).toBe("data:image/png;base64,stub");
	});
});
