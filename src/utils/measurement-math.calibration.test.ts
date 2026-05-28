import { describe, expect, it } from "vitest";
import { calculateDistance } from "./measurement-math";

describe("calculateDistance calibration", () => {
	it("marks PixelSpacing fallback measurements as uncalibrated pixels", () => {
		const result = calculateDistance({ x: 0, y: 0 }, { x: 3, y: 4 }, null);

		expect(result).toEqual({
			value: 5,
			unit: "px",
			calibrated: false,
		});
	});

	it("marks PixelSpacing-backed measurements as calibrated millimeters", () => {
		const result = calculateDistance({ x: 0, y: 0 }, { x: 10, y: 0 }, [1, 0.5]);

		expect(result).toEqual({
			value: 5,
			unit: "mm",
			calibrated: true,
		});
	});

	it.each([
		{ name: "zero row spacing", spacing: [0, 0.5] as [number, number] },
		{ name: "negative column spacing", spacing: [1, -0.5] as [number, number] },
		{
			name: "infinite row spacing",
			spacing: [Infinity, 0.5] as [number, number],
		},
	])("treats invalid PixelSpacing as uncalibrated pixels: $name", ({
		spacing,
	}) => {
		const result = calculateDistance({ x: 0, y: 0 }, { x: 3, y: 4 }, spacing);

		expect(result).toEqual({
			value: 5,
			unit: "px",
			calibrated: false,
		});
	});
});
