import { describe, expect, it } from "vitest";
import { calculateImageDirection } from "./image-direction";

describe("calculateImageDirection", () => {
	it("標準的なAxial画像の方向を正しく計算する", () => {
		// 標準Axial: row=[1,0,0], col=[0,1,0]
		const result = calculateImageDirection([1, 0, 0, 0, 1, 0]);
		expect(result).toEqual({
			left: "L",
			right: "R",
			top: "P",
			bottom: "A",
		});
	});

	it("nullが渡された場合nullを返す", () => {
		expect(calculateImageDirection(null)).toBeNull();
	});

	it("配列長が6でない場合nullを返す", () => {
		expect(calculateImageDirection([1, 0, 0])).toBeNull();
	});

	it("空配列の場合nullを返す", () => {
		expect(calculateImageDirection([])).toBeNull();
	});

	it("標準的なCoronal画像の方向を正しく計算する", () => {
		// 標準Coronal: row=[1,0,0], col=[0,0,-1]
		const result = calculateImageDirection([1, 0, 0, 0, 0, -1]);
		expect(result).toEqual({
			left: "L",
			right: "R",
			top: "H",
			bottom: "F",
		});
	});

	it("標準的なSagittal画像の方向を正しく計算する", () => {
		// 標準Sagittal: row=[0,1,0], col=[0,0,-1]
		const result = calculateImageDirection([0, 1, 0, 0, 0, -1]);
		expect(result).toEqual({
			left: "P",
			right: "A",
			top: "H",
			bottom: "F",
		});
	});
});
