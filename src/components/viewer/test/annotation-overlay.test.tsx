// @vitest-environment jsdom
import { act, fireEvent, render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Annotation } from "@/types/annotation";
import { AnnotationOverlay } from "../annotation-overlay";

const makeViewport = (
	overrides: {
		zoom?: number;
		center?: { x: number; y: number };
		homeBounds?: { x: number; y: number; width: number; height: number };
		rotation?: number;
		flip?: boolean;
	} = {},
) => {
	const handlers = new Map<string, Set<() => void>>();
	return {
		getZoom: () => overrides.zoom ?? 1,
		getCenter: () => overrides.center ?? { x: 0.5, y: 0.5 },
		getHomeBounds: () =>
			overrides.homeBounds ?? { x: 0, y: 0, width: 1, height: 1 },
		getRotation: () => overrides.rotation ?? 0,
		getFlip: () => overrides.flip ?? false,
		addHandler: vi.fn((eventName: string, handler: () => void) => {
			if (!handlers.has(eventName)) handlers.set(eventName, new Set());
			handlers.get(eventName)?.add(handler);
		}),
		removeHandler: vi.fn((eventName: string, handler: () => void) => {
			handlers.get(eventName)?.delete(handler);
		}),
		fireHandlers: (eventName: string) => {
			for (const handler of handlers.get(eventName) ?? []) handler();
		},
	};
};

class MockResizeObserver {
	static instances: MockResizeObserver[] = [];
	callback: ResizeObserverCallback;
	constructor(callback: ResizeObserverCallback) {
		this.callback = callback;
		MockResizeObserver.instances.push(this);
	}
	observe() {}
	unobserve() {}
	disconnect() {}
	trigger() {
		this.callback([], this as unknown as ResizeObserver);
	}
}

const numAttr = (el: Element | null, name: string): number =>
	Number(el?.getAttribute(name));

const mockRect = (width: number, height: number): DOMRect =>
	({
		left: 0,
		top: 0,
		width,
		height,
		right: width,
		bottom: height,
		x: 0,
		y: 0,
		toJSON: () => ({}),
	}) as DOMRect;

const baseProps = {
	activePoints: [],
	pendingTextPosition: null,
	imageWidth: 100,
	imageHeight: 100,
	containerId: "osd-annotation-test",
	onRemoveAnnotation: vi.fn(),
	onSubmitTextAnnotation: vi.fn(),
	onCancelPendingText: vi.fn(),
	visible: true,
};

const renderOverlay = (
	props: Omit<
		ComponentProps<typeof AnnotationOverlay>,
		keyof typeof baseProps
	> &
		Partial<typeof baseProps>,
) => {
	const host = document.createElement("div");
	host.id = baseProps.containerId;
	document.body.appendChild(host);
	return render(<AnnotationOverlay {...baseProps} {...props} />, {
		container: host,
	});
};

describe("AnnotationOverlay", () => {
	beforeEach(() => {
		vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(
			DOMRect.fromRect({ x: 0, y: 0, width: 200, height: 200 }),
		);
	});

	afterEach(() => {
		vi.restoreAllMocks();
		document.body.innerHTML = "";
	});

	it("renders text annotations with a gold label", () => {
		const annotations: Annotation[] = [
			{
				id: "a-text",
				type: "text",
				position: { x: 10, y: 20 },
				text: "骨折疑い",
			},
		];

		renderOverlay({
			annotations,
			viewport: makeViewport(),
		});

		expect(screen.getByRole("img", { name: "注釈オーバーレイ" })).toBeTruthy();
		expect(screen.getByText("骨折疑い").getAttribute("fill")).toBe("#FFD700");
	});

	it("renders arrow annotations with an arrowhead marker", () => {
		const annotations: Annotation[] = [
			{
				id: "a-arrow",
				type: "arrow",
				start: { x: 10, y: 20 },
				end: { x: 30, y: 40 },
			},
		];
		const { container } = renderOverlay({
			annotations,
			viewport: makeViewport(),
		});

		const line = container.querySelector("line");
		expect(line?.getAttribute("stroke")).toBe("#FFD700");
		expect(line?.getAttribute("marker-end")).toBe("url(#annotation-arrowhead)");
	});

	it("renders rectangle ROI annotations with dashed stroke", () => {
		const annotations: Annotation[] = [
			{
				id: "a-rect",
				type: "rect",
				topLeft: { x: 10, y: 20 },
				bottomRight: { x: 40, y: 60 },
			},
		];
		const { container } = renderOverlay({
			annotations,
			viewport: makeViewport(),
		});

		const rect = container.querySelector("rect[stroke='#FFD700']");
		expect(rect?.getAttribute("stroke-dasharray")).toBe("6,4");
		expect(rect?.getAttribute("fill")).toBe("transparent");
	});

	it("renders ellipse ROI annotations with dashed stroke", () => {
		const annotations: Annotation[] = [
			{
				id: "a-ellipse",
				type: "ellipse",
				center: { x: 40, y: 50 },
				radiusX: 20,
				radiusY: 10,
			},
		];
		const { container } = renderOverlay({
			annotations,
			viewport: makeViewport(),
		});

		const ellipse = container.querySelector("ellipse");
		expect(ellipse?.getAttribute("stroke")).toBe("#FFD700");
		expect(ellipse?.getAttribute("stroke-dasharray")).toBe("6,4");
	});

	it("renders persisted freehand annotations as rounded polylines", () => {
		const onRemoveAnnotation = vi.fn();
		const annotations: Annotation[] = [
			{
				id: "a-freehand",
				type: "freehand",
				color: "#00aaff",
				points: [
					{ x: 10, y: 10 },
					{ x: 20, y: 30 },
					{ x: 40, y: 35 },
				],
				strokeWidth: 3,
			},
		];
		const { container } = renderOverlay({
			annotations,
			viewport: makeViewport(),
			onRemoveAnnotation,
		});

		const polyline = container.querySelector("polyline");
		expect(polyline?.getAttribute("points")).toBe("20,20 40,60 80,70");
		expect(polyline?.getAttribute("fill")).toBe("none");
		expect(polyline?.getAttribute("stroke")).toBe("#00aaff");
		expect(polyline?.getAttribute("stroke-width")).toBe("3");
		expect(polyline?.getAttribute("stroke-linecap")).toBe("round");

		fireEvent.click(screen.getByRole("button", { name: "注釈削除" }));
		expect(onRemoveAnnotation).toHaveBeenCalledWith("a-freehand");
	});

	it("renders active freehand points as a live polyline", () => {
		const { container } = renderOverlay({
			annotations: [],
			activePoints: [
				{ x: 10, y: 10 },
				{ x: 20, y: 30 },
				{ x: 40, y: 35 },
			],
			viewport: makeViewport(),
		});

		const polyline = container.querySelector("polyline");
		expect(polyline?.getAttribute("points")).toBe("20,20 40,60 80,70");
		expect(polyline?.getAttribute("stroke")).toBe("#FFD700");
		expect(polyline?.getAttribute("stroke-dasharray")).toBeNull();
	});

	it("keeps annotation geometry from capturing viewer drag events", () => {
		const annotations: Annotation[] = [
			{
				id: "a-rect",
				type: "rect",
				topLeft: { x: 10, y: 20 },
				bottomRight: { x: 40, y: 60 },
			},
		];
		const { container } = renderOverlay({
			annotations,
			activePoints: [{ x: 10, y: 20 }],
			viewport: makeViewport(),
		});

		const annotationLayer = container.querySelector("svg > g");
		const deleteHandle = container.querySelector("foreignObject");
		const activePoint = container.querySelector("circle[stroke='#FFD700']");

		expect(annotationLayer?.getAttribute("class") ?? "").not.toContain(
			"pointer-events-auto",
		);
		expect(activePoint?.getAttribute("class") ?? "").not.toContain(
			"pointer-events-auto",
		);
		expect(deleteHandle?.getAttribute("class")).toContain(
			"pointer-events-auto",
		);
	});

	it("subscribes to OSD viewport events without polling", () => {
		const setIntervalSpy = vi.spyOn(globalThis, "setInterval");
		const viewport = makeViewport();
		const annotations: Annotation[] = [
			{
				id: "a-arrow",
				type: "arrow",
				start: { x: 10, y: 20 },
				end: { x: 30, y: 40 },
			},
		];

		renderOverlay({
			annotations,
			viewport,
		});

		expect(setIntervalSpy).not.toHaveBeenCalled();
		expect(viewport.addHandler).toHaveBeenCalledWith(
			"viewport-change",
			expect.any(Function),
		);
		expect(viewport.addHandler).toHaveBeenCalledWith(
			"animation",
			expect.any(Function),
		);
		expect(viewport.addHandler).toHaveBeenCalledWith(
			"animation-finish",
			expect.any(Function),
		);
		expect(viewport.addHandler).toHaveBeenCalledWith(
			"update-viewport",
			expect.any(Function),
		);
	});

	it("submits and cancels pending text input from keyboard", () => {
		const onSubmitTextAnnotation = vi.fn();
		const onCancelPendingText = vi.fn();

		renderOverlay({
			annotations: [],
			pendingTextPosition: { x: 10, y: 20 },
			viewport: makeViewport(),
			onSubmitTextAnnotation,
			onCancelPendingText,
		});

		const input = screen.getByRole("textbox", { name: "注釈テキスト" });
		fireEvent.change(input, { target: { value: "蹄骨" } });
		fireEvent.keyDown(input, { key: "Enter" });
		expect(onSubmitTextAnnotation).toHaveBeenCalledWith("蹄骨");

		fireEvent.keyDown(input, { key: "Escape" });
		expect(onCancelPendingText).toHaveBeenCalledOnce();
	});

	it("does not submit pending text while IME composition is active", () => {
		const onSubmitTextAnnotation = vi.fn();
		const onCancelPendingText = vi.fn();

		renderOverlay({
			annotations: [],
			pendingTextPosition: { x: 10, y: 20 },
			viewport: makeViewport(),
			onSubmitTextAnnotation,
			onCancelPendingText,
		});

		const input = screen.getByRole("textbox", { name: "注釈テキスト" });
		fireEvent.change(input, { target: { value: "蹄骨" } });
		fireEvent.compositionStart(input);
		fireEvent.keyDown(input, { key: "Enter" });
		fireEvent.keyDown(input, { key: "Escape" });
		fireEvent.compositionEnd(input);
		fireEvent.keyDown(input, { key: "Enter", keyCode: 229 });
		fireEvent.keyDown(input, { key: "Escape", keyCode: 229 });

		expect(onSubmitTextAnnotation).not.toHaveBeenCalled();
		expect(onCancelPendingText).not.toHaveBeenCalled();
	});

	it("does not remove an annotation when delete confirmation is canceled", () => {
		vi.spyOn(window, "confirm").mockReturnValue(false);
		const onRemoveAnnotation = vi.fn();
		const annotations: Annotation[] = [
			{
				id: "a-text",
				type: "text",
				position: { x: 10, y: 20 },
				text: "骨折疑い",
			},
		];
		renderOverlay({
			annotations,
			viewport: makeViewport(),
			onRemoveAnnotation,
		});

		fireEvent.click(screen.getByRole("button", { name: "注釈削除" }));

		expect(window.confirm).toHaveBeenCalledWith("この注釈を削除しますか？");
		expect(onRemoveAnnotation).not.toHaveBeenCalled();
	});

	it("restores the last deleted annotation with Ctrl+Z", () => {
		vi.spyOn(window, "confirm").mockReturnValue(true);
		const onRemoveAnnotation = vi.fn();
		const onRestoreAnnotation = vi.fn();
		const annotation: Annotation = {
			id: "a-text",
			type: "text",
			position: { x: 10, y: 20 },
			text: "骨折疑い",
		};
		renderOverlay({
			annotations: [annotation],
			viewport: makeViewport(),
			onRemoveAnnotation,
			onRestoreAnnotation,
		});

		fireEvent.click(screen.getByRole("button", { name: "注釈削除" }));
		fireEvent.keyDown(window, { key: "z", ctrlKey: true });

		expect(onRemoveAnnotation).toHaveBeenCalledWith("a-text");
		expect(onRestoreAnnotation).toHaveBeenCalledWith(annotation);
	});

	it("reprojects annotation coordinates after the viewer container resizes", () => {
		const originalResizeObserver = globalThis.ResizeObserver;
		MockResizeObserver.instances = [];
		globalThis.ResizeObserver =
			MockResizeObserver as unknown as typeof ResizeObserver;

		const rectSpy = vi
			.spyOn(HTMLElement.prototype, "getBoundingClientRect")
			.mockReturnValue(mockRect(200, 200));

		const annotations: Annotation[] = [
			{
				id: "a-arrow",
				type: "arrow",
				start: { x: 10, y: 10 },
				end: { x: 20, y: 20 },
			},
		];
		const { container } = renderOverlay({
			annotations,
			viewport: makeViewport(),
		});

		const line = () => container.querySelector("line") as SVGLineElement;
		expect(numAttr(line(), "x1")).toBeCloseTo(20, 6);
		expect(numAttr(line(), "y1")).toBeCloseTo(20, 6);

		rectSpy.mockReturnValue(mockRect(400, 400));
		const observer = MockResizeObserver.instances.at(-1);
		act(() => observer?.trigger());

		expect(numAttr(line(), "x1")).toBeCloseTo(40, 6);
		expect(numAttr(line(), "y1")).toBeCloseTo(40, 6);

		rectSpy.mockRestore();
		globalThis.ResizeObserver = originalResizeObserver;
	});

	it("reprojects stored image-coordinate annotations after OSD viewport changes", () => {
		vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(
			mockRect(200, 200),
		);
		const viewportCenter = { x: 0.5, y: 0.5 };
		const viewport = makeViewport({ center: viewportCenter });
		const annotations: Annotation[] = [
			{
				id: "a-arrow",
				type: "arrow",
				start: { x: 10, y: 10 },
				end: { x: 20, y: 20 },
			},
		];
		const { container } = renderOverlay({ annotations, viewport });

		const line = () => container.querySelector("line") as SVGLineElement;
		expect(numAttr(line(), "x1")).toBeCloseTo(20, 6);
		expect(numAttr(line(), "y1")).toBeCloseTo(20, 6);

		viewportCenter.x = 0.8;
		viewportCenter.y = 0.2;
		act(() => viewport.fireHandlers("viewport-change"));

		expect(numAttr(line(), "x1")).toBeCloseTo(-40, 6);
		expect(numAttr(line(), "y1")).toBeCloseTo(80, 6);
	});

	it("projects rectangle ROI corners through viewport rotation", () => {
		vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(
			mockRect(200, 200),
		);
		// 画像中心を中心とした正方形ROI。回転の基準点が画像中心なら、
		// 対角線上の2頂点を入れ替えるだけで矩形の範囲自体は変わらないはず。
		const annotations: Annotation[] = [
			{
				id: "a-rect",
				type: "rect",
				topLeft: { x: 30, y: 30 },
				bottomRight: { x: 70, y: 70 },
			},
		];

		const renderWithRotation = (rotation: number) =>
			renderOverlay({
				annotations,
				viewport: makeViewport({ center: { x: 0.8, y: 0.2 }, rotation }),
			});

		const unrotated = renderWithRotation(0);
		const unrotatedRect = unrotated.container.querySelector(
			"rect[stroke='#FFD700']",
		);
		const before = {
			x: numAttr(unrotatedRect, "x"),
			y: numAttr(unrotatedRect, "y"),
			width: numAttr(unrotatedRect, "width"),
			height: numAttr(unrotatedRect, "height"),
		};
		unrotated.unmount();
		unrotated.container.remove();

		const rotated = renderWithRotation(90);
		const rotatedRect = rotated.container.querySelector(
			"rect[stroke='#FFD700']",
		);
		expect(numAttr(rotatedRect, "x")).toBeCloseTo(before.x, 6);
		expect(numAttr(rotatedRect, "y")).toBeCloseTo(before.y, 6);
		expect(numAttr(rotatedRect, "width")).toBeCloseTo(before.width, 6);
		expect(numAttr(rotatedRect, "height")).toBeCloseTo(before.height, 6);
		rotated.unmount();
		rotated.container.remove();
	});

	it("projects ellipse ROI through viewport rotation", () => {
		vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(
			mockRect(200, 200),
		);
		// 画像中心にあるROI。SVG ellipseは傾けられないため描画自体は軸並行のまま
		// だが、90度回転すれば長辺・短辺はスクリーン上で入れ替わるべき
		// （非対称楕円 radiusX=20 / radiusY=10 で検証する）。
		const annotations: Annotation[] = [
			{
				id: "a-ellipse",
				type: "ellipse",
				center: { x: 50, y: 50 },
				radiusX: 20,
				radiusY: 10,
			},
		];

		const renderWithRotation = (rotation: number) =>
			renderOverlay({
				annotations,
				viewport: makeViewport({ center: { x: 0.8, y: 0.2 }, rotation }),
			});

		const unrotated = renderWithRotation(0);
		const unrotatedEllipse = unrotated.container.querySelector("ellipse");
		const rx0 = numAttr(unrotatedEllipse, "rx");
		const ry0 = numAttr(unrotatedEllipse, "ry");
		unrotated.unmount();
		unrotated.container.remove();

		const rotated = renderWithRotation(90);
		const rotatedEllipse = rotated.container.querySelector("ellipse");
		expect(numAttr(rotatedEllipse, "rx")).toBeCloseTo(ry0, 4);
		expect(numAttr(rotatedEllipse, "ry")).toBeCloseTo(rx0, 4);
		expect(rx0).toBeGreaterThan(0);
		expect(ry0).toBeGreaterThan(0);
		expect(rx0).not.toBeCloseTo(ry0, 4);
		rotated.unmount();
		rotated.container.remove();
	});

	it("配置中のフリーハンド点とテキスト入力をresize後も画像座標から再投影する", () => {
		const originalResizeObserver = globalThis.ResizeObserver;
		MockResizeObserver.instances = [];
		globalThis.ResizeObserver =
			MockResizeObserver as unknown as typeof ResizeObserver;

		const rectSpy = vi
			.spyOn(HTMLElement.prototype, "getBoundingClientRect")
			.mockReturnValue(mockRect(200, 200));

		const { container } = renderOverlay({
			annotations: [],
			activePoints: [
				{ x: 10, y: 10 },
				{ x: 20, y: 30 },
			],
			pendingTextPosition: { x: 10, y: 10 },
			viewport: makeViewport(),
		});

		const polyline = () => container.querySelector("polyline");
		const textInput = () => container.querySelector("foreignObject");

		expect(polyline()?.getAttribute("points")).toBe("20,20 40,60");
		expect(numAttr(textInput(), "x")).toBeCloseTo(20, 6);

		rectSpy.mockReturnValue(mockRect(400, 400));
		const observer = MockResizeObserver.instances.at(-1);
		act(() => observer?.trigger());

		expect(polyline()?.getAttribute("points")).toBe("40,40 80,120");
		expect(numAttr(textInput(), "x")).toBeCloseTo(40, 6);

		rectSpy.mockRestore();
		globalThis.ResizeObserver = originalResizeObserver;
	});
});
