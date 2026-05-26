// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
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

const makeViewport = () => ({
	getBounds: () => ({ x: 0, y: 0, width: 1, height: 1 }),
	getZoom: () => 1,
	getCenter: () => ({ x: 0.5, y: 0.5 }),
	getHomeBounds: () => ({ x: 0, y: 0, width: 1, height: 1 }),
	getRotation: () => 0,
	getFlip: () => false,
	imageToViewportCoordinates: (x: number, y: number) => ({ x, y }),
	viewportToViewerElementCoordinates: (point: { x: number; y: number }) =>
		point,
	addHandler: vi.fn(),
	removeHandler: vi.fn(),
});

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
});
