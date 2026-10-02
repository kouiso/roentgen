import { describe, expect, it } from "vitest";
import { computeAutoWindow, isUninformativeWindow } from "./auto-window";

describe("computeAutoWindow", () => {
	it("ignores the darkest and brightest outliers", () => {
		// 本体は 1000〜2000 に集中し、両端に 1% ずつ極端な画素がある
		const pixels: number[] = [];
		for (let i = 0; i < 98; i++) pixels.push(1000 + (i * 1000) / 97);
		pixels.push(0, 16383);

		const { ww, wc } = computeAutoWindow(pixels, 0, 16383);

		expect(ww).toBeGreaterThan(800);
		expect(ww).toBeLessThan(1200);
		expect(wc).toBeGreaterThan(1300);
		expect(wc).toBeLessThan(1700);
	});

	it("ignores collimated black and saturated white pixels", () => {
		// 照射野外の 0 と飽和した最大値が大量にあっても、実際の像の範囲だけで決める
		const pixels: number[] = [];
		for (let i = 0; i < 100; i++) pixels.push(4000 + i * 40);
		for (let i = 0; i < 30; i++) pixels.push(0, 16383);

		const { ww, wc } = computeAutoWindow(pixels, 0, 16383);

		expect(ww).toBeLessThan(4500);
		expect(wc).toBeGreaterThan(5500);
		expect(wc).toBeLessThan(6500);
	});

	it("falls back to the full range when pixels are flat or empty", () => {
		expect(computeAutoWindow([], 0, 4095)).toEqual({ ww: 4095, wc: 2047.5 });
		expect(computeAutoWindow([5, 5], 5, 5)).toEqual({ ww: 1, wc: 5 });
	});
});

describe("isUninformativeWindow", () => {
	it("treats a window covering the whole pixel range as uninformative", () => {
		expect(isUninformativeWindow(16383, 0, 16383)).toBe(true);
		expect(isUninformativeWindow(20000, 0, 16383)).toBe(true);
	});

	it("keeps windows that actually clip the pixel range", () => {
		expect(isUninformativeWindow(3900, 0, 4095)).toBe(false);
		expect(isUninformativeWindow(400, 0, 4095)).toBe(false);
	});

	it("treats missing or invalid widths as uninformative", () => {
		expect(isUninformativeWindow(0, 0, 4095)).toBe(true);
		expect(isUninformativeWindow(Number.NaN, 0, 4095)).toBe(true);
	});
});
