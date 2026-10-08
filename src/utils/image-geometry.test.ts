import { describe, expect, it } from "vitest";
import {
	createImageGeometry,
	displayToImagePoint,
	getDisplaySize,
	getImageToDisplayMatrix,
	getPixelAspect,
	imageToDisplayPoint,
	MAX_DISPLAY_CANVAS_DIMENSION,
	normalizeRotation,
} from "./image-geometry";

describe("getPixelAspect", () => {
	it("returns row spacing / column spacing", () => {
		expect(getPixelAspect([0.2, 0.1])).toBeCloseTo(2, 10);
		expect(getPixelAspect([0.1, 0.2])).toBeCloseTo(0.5, 10);
		expect(getPixelAspect([0.127, 0.127])).toBe(1);
	});

	it.each([
		null,
		undefined,
		[0, 0.1] as [number, number],
		[0.1, -1] as [number, number],
		[Number.NaN, 0.1] as [number, number],
	])("falls back to square pixels for %s", (spacing) => {
		expect(getPixelAspect(spacing)).toBe(1);
	});
});

describe("normalizeRotation", () => {
	it.each([
		[0, 0],
		[90, 90],
		[-90, 270],
		[450, 90],
		[-360, 0],
		[44, 0],
		[46, 90],
		[Number.NaN, 0],
	])("normalizes %s to %s", (input, expected) => {
		expect(normalizeRotation(input)).toBe(expected);
	});
});

describe("getDisplaySize", () => {
	it("keeps square-pixel images at their native size", () => {
		expect(getDisplaySize(createImageGeometry(2396, 1996))).toEqual({
			width: 2396,
			height: 1996,
		});
	});

	it("swaps width and height for quarter turns", () => {
		for (const rotation of [90, 270, -90]) {
			expect(
				getDisplaySize(createImageGeometry(400, 300, { rotation })),
			).toEqual({ width: 300, height: 400 });
		}
		expect(
			getDisplaySize(createImageGeometry(400, 300, { rotation: 180 })),
		).toEqual({ width: 400, height: 300 });
	});

	it("stretches the short physical axis instead of shrinking the long one", () => {
		// 行間隔が大きい → 縦に伸ばす
		expect(
			getDisplaySize(createImageGeometry(400, 300, { pixelAspect: 2 })),
		).toEqual({ width: 400, height: 600 });
		// 列間隔が大きい → 横に伸ばす
		expect(
			getDisplaySize(createImageGeometry(400, 300, { pixelAspect: 0.5 })),
		).toEqual({ width: 800, height: 300 });
		expect(
			getDisplaySize(
				createImageGeometry(400, 300, { pixelAspect: 2, rotation: 90 }),
			),
		).toEqual({ width: 600, height: 400 });
	});

	it("caps the display canvas so Chromium can allocate it", () => {
		const size = getDisplaySize(
			createImageGeometry(20000, 8000, { pixelAspect: 3 }),
		);
		expect(Math.max(size.width, size.height)).toBe(
			MAX_DISPLAY_CANVAS_DIMENSION,
		);
		// 縦横比（物理寸法）は維持される: 20000*1 : 8000*3
		expect(size.height / size.width).toBeCloseTo(1.2, 3);
	});

	it("returns an empty size for an empty image", () => {
		expect(getDisplaySize(createImageGeometry(0, 0))).toEqual({
			width: 0,
			height: 0,
		});
	});
});

describe("imageToDisplayPoint", () => {
	// 4x2 の画像で左上(0,0)・右上(4,0)がどこに来るか
	it.each([
		{ geometry: {}, topLeft: { x: 0, y: 0 }, topRight: { x: 4, y: 0 } },
		{
			geometry: { rotation: 90 },
			topLeft: { x: 2, y: 0 },
			topRight: { x: 2, y: 4 },
		},
		{
			geometry: { rotation: 180 },
			topLeft: { x: 4, y: 2 },
			topRight: { x: 0, y: 2 },
		},
		{
			geometry: { rotation: 270 },
			topLeft: { x: 0, y: 4 },
			topRight: { x: 0, y: 0 },
		},
		{
			geometry: { flipHorizontal: true },
			topLeft: { x: 4, y: 0 },
			topRight: { x: 0, y: 0 },
		},
		{
			geometry: { flipVertical: true },
			topLeft: { x: 0, y: 2 },
			topRight: { x: 4, y: 2 },
		},
		// 反転は回転後の画面基準: 90°回転中の左右反転は画面上で左右が入れ替わる
		{
			geometry: { rotation: 90, flipHorizontal: true },
			topLeft: { x: 0, y: 0 },
			topRight: { x: 0, y: 4 },
		},
		{
			geometry: { rotation: 90, flipVertical: true },
			topLeft: { x: 2, y: 4 },
			topRight: { x: 2, y: 0 },
		},
	])("maps corners for $geometry", ({ geometry, topLeft, topRight }) => {
		const g = createImageGeometry(4, 2, geometry);
		const tl = imageToDisplayPoint({ x: 0, y: 0 }, g);
		const tr = imageToDisplayPoint({ x: 4, y: 0 }, g);
		expect(tl.x).toBeCloseTo(topLeft.x, 10);
		expect(tl.y).toBeCloseTo(topLeft.y, 10);
		expect(tr.x).toBeCloseTo(topRight.x, 10);
		expect(tr.y).toBeCloseTo(topRight.y, 10);
	});

	it("applies the pixel aspect before rotating", () => {
		// 4x2 px・縦長ピクセル(2倍) → 表示 4x4、90°回転後も 4x4
		const g = createImageGeometry(4, 2, { pixelAspect: 2, rotation: 90 });
		const bottomLeft = imageToDisplayPoint({ x: 0, y: 2 }, g);
		expect(bottomLeft.x).toBeCloseTo(0, 10);
		expect(bottomLeft.y).toBeCloseTo(0, 10);
		const center = imageToDisplayPoint({ x: 2, y: 1 }, g);
		expect(center.x).toBeCloseTo(2, 10);
		expect(center.y).toBeCloseTo(2, 10);
	});

	it("matches the canvas setTransform matrix", () => {
		const g = createImageGeometry(300, 200, {
			pixelAspect: 0.6,
			rotation: 270,
			flipHorizontal: true,
		});
		const m = getImageToDisplayMatrix(g);
		const p = { x: 17, y: 123 };
		const viaMatrix = {
			x: m.a * p.x + m.c * p.y + m.e,
			y: m.b * p.x + m.d * p.y + m.f,
		};
		const viaHelper = imageToDisplayPoint(p, g);
		expect(viaHelper.x).toBeCloseTo(viaMatrix.x, 10);
		expect(viaHelper.y).toBeCloseTo(viaMatrix.y, 10);
	});
});

describe("displayToImagePoint", () => {
	const rotations = [0, 90, 180, 270];
	const flips = [
		{ flipHorizontal: false, flipVertical: false },
		{ flipHorizontal: true, flipVertical: false },
		{ flipHorizontal: false, flipVertical: true },
		{ flipHorizontal: true, flipVertical: true },
	];
	const aspects = [1, 0.3, 0.6, 2.5];
	const cases = rotations.flatMap((rotation) =>
		flips.flatMap((flip) =>
			aspects.map((pixelAspect) => ({ rotation, pixelAspect, ...flip })),
		),
	);

	it.each(
		cases,
	)("round-trips rotation=$rotation aspect=$pixelAspect flipH=$flipHorizontal flipV=$flipVertical", (options) => {
		const g = createImageGeometry(640, 480, options);
		for (const point of [
			{ x: 0, y: 0 },
			{ x: 639.5, y: 0.25 },
			{ x: 123.4, y: 456.7 },
			{ x: 320, y: 240 },
		]) {
			const display = imageToDisplayPoint(point, g);
			const size = getDisplaySize(g);
			expect(display.x).toBeGreaterThanOrEqual(-1e-6);
			expect(display.y).toBeGreaterThanOrEqual(-1e-6);
			expect(display.x).toBeLessThanOrEqual(size.width + 1e-6);
			expect(display.y).toBeLessThanOrEqual(size.height + 1e-6);
			const back = displayToImagePoint(display, g);
			expect(back.x).toBeCloseTo(point.x, 8);
			expect(back.y).toBeCloseTo(point.y, 8);
		}
	});
});
