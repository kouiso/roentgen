import { describe, expect, it } from "vitest";
import type { MeasurementPoint } from "@/types/measurement";
import { createImageGeometry, getPixelAspect } from "./image-geometry";
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

	it("returns the clinical interior angle instead of a reflex angle", () => {
		const p1: MeasurementPoint = { x: 1, y: 0 };
		const p2: MeasurementPoint = { x: 0, y: 0 };
		const p3: MeasurementPoint = { x: 0, y: -1 };
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

// OSD のビューポート座標は表示タイル幅 = 1.0 の等方座標。
// 例: 2048x1024 の画像は高さ 0.5、ホーム位置の中心は (0.5, 0.25)。
function makeViewport(
	zoom = 1,
	centerX = 0.5,
	centerY = 0.5,
	rotation = 0,
	flip = false,
) {
	return {
		getZoom: () => zoom,
		getCenter: () => ({ x: centerX, y: centerY }),
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
		const viewport = makeViewport(1, 0.5, 0.5);

		const result = containerToImageCoord(400, 400, rect, 512, 512, viewport);
		expect(result).not.toBeNull();
		if (!result) return;
		expect(result.x).toBeCloseTo(256, 0);
		expect(result.y).toBeCloseTo(256, 0);
	});

	it("returns null when coordinates are outside image bounds", () => {
		const rect = makeContainerRect(0, 0, 800, 800);
		// Viewport zoomed out so much that click maps outside image
		const viewport = makeViewport(0.1, 0.5, 0.5);

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
		const viewport = makeViewport(1, 0.5, 0.5);

		// Click at center of the offset container
		const result = containerToImageCoord(500, 450, rect, 512, 512, viewport);
		expect(result).not.toBeNull();
		if (!result) return;
		expect(result.x).toBeCloseTo(256, 0);
		expect(result.y).toBeCloseTo(256, 0);
	});

	it("uses isotropic viewport units for the Y axis of landscape images", () => {
		const rect = makeContainerRect(0, 0, 800, 400);
		const viewport = makeViewport(1, 0.5, 0.25);

		const result = containerToImageCoord(400, 300, rect, 2048, 1024, viewport);

		expect(result).not.toBeNull();
		if (!result) return;
		expect(result.x).toBeCloseTo(1024, 6);
		expect(result.y).toBeCloseTo(768, 6);
	});

	it("maps the painted height of portrait images at the home zoom", () => {
		const rect = makeContainerRect(0, 0, 800, 600);
		const viewport = makeViewport(0.375, 0.5, 1);

		const result = containerToImageCoord(400, 590, rect, 1024, 2048, viewport);

		expect(result).not.toBeNull();
		if (!result) return;
		expect(result.x).toBeCloseTo(512, 6);
		expect(result.y).toBeCloseTo(2013.866667, 6);
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
		const viewport = makeViewport(1, 0.5, 0.5);

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
		const viewport = makeViewport(1, 0.5, 0.5);

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

	it("uses isotropic viewport units for the Y axis of landscape images", () => {
		const rect = makeContainerRect(0, 0, 800, 400);
		const viewport = makeViewport(1, 0.5, 0.25);

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
		expect(result.y).toBeCloseTo(300, 6);
	});

	it("projects portrait image points using the painted image height", () => {
		const rect = makeContainerRect(0, 0, 800, 600);
		const viewport = makeViewport(0.375, 0.5, 1);

		const result = imageToContainerCoord(
			{ x: 512, y: 2047 },
			1024,
			2048,
			rect,
			viewport,
		);

		expect(result).not.toBeNull();
		if (!result) throw new Error("container coordinate should be present");
		expect(result.x).toBeCloseTo(400, 6);
		expect(result.y).toBeCloseTo(599.707031, 6);
	});

	it("round-trips with containerToImageCoord", () => {
		const rect = makeContainerRect(0, 0, 800, 800);
		const viewport = makeViewport(1, 0.5, 0.5);
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
		{ rotation: 90, flip: true, expected: { x: 400, y: 400 } },
		{ rotation: 180, flip: true, expected: { x: 600, y: 200 } },
		{ rotation: 270, flip: true, expected: { x: 400, y: 0 } },
	])("accounts for rotation $rotation and flip $flip", ({
		rotation,
		flip,
		expected,
	}) => {
		const rect = makeContainerRect(0, 0, 800, 400);
		const viewport = makeViewport(1, 0.5, 0.25, rotation, flip);
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

	it.each([
		{
			label: "rotation 90",
			geometry: { rotation: 90 },
			expectedTopLeft: { x: 600, y: 0 },
		},
		{
			label: "rotation 90 + horizontal flip (screen space)",
			geometry: { rotation: 90, flipHorizontal: true },
			expectedTopLeft: { x: 200, y: 0 },
		},
		{
			label: "rotation 270 + vertical flip (screen space)",
			geometry: { rotation: 270, flipVertical: true },
			expectedTopLeft: { x: 200, y: 0 },
		},
	])("projects stored points through the display geometry ($label)", ({
		geometry,
		expectedTopLeft,
	}) => {
		// 回転すると表示タイルは 1024x2048 になり、正方コンテナではホームズーム 0.5
		const rect = makeContainerRect(0, 0, 800, 800);
		const viewport = makeViewport(0.5, 0.5, 1);
		const imageGeometry = createImageGeometry(2048, 1024, geometry);

		const topLeft = imageToContainerCoord(
			{ x: 0, y: 0 },
			2048,
			1024,
			rect,
			viewport,
			imageGeometry,
		);
		const center = imageToContainerCoord(
			{ x: 1024, y: 512 },
			2048,
			1024,
			rect,
			viewport,
			imageGeometry,
		);
		if (!topLeft || !center) {
			throw new Error("container coordinate should be present");
		}
		expect(topLeft.x).toBeCloseTo(expectedTopLeft.x, 6);
		expect(topLeft.y).toBeCloseTo(expectedTopLeft.y, 6);
		expect(center.x).toBeCloseTo(400, 6);
		expect(center.y).toBeCloseTo(400, 6);

		const imagePoint = { x: 1500.25, y: 200.5 };
		const container = imageToContainerCoord(
			imagePoint,
			2048,
			1024,
			rect,
			viewport,
			imageGeometry,
		);
		if (!container) throw new Error("container coordinate should be present");
		const roundTripped = containerToImageCoord(
			container.x,
			container.y,
			rect,
			2048,
			1024,
			viewport,
			imageGeometry,
		);
		if (!roundTripped) throw new Error("image coordinate should be present");
		expect(roundTripped.x).toBeCloseTo(imagePoint.x, 6);
		expect(roundTripped.y).toBeCloseTo(imagePoint.y, 6);
	});

	it("stretches non-square pixels so the overlay matches the corrected display", () => {
		// 行間隔 0.2mm / 列間隔 0.1mm → 1000x500 px の画像は表示上 1000x1000 の正方形
		const rect = makeContainerRect(0, 0, 800, 800);
		const viewport = makeViewport(1, 0.5, 0.5);
		const imageGeometry = createImageGeometry(1000, 500, {
			pixelAspect: getPixelAspect([0.2, 0.1]),
		});

		const bottomLeft = imageToContainerCoord(
			{ x: 0, y: 500 },
			1000,
			500,
			rect,
			viewport,
			imageGeometry,
		);
		const rightMiddle = imageToContainerCoord(
			{ x: 1000, y: 250 },
			1000,
			500,
			rect,
			viewport,
			imageGeometry,
		);
		if (!bottomLeft || !rightMiddle) {
			throw new Error("container coordinate should be present");
		}
		expect(bottomLeft.x).toBeCloseTo(0, 6);
		expect(bottomLeft.y).toBeCloseTo(800, 6);
		expect(rightMiddle.x).toBeCloseTo(800, 6);
		expect(rightMiddle.y).toBeCloseTo(400, 6);

		const picked = containerToImageCoord(
			200,
			600,
			rect,
			1000,
			500,
			viewport,
			imageGeometry,
		);
		if (!picked) throw new Error("image coordinate should be present");
		expect(picked.x).toBeCloseTo(250, 6);
		expect(picked.y).toBeCloseTo(375, 6);
	});

	it("ignores a geometry whose image size does not match", () => {
		const rect = makeContainerRect(0, 0, 800, 800);
		const viewport = makeViewport(1, 0.5, 0.5);
		const staleGeometry = createImageGeometry(100, 100, { rotation: 90 });

		const result = imageToContainerCoord(
			{ x: 0, y: 0 },
			512,
			512,
			rect,
			viewport,
			staleGeometry,
		);
		if (!result) throw new Error("container coordinate should be present");
		expect(result.x).toBeCloseTo(0, 6);
		expect(result.y).toBeCloseTo(0, 6);
	});

	it("round-trips horizontal flip using image-coordinate storage", () => {
		// OSD viewport.getFlip() は左右反転のみを表す（垂直反転はOSDにはない概念）。
		const rect = makeContainerRect(0, 0, 800, 800);
		const imageWidth = 512;
		const imageHeight = 512;
		const viewport = makeViewport(1, 0.5, 0.5, 0, true);
		const imagePoint = { x: 120, y: 340 };

		const containerCoord = imageToContainerCoord(
			imagePoint,
			imageWidth,
			imageHeight,
			rect,
			viewport,
		);
		expect(containerCoord).not.toBeNull();
		if (!containerCoord)
			throw new Error("container coordinate should be present");

		const roundTripped = containerToImageCoord(
			containerCoord.x,
			containerCoord.y,
			rect,
			imageWidth,
			imageHeight,
			viewport,
		);
		expect(roundTripped).not.toBeNull();
		if (!roundTripped) throw new Error("image coordinate should be present");
		expect(roundTripped.x).toBeCloseTo(imagePoint.x, 6);
		expect(roundTripped.y).toBeCloseTo(imagePoint.y, 6);
	});
});
