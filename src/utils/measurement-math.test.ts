import { describe, expect, it } from "vitest";
import type { MeasurementPoint } from "@/types/measurement";
import {
	calculateAngleDeg,
	calculateDistanceMm,
	containerToImageCoord,
	imageToContainerCoord,
} from "./measurement-math";

describe("calculateDistanceMm", () => {
	it("returns 0 for the same point", () => {
		const p: MeasurementPoint = { x: 10, y: 20 };
		expect(calculateDistanceMm(p, p, null)).toBe(0);
	});

	it("calculates horizontal distance without pixel spacing", () => {
		const p1: MeasurementPoint = { x: 0, y: 0 };
		const p2: MeasurementPoint = { x: 3, y: 0 };
		expect(calculateDistanceMm(p1, p2, null)).toBe(3);
	});

	it("calculates vertical distance without pixel spacing", () => {
		const p1: MeasurementPoint = { x: 0, y: 0 };
		const p2: MeasurementPoint = { x: 0, y: 4 };
		expect(calculateDistanceMm(p1, p2, null)).toBe(4);
	});

	it("calculates diagonal distance (3-4-5 triangle)", () => {
		const p1: MeasurementPoint = { x: 0, y: 0 };
		const p2: MeasurementPoint = { x: 3, y: 4 };
		expect(calculateDistanceMm(p1, p2, null)).toBe(5);
	});

	it("applies pixel spacing correctly", () => {
		const p1: MeasurementPoint = { x: 0, y: 0 };
		const p2: MeasurementPoint = { x: 10, y: 0 };
		// colSpacing = 0.5 mm/pixel → 10 * 0.5 = 5 mm
		expect(calculateDistanceMm(p1, p2, [1, 0.5])).toBe(5);
	});

	it("applies row spacing for vertical distance", () => {
		const p1: MeasurementPoint = { x: 0, y: 0 };
		const p2: MeasurementPoint = { x: 0, y: 10 };
		// rowSpacing = 2 mm/pixel → 10 * 2 = 20 mm
		expect(calculateDistanceMm(p1, p2, [2, 1])).toBe(20);
	});

	it("handles anisotropic pixel spacing", () => {
		const p1: MeasurementPoint = { x: 0, y: 0 };
		const p2: MeasurementPoint = { x: 3, y: 4 };
		// colSpacing=2, rowSpacing=3 → dx=6, dy=12 → sqrt(36+144) = sqrt(180)
		expect(calculateDistanceMm(p1, p2, [3, 2])).toBeCloseTo(Math.sqrt(180), 10);
	});

	it("defaults to spacing=1 when pixelSpacing is null", () => {
		const p1: MeasurementPoint = { x: 1, y: 1 };
		const p2: MeasurementPoint = { x: 4, y: 5 };
		// dx=3, dy=4 → 5
		expect(calculateDistanceMm(p1, p2, null)).toBe(5);
	});
});

describe("calculateAngleDeg", () => {
	it("returns 90° for a right angle", () => {
		const p1: MeasurementPoint = { x: 1, y: 0 };
		const p2: MeasurementPoint = { x: 0, y: 0 }; // vertex
		const p3: MeasurementPoint = { x: 0, y: 1 };
		expect(calculateAngleDeg(p1, p2, p3)).toBeCloseTo(90, 10);
	});

	it("returns 180° for a straight line (p2 in the middle)", () => {
		const p1: MeasurementPoint = { x: -5, y: 0 };
		const p2: MeasurementPoint = { x: 0, y: 0 };
		const p3: MeasurementPoint = { x: 5, y: 0 };
		expect(calculateAngleDeg(p1, p2, p3)).toBeCloseTo(180, 10);
	});

	it("returns 0° for collinear points in the same direction", () => {
		const p1: MeasurementPoint = { x: 5, y: 0 };
		const p2: MeasurementPoint = { x: 0, y: 0 };
		const p3: MeasurementPoint = { x: 10, y: 0 };
		expect(calculateAngleDeg(p1, p2, p3)).toBeCloseTo(0, 10);
	});

	it("calculates acute angle (45°)", () => {
		const p1: MeasurementPoint = { x: 1, y: 0 };
		const p2: MeasurementPoint = { x: 0, y: 0 };
		const p3: MeasurementPoint = { x: 1, y: 1 };
		expect(calculateAngleDeg(p1, p2, p3)).toBeCloseTo(45, 10);
	});

	it("calculates obtuse angle (135°)", () => {
		const p1: MeasurementPoint = { x: 1, y: 0 };
		const p2: MeasurementPoint = { x: 0, y: 0 };
		const p3: MeasurementPoint = { x: -1, y: 1 };
		expect(calculateAngleDeg(p1, p2, p3)).toBeCloseTo(135, 10);
	});

	it("returns 60° for equilateral triangle vertex", () => {
		const p1: MeasurementPoint = { x: 1, y: 0 };
		const p2: MeasurementPoint = { x: 0, y: 0 };
		const p3: MeasurementPoint = { x: 0.5, y: Math.sqrt(3) / 2 };
		expect(calculateAngleDeg(p1, p2, p3)).toBeCloseTo(60, 10);
	});

	it("is symmetric — angle does not depend on arm order for abs(cross)", () => {
		const p1: MeasurementPoint = { x: 0, y: 1 };
		const p2: MeasurementPoint = { x: 0, y: 0 };
		const p3: MeasurementPoint = { x: 1, y: 0 };
		// same angle as (1,0)→(0,0)→(0,1) = 90°
		expect(calculateAngleDeg(p1, p2, p3)).toBeCloseTo(90, 10);
	});
});

// ---------------------------------------------------------------------------
// Mock DOMRect and viewport helpers
// ---------------------------------------------------------------------------
function makeContainerRect(
	left: number,
	top: number,
	width: number,
	height: number,
): DOMRect {
	return {
		left,
		top,
		width,
		height,
		right: left + width,
		bottom: top + height,
		x: left,
		y: top,
		toJSON: () => ({}),
	};
}

function makeViewport(
	zoom = 1,
	centerX = 0.5,
	centerY = 0.5,
	boundsWidth = 1,
	boundsHeight = 1,
	rotation = 0,
	flip = false,
) {
	return {
		getZoom: () => zoom,
		getCenter: () => ({ x: centerX, y: centerY }),
		getHomeBounds: () => ({
			x: 0,
			y: 0,
			width: boundsWidth,
			height: boundsHeight,
		}),
		getRotation: () => rotation,
		getFlip: () => flip,
	};
}

// ---------------------------------------------------------------------------
// containerToImageCoord
// ---------------------------------------------------------------------------
describe("containerToImageCoord", () => {
	it("returns null when viewport is null", () => {
		const rect = makeContainerRect(0, 0, 800, 600);
		expect(containerToImageCoord(400, 300, rect, 512, 512, null)).toBeNull();
	});

	it("converts center of container to image coordinates", () => {
		const rect = makeContainerRect(0, 0, 800, 800);
		const viewport = makeViewport(1, 0.5, 0.5, 1);

		const result = containerToImageCoord(400, 400, rect, 512, 512, viewport);
		expect(result).not.toBeNull();
		if (!result) return;
		expect(result.x).toBeCloseTo(256, 0);
		expect(result.y).toBeCloseTo(256, 0);
	});

	it("returns null when coordinates are outside image bounds", () => {
		const rect = makeContainerRect(0, 0, 800, 800);
		// Viewport zoomed out so much that click maps outside image
		const viewport = makeViewport(0.1, 0.5, 0.5, 1);

		// Click at (0,0) in container → maps to negative image coordinates
		const result = containerToImageCoord(0, 0, rect, 512, 512, viewport);
		// Depending on the math, this might be null or not, let's verify
		// With zoom=0.1, vpWidth = 1/0.1 = 10, centerX=0.5
		// vpX = 0.5 - 5 + (0/800)*10 = -4.5
		// imgX = (-4.5/1)*512 = -2304 → negative → null
		expect(result).toBeNull();
	});

	it("handles container with offset position", () => {
		const rect = makeContainerRect(100, 50, 800, 800);
		const viewport = makeViewport(1, 0.5, 0.5, 1);

		// Click at center of the offset container
		const result = containerToImageCoord(500, 450, rect, 512, 512, viewport);
		expect(result).not.toBeNull();
		if (!result) return;
		expect(result.x).toBeCloseTo(256, 0);
		expect(result.y).toBeCloseTo(256, 0);
	});

	it("uses image height and home bounds height for the Y axis", () => {
		const rect = makeContainerRect(0, 0, 800, 400);
		const viewport = makeViewport(1, 0.5, 0.5, 1, 1);

		const result = containerToImageCoord(400, 300, rect, 2048, 1024, viewport);

		expect(result).not.toBeNull();
		if (!result) return;
		expect(result.x).toBeCloseTo(1024, 6);
		expect(result.y).toBeCloseTo(640, 6);
	});
});

// ---------------------------------------------------------------------------
// imageToContainerCoord
// ---------------------------------------------------------------------------
describe("imageToContainerCoord", () => {
	it("returns null when viewport is null", () => {
		const rect = makeContainerRect(0, 0, 800, 600);
		expect(
			imageToContainerCoord({ x: 256, y: 256 }, 512, 512, rect, null),
		).toBeNull();
	});

	it("converts center of image to container center", () => {
		const rect = makeContainerRect(0, 0, 800, 800);
		const viewport = makeViewport(1, 0.5, 0.5, 1);

		const result = imageToContainerCoord(
			{ x: 256, y: 256 },
			512,
			512,
			rect,
			viewport,
		);
		expect(result).not.toBeNull();
		if (!result) throw new Error("container coordinate should be present");
		expect(result.x).toBeCloseTo(400, 0);
		expect(result.y).toBeCloseTo(400, 0);
	});

	it("converts top-left of image (0,0) to container coordinates", () => {
		const rect = makeContainerRect(0, 0, 800, 800);
		const viewport = makeViewport(1, 0.5, 0.5, 1);

		const result = imageToContainerCoord(
			{ x: 0, y: 0 },
			512,
			512,
			rect,
			viewport,
		);
		expect(result).not.toBeNull();
		if (!result) throw new Error("container coordinate should be present");
		expect(result.x).toBeCloseTo(0, 0);
		expect(result.y).toBeCloseTo(0, 0);
	});

	it("uses image height and home bounds height for the Y axis", () => {
		const rect = makeContainerRect(0, 0, 800, 400);
		const viewport = makeViewport(1, 0.5, 0.5, 1, 1);

		const result = imageToContainerCoord(
			{ x: 1024, y: 768 },
			2048,
			1024,
			rect,
			viewport,
		);

		expect(result).not.toBeNull();
		if (!result) throw new Error("container coordinate should be present");
		expect(result.x).toBeCloseTo(400, 6);
		expect(result.y).toBeCloseTo(400, 6);
	});

	it("round-trips with containerToImageCoord", () => {
		const rect = makeContainerRect(0, 0, 800, 800);
		const viewport = makeViewport(1, 0.5, 0.5, 1);
		const imageWidth = 512;
		const imageHeight = 512;

		// Start with a container point
		const clientX = 400;
		const clientY = 300;

		const imgCoord = containerToImageCoord(
			clientX,
			clientY,
			rect,
			imageWidth,
			imageHeight,
			viewport,
		);
		expect(imgCoord).not.toBeNull();
		if (!imgCoord) throw new Error("image coordinate should be present");

		const containerCoord = imageToContainerCoord(
			imgCoord,
			imageWidth,
			imageHeight,
			rect,
			viewport,
		);
		expect(containerCoord).not.toBeNull();
		if (!containerCoord) {
			throw new Error("round-tripped container coordinate should be present");
		}
		expect(containerCoord.x).toBeCloseTo(clientX, 0);
		expect(containerCoord.y).toBeCloseTo(clientY, 0);
	});

	it.each([
		{ rotation: 0, flip: false, expected: { x: 600, y: 200 } },
		{ rotation: 90, flip: false, expected: { x: 400, y: 400 } },
		{ rotation: 180, flip: false, expected: { x: 200, y: 200 } },
		{ rotation: 270, flip: false, expected: { x: 400, y: 0 } },
		{ rotation: 0, flip: true, expected: { x: 200, y: 200 } },
		{ rotation: 90, flip: true, expected: { x: 400, y: 0 } },
		{ rotation: 180, flip: true, expected: { x: 600, y: 200 } },
		{ rotation: 270, flip: true, expected: { x: 400, y: 400 } },
	])("accounts for rotation $rotation and flip $flip", ({
		rotation,
		flip,
		expected,
	}) => {
		const rect = makeContainerRect(0, 0, 800, 400);
		const viewport = makeViewport(1, 0.5, 0.25, 1, 0.5, rotation, flip);
		const imagePoint = { x: 1536, y: 512 };

		const containerCoord = imageToContainerCoord(
			imagePoint,
			2048,
			1024,
			rect,
			viewport,
		);
		expect(containerCoord).not.toBeNull();
		if (!containerCoord) {
			throw new Error("container coordinate should be present");
		}
		expect(containerCoord.x).toBeCloseTo(expected.x, 6);
		expect(containerCoord.y).toBeCloseTo(expected.y, 6);

		const roundTripped = containerToImageCoord(
			containerCoord.x,
			containerCoord.y,
			rect,
			2048,
			1024,
			viewport,
		);
		expect(roundTripped).not.toBeNull();
		if (!roundTripped) throw new Error("image coordinate should be present");
		expect(roundTripped.x).toBeCloseTo(imagePoint.x, 6);
		expect(roundTripped.y).toBeCloseTo(imagePoint.y, 6);
	});
});
