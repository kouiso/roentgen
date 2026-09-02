// @vitest-environment jsdom
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MeasurementOverlay } from "../measurement-overlay";

const makeMeasurement = () => ({
	id: "m1",
	type: "distance" as const,
	points: [
		{ x: 10, y: 10 },
		{ x: 20, y: 20 },
	],
	distanceMm: 12.3,
});

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
		getBounds: () => ({ x: 0, y: 0, width: 1, height: 1 }),
		getZoom: () => overrides.zoom ?? 1,
		getCenter: () => overrides.center ?? { x: 0.5, y: 0.5 },
		getHomeBounds: () =>
			overrides.homeBounds ?? { x: 0, y: 0, width: 1, height: 1 },
		getRotation: () => overrides.rotation ?? 0,
		getFlip: () => overrides.flip ?? false,
		imageToViewportCoordinates: (x: number, y: number) => ({ x, y }),
		viewportToViewerElementCoordinates: (point: { x: number; y: number }) =>
			point,
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

const numAttr = (el: Element, name: string): number =>
	Number(el.getAttribute(name));

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

describe("MeasurementOverlay", () => {
	beforeEach(() => {
		vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(
			DOMRect.fromRect({ x: 0, y: 0, width: 100, height: 100 }),
		);
	});

	afterEach(() => {
		vi.restoreAllMocks();
		document.body.innerHTML = "";
	});

	it("subscribes to OSD viewport events without polling", () => {
		const setIntervalSpy = vi.spyOn(globalThis, "setInterval");
		const viewport = makeViewport();

		render(
			<div id="osd-test">
				<MeasurementOverlay
					measurements={[makeMeasurement()]}
					activePoints={[]}
					imageWidth={100}
					containerId="osd-test"
					viewport={viewport}
					onRemoveMeasurement={vi.fn()}
					visible={true}
				/>
			</div>,
		);

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

		setIntervalSpy.mockRestore();
	});

	it("renders uncalibrated distance measurements in red with a warning label", () => {
		const rectSpy = vi
			.spyOn(HTMLElement.prototype, "getBoundingClientRect")
			.mockReturnValue({
				left: 0,
				top: 0,
				width: 100,
				height: 100,
				right: 100,
				bottom: 100,
				x: 0,
				y: 0,
				toJSON: () => ({}),
			} as DOMRect);
		const measurement = {
			...makeMeasurement(),
			distanceMm: 5,
			distanceUnit: "px" as const,
			calibrated: false,
		};

		const renderOverlay = () => (
			<div id="osd-test">
				<MeasurementOverlay
					measurements={[measurement]}
					activePoints={[]}
					imageWidth={100}
					containerId="osd-test"
					viewport={makeViewport()}
					onRemoveMeasurement={vi.fn()}
					visible={true}
				/>
			</div>
		);
		const { rerender } = render(renderOverlay());
		rerender(renderOverlay());

		const label = screen.getByText("5.00 px (未校正)");
		expect(label.getAttribute("fill")).toBe("#ef4444");
		const labelBackground = label.previousElementSibling;
		expect(labelBackground?.getAttribute("width")).toBe("110");
		rectSpy.mockRestore();
	});

	it("gives the measurement delete control enough SVG box space for focus styles", () => {
		const { container, rerender } = render(
			<div id="osd-test">
				<MeasurementOverlay
					measurements={[makeMeasurement()]}
					activePoints={[]}
					imageWidth={100}
					containerId="osd-test"
					viewport={makeViewport()}
					onRemoveMeasurement={vi.fn()}
					visible={true}
				/>
			</div>,
		);
		rerender(
			<div id="osd-test">
				<MeasurementOverlay
					measurements={[makeMeasurement()]}
					activePoints={[]}
					imageWidth={100}
					containerId="osd-test"
					viewport={makeViewport()}
					onRemoveMeasurement={vi.fn()}
					visible={true}
				/>
			</div>,
		);

		const deleteBox = container.querySelector("foreignObject");

		expect(deleteBox?.getAttribute("width")).toBe("24");
		expect(deleteBox?.getAttribute("height")).toBe("24");
	});

	it("does not remove a measurement when delete confirmation is canceled", () => {
		vi.spyOn(window, "confirm").mockReturnValue(false);
		const onRemoveMeasurement = vi.fn();
		const { rerender } = render(
			<div id="osd-test">
				<MeasurementOverlay
					measurements={[makeMeasurement()]}
					activePoints={[]}
					imageWidth={100}
					containerId="osd-test"
					viewport={makeViewport()}
					onRemoveMeasurement={onRemoveMeasurement}
					visible={true}
				/>
			</div>,
		);
		rerender(
			<div id="osd-test">
				<MeasurementOverlay
					measurements={[makeMeasurement()]}
					activePoints={[]}
					imageWidth={100}
					containerId="osd-test"
					viewport={makeViewport()}
					onRemoveMeasurement={onRemoveMeasurement}
					visible={true}
				/>
			</div>,
		);

		fireEvent.click(screen.getByRole("button", { name: "計測削除" }));

		expect(window.confirm).toHaveBeenCalledWith("この計測を削除しますか？");
		expect(onRemoveMeasurement).not.toHaveBeenCalled();
	});

	it("does not start deletion when the measurement line is clicked", () => {
		const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
		const onRemoveMeasurement = vi.fn();
		const { container, rerender } = render(
			<div id="osd-test">
				<MeasurementOverlay
					measurements={[makeMeasurement()]}
					activePoints={[]}
					imageWidth={100}
					containerId="osd-test"
					viewport={makeViewport()}
					onRemoveMeasurement={onRemoveMeasurement}
					visible={true}
				/>
			</div>,
		);
		rerender(
			<div id="osd-test">
				<MeasurementOverlay
					measurements={[makeMeasurement()]}
					activePoints={[]}
					imageWidth={100}
					containerId="osd-test"
					viewport={makeViewport()}
					onRemoveMeasurement={onRemoveMeasurement}
					visible={true}
				/>
			</div>,
		);

		fireEvent.click(container.querySelector("line") as Element);

		expect(confirmSpy).not.toHaveBeenCalled();
		expect(onRemoveMeasurement).not.toHaveBeenCalled();
	});

	it("restores the last deleted measurement with Ctrl+Z", () => {
		vi.spyOn(window, "confirm").mockReturnValue(true);
		const measurement = makeMeasurement();
		const onRemoveMeasurement = vi.fn();
		const onRestoreMeasurement = vi.fn();
		const { rerender } = render(
			<div id="osd-test">
				<MeasurementOverlay
					measurements={[measurement]}
					activePoints={[]}
					imageWidth={100}
					containerId="osd-test"
					viewport={makeViewport()}
					onRemoveMeasurement={onRemoveMeasurement}
					onRestoreMeasurement={onRestoreMeasurement}
					visible={true}
				/>
			</div>,
		);
		rerender(
			<div id="osd-test">
				<MeasurementOverlay
					measurements={[measurement]}
					activePoints={[]}
					imageWidth={100}
					containerId="osd-test"
					viewport={makeViewport()}
					onRemoveMeasurement={onRemoveMeasurement}
					onRestoreMeasurement={onRestoreMeasurement}
					visible={true}
				/>
			</div>,
		);

		fireEvent.click(screen.getByRole("button", { name: "計測削除" }));
		fireEvent.keyDown(window, { key: "z", ctrlKey: true });

		expect(onRemoveMeasurement).toHaveBeenCalledWith("m1");
		expect(onRestoreMeasurement).toHaveBeenCalledWith(measurement);
	});

	it("reprojects measurement coordinates after the viewer container resizes", () => {
		const originalResizeObserver = globalThis.ResizeObserver;
		MockResizeObserver.instances = [];
		globalThis.ResizeObserver =
			MockResizeObserver as unknown as typeof ResizeObserver;

		const rectSpy = vi
			.spyOn(HTMLElement.prototype, "getBoundingClientRect")
			.mockReturnValue(mockRect(100, 100));

		const renderOverlay = () => (
			<div id="osd-test">
				<MeasurementOverlay
					measurements={[makeMeasurement()]}
					activePoints={[]}
					imageWidth={100}
					containerId="osd-test"
					viewport={makeViewport()}
					onRemoveMeasurement={vi.fn()}
					visible={true}
				/>
			</div>
		);
		const { container, rerender } = render(renderOverlay());
		rerender(renderOverlay());

		const line = () => container.querySelector("line") as SVGLineElement;
		expect(numAttr(line(), "x1")).toBeCloseTo(10, 6);
		expect(numAttr(line(), "y1")).toBeCloseTo(10, 6);

		rectSpy.mockReturnValue(mockRect(200, 200));
		const observer = MockResizeObserver.instances.at(-1);
		act(() => observer?.trigger());

		expect(numAttr(line(), "x1")).toBeCloseTo(20, 6);
		expect(numAttr(line(), "y1")).toBeCloseTo(20, 6);

		rectSpy.mockRestore();
		globalThis.ResizeObserver = originalResizeObserver;
	});

	it("reprojects stored image-coordinate measurements after OSD viewport changes", () => {
		vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(
			mockRect(100, 100),
		);
		const viewportCenter = { x: 0.5, y: 0.5 };
		const viewport = makeViewport({ center: viewportCenter });

		const renderOverlay = () => (
			<div id="osd-test">
				<MeasurementOverlay
					measurements={[makeMeasurement()]}
					activePoints={[]}
					imageWidth={100}
					containerId="osd-test"
					viewport={viewport}
					onRemoveMeasurement={vi.fn()}
					visible={true}
				/>
			</div>
		);
		const { container, rerender } = render(renderOverlay());
		rerender(renderOverlay());

		const line = () => container.querySelector("line") as SVGLineElement;
		expect(numAttr(line(), "x1")).toBeCloseTo(10, 6);
		expect(numAttr(line(), "y1")).toBeCloseTo(10, 6);

		viewportCenter.x = 0.8;
		viewportCenter.y = 0.2;
		act(() => viewport.fireHandlers("viewport-change"));

		expect(numAttr(line(), "x1")).toBeCloseTo(-20, 6);
		expect(numAttr(line(), "y1")).toBeCloseTo(40, 6);
	});

	it("projects stored measurements through rotation around the image center while panned", () => {
		vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(
			mockRect(100, 100),
		);
		// パンで画像中心から離れたビューポート。画像中心ちょうどにある点は
		// 回転しても動かないはず（回転の基準点が画像中心である場合）。
		const measurement = {
			...makeMeasurement(),
			points: [
				{ x: 50, y: 50 },
				{ x: 80, y: 50 },
			] as [{ x: number; y: number }, { x: number; y: number }],
		};

		const renderWithRotation = (rotation: number) => {
			const renderOverlay = () => (
				<div id="osd-test">
					<MeasurementOverlay
						measurements={[measurement]}
						activePoints={[]}
						imageWidth={100}
						containerId="osd-test"
						viewport={makeViewport({
							center: { x: 0.8, y: 0.2 },
							rotation,
						})}
						onRemoveMeasurement={vi.fn()}
						visible={true}
					/>
				</div>
			);
			const result = render(renderOverlay());
			result.rerender(renderOverlay());
			return result;
		};

		const unrotated = renderWithRotation(0);
		const unrotatedLine = unrotated.container.querySelector(
			"line",
		) as SVGLineElement;
		expect(numAttr(unrotatedLine, "x1")).toBeCloseTo(20, 6);
		expect(numAttr(unrotatedLine, "y1")).toBeCloseTo(80, 6);
		unrotated.unmount();

		const rotated = renderWithRotation(90);
		const rotatedLine = rotated.container.querySelector(
			"line",
		) as SVGLineElement;
		expect(numAttr(rotatedLine, "x1")).toBeCloseTo(20, 6);
		expect(numAttr(rotatedLine, "y1")).toBeCloseTo(80, 6);
		rotated.unmount();
	});

	it("projects stored measurements through horizontal flip", () => {
		// OSD viewport.getFlip() は左右反転のみを表す（垂直反転はOSDにはない概念）。
		vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(
			mockRect(100, 100),
		);
		const renderOverlay = () => (
			<div id="osd-test">
				<MeasurementOverlay
					measurements={[makeMeasurement()]}
					activePoints={[]}
					imageWidth={100}
					containerId="osd-test"
					viewport={makeViewport({ flip: true })}
					onRemoveMeasurement={vi.fn()}
					visible={true}
				/>
			</div>
		);
		const { container, rerender } = render(renderOverlay());
		rerender(renderOverlay());

		const line = container.querySelector("line") as SVGLineElement;
		expect(numAttr(line, "x1")).toBeCloseTo(90, 6);
		expect(numAttr(line, "y1")).toBeCloseTo(10, 6);
	});

	it("配置中の計測点とプレビュー線をresize後も画像座標から再投影する", () => {
		const originalResizeObserver = globalThis.ResizeObserver;
		MockResizeObserver.instances = [];
		globalThis.ResizeObserver =
			MockResizeObserver as unknown as typeof ResizeObserver;

		const rectSpy = vi
			.spyOn(HTMLElement.prototype, "getBoundingClientRect")
			.mockReturnValue(mockRect(100, 100));

		const renderOverlay = () => (
			<div id="osd-test">
				<MeasurementOverlay
					measurements={[]}
					activePoints={[
						{ x: 10, y: 10 },
						{ x: 30, y: 10 },
					]}
					imageWidth={100}
					containerId="osd-test"
					viewport={makeViewport()}
					onRemoveMeasurement={vi.fn()}
					visible={true}
				/>
			</div>
		);
		const { container, rerender } = render(renderOverlay());
		rerender(renderOverlay());

		const previewLine = () => container.querySelector("line") as SVGLineElement;
		expect(numAttr(previewLine(), "x1")).toBeCloseTo(10, 6);
		expect(numAttr(previewLine(), "x2")).toBeCloseTo(30, 6);

		rectSpy.mockReturnValue(mockRect(200, 200));
		const observer = MockResizeObserver.instances.at(-1);
		act(() => observer?.trigger());

		expect(numAttr(previewLine(), "x1")).toBeCloseTo(20, 6);
		expect(numAttr(previewLine(), "x2")).toBeCloseTo(60, 6);

		rectSpy.mockRestore();
		globalThis.ResizeObserver = originalResizeObserver;
	});
});
