// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
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
	imageToViewportCoordinates: (x: number, y: number) => ({ x, y }),
	viewportToViewerElementCoordinates: (point: { x: number; y: number }) =>
		point,
	addHandler: vi.fn(),
	removeHandler: vi.fn(),
});

describe("MeasurementOverlay", () => {
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
});
