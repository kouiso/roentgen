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

	it("species='human'を明示しても既存動作と同じ", () => {
		const result = calculateImageDirection([1, 0, 0, 0, 1, 0], "human");
		expect(result).toEqual({
			left: "L",
			right: "R",
			top: "P",
			bottom: "A",
		});
	});
});

describe("calculateImageDirection (equine mode)", () => {
	it("Axial画像の馬体方向を正しく計算する", () => {
		// 標準Axial: row=[1,0,0], col=[0,1,0]
		// Human: left=L, right=R, top=P, bottom=A
		// Equine: left=Med, right=Lat, top=Pa, bottom=Do
		const result = calculateImageDirection([1, 0, 0, 0, 1, 0], "equine");
		expect(result).toEqual({
			left: "Med",
			right: "Lat",
			top: "Pa",
			bottom: "Do",
		});
	});

	it("Coronal画像の馬体方向を正しく計算する", () => {
		// 標準Coronal: row=[1,0,0], col=[0,0,-1]
		// Human: left=L, right=R, top=H, bottom=F
		// Equine: left=Med, right=Lat, top=Pr, bottom=Di
		const result = calculateImageDirection([1, 0, 0, 0, 0, -1], "equine");
		expect(result).toEqual({
			left: "Med",
			right: "Lat",
			top: "Pr",
			bottom: "Di",
		});
	});

	it("Sagittal画像の馬体方向を正しく計算する", () => {
		// 標準Sagittal: row=[0,1,0], col=[0,0,-1]
		// Human: left=P, right=A, top=H, bottom=F
		// Equine: left=Pa, right=Do, top=Pr, bottom=Di
		const result = calculateImageDirection([0, 1, 0, 0, 0, -1], "equine");
		expect(result).toEqual({
			left: "Pa",
			right: "Do",
			top: "Pr",
			bottom: "Di",
		});
	});

	it("equineモードでもnull入力はnullを返す", () => {
		expect(calculateImageDirection(null, "equine")).toBeNull();
	});

	it("equineモードでも不正な配列長はnullを返す", () => {
		expect(calculateImageDirection([1, 0, 0], "equine")).toBeNull();
	});

	it("斜め方向（複合cosine）の馬体方向を正しく変換する", () => {
		// row=[0.7, 0.7, 0], col=[0, 0, -1]
		// Human: right="RA", left="LP", top="H", bottom="F"
		// Equine: right="LatDo", left="MedPa", top="Pr", bottom="Di"
		const result = calculateImageDirection([0.7, 0.7, 0, 0, 0, -1], "equine");
		expect(result).toEqual({
			left: "MedPa",
			right: "LatDo",
			top: "Pr",
			bottom: "Di",
		});
	});
});
