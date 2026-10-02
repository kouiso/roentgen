import { describe, expect, it } from "vitest";
import {
	brightnessFromWindow,
	contrastFromWindow,
	windowCenterFromBrightness,
	windowWidthFromContrast,
} from "./simple-window";

describe("simple-window sliders", () => {
	const baseWW = 1000;
	const baseWC = 1500;

	it("maps the initial window to the slider midpoints", () => {
		expect(brightnessFromWindow(baseWC, baseWC, baseWW)).toBeCloseTo(0);
		expect(contrastFromWindow(baseWW, baseWW)).toBeCloseTo(0);
	});

	it("round-trips brightness and contrast values", () => {
		for (const value of [-100, -40, 0, 25, 100]) {
			const wc = windowCenterFromBrightness(value, baseWC, baseWW);
			const ww = windowWidthFromContrast(value, baseWW);
			expect(brightnessFromWindow(wc, baseWC, baseWW)).toBeCloseTo(value);
			expect(contrastFromWindow(ww, baseWW)).toBeCloseTo(value);
		}
	});

	it("brightens by lowering the window center and sharpens by narrowing the width", () => {
		expect(windowCenterFromBrightness(50, baseWC, baseWW)).toBeLessThan(baseWC);
		expect(windowWidthFromContrast(50, baseWW)).toBeLessThan(baseWW);
	});

	it("clamps slider values to ±100", () => {
		expect(brightnessFromWindow(-1e6, baseWC, baseWW)).toBe(100);
		expect(contrastFromWindow(1e-6, baseWW)).toBe(100);
		expect(windowWidthFromContrast(500, baseWW)).toBe(250);
	});
});
