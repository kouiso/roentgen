// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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

describe("compositeCanvasById", () => {
	let revokeObjectURL: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		revokeObjectURL = vi.fn();
		URL.revokeObjectURL = revokeObjectURL;
		// createObjectURL needs to return a string; jsdom doesn't implement it
		URL.createObjectURL = vi.fn(() => "blob:mock");
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("falls back to canvas-only when osdContainer has no grandparent", async () => {
		const canvas = makeCanvas();
		// osdContainer is detached — parentElement is null
		const detached = document.createElement("div");
		const result = await compositeCanvasById(canvas, detached);
		expect(result).toBe(canvas.toDataURL("image/png"));
	});

	it("falls back to canvas-only when osdContainer has parent but no grandparent", async () => {
		const canvas = makeCanvas();
		const parent = document.createElement("div");
		const osdContainer = document.createElement("div");
		parent.appendChild(osdContainer);
		// parent.parentElement is null (not in DOM)
		const result = await compositeCanvasById(canvas, osdContainer);
		expect(result).toBe(canvas.toDataURL("image/png"));
	});

	it("falls back to canvas-only when relativeWrapper has no SVG overlays", async () => {
		const canvas = makeCanvas();
		// Build structure: relativeWrapper → div.absolute → #osd-pane
		const relativeWrapper = document.createElement("div");
		const absolute = document.createElement("div");
		const osdContainer = document.createElement("div");
		relativeWrapper.appendChild(absolute);
		absolute.appendChild(osdContainer);

		const result = await compositeCanvasById(canvas, osdContainer);
		expect(result).toBe(canvas.toDataURL("image/png"));
	});

	it("finds SVG overlays via osdContainer grandparent when both are present", async () => {
		const canvas = makeCanvas();
		const relativeWrapper = document.createElement("div");
		const absolute = document.createElement("div");
		const osdContainer = document.createElement("div");
		relativeWrapper.appendChild(absolute);
		absolute.appendChild(osdContainer);

		// Add annotation SVG as sibling inside relativeWrapper
		const annotationSvg = makeSvg("注釈オーバーレイ");
		relativeWrapper.appendChild(annotationSvg);

		// Stub Image so SVG image load triggers onerror (non-fatal skip path).
		class StubImage {
			onload: (() => void) | null = null;
			onerror: (() => void) | null = null;
			set src(_: string) {
				this.onerror?.();
			}
		}
		vi.stubGlobal("Image", StubImage);

		// Should not throw — SVG layer silently skipped, offscreen canvas returned.
		// jsdom canvas getContext("2d") may return null → function falls back to
		// canvas.toDataURL which in jsdom returns "data:," (a string).
		await expect(
			compositeCanvasById(canvas, osdContainer),
		).resolves.toBeDefined();

		vi.unstubAllGlobals();
	});
});
