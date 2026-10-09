import { describe, expect, it } from "vitest";
import {
	calculateImageDirection,
	calculatePatientOrientationDirection,
	orientDirectionInfo,
	resolveImageDirection,
} from "./image-direction";

// 患者座標系は LPS（+x=患者の左, +y=後, +z=頭）。PS3.3 C.7.6.2.1.1
describe("calculateImageDirection", () => {
	it("標準的なAxial画像は患者の右が画面左に来る", () => {
		// 標準Axial: row=[1,0,0](→患者の左), col=[0,1,0](→後)
		const result = calculateImageDirection([1, 0, 0, 0, 1, 0], "human");
		expect(result).toEqual({
			left: "R",
			right: "L",
			top: "A",
			bottom: "P",
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
		const result = calculateImageDirection([1, 0, 0, 0, 0, -1], "human");
		expect(result).toEqual({
			left: "R",
			right: "L",
			top: "H",
			bottom: "F",
		});
	});

	it("標準的なSagittal画像の方向を正しく計算する", () => {
		// 標準Sagittal: row=[0,1,0](→後), col=[0,0,-1]
		const result = calculateImageDirection([0, 1, 0, 0, 0, -1], "human");
		expect(result).toEqual({
			left: "A",
			right: "P",
			top: "H",
			bottom: "F",
		});
	});

	it("species省略時は馬体方向で計算する", () => {
		const result = calculateImageDirection([1, 0, 0, 0, 1, 0]);
		expect(result).toEqual({
			left: "Lat",
			right: "Med",
			top: "Do",
			bottom: "Pa",
		});
	});

	it("斜め方向は6軸最近傍で複合ラベルを選ぶ", () => {
		const result = calculateImageDirection(
			[0.6, 0.6, 0.529, 0, 0, -1],
			"human",
		);
		expect(result).toEqual({
			left: "RA",
			right: "LP",
			top: "H",
			bottom: "F",
		});
	});
});

describe("calculateImageDirection (equine mode)", () => {
	it("Coronal画像の馬体方向を正しく計算する", () => {
		const result = calculateImageDirection([1, 0, 0, 0, 0, -1], "equine");
		expect(result).toEqual({
			left: "Lat",
			right: "Med",
			top: "Pr",
			bottom: "Di",
		});
	});

	it("Sagittal画像の馬体方向を正しく計算する", () => {
		const result = calculateImageDirection([0, 1, 0, 0, 0, -1], "equine");
		expect(result).toEqual({
			left: "Do",
			right: "Pa",
			top: "Pr",
			bottom: "Di",
		});
	});

	it("equineモードでもnull入力・不正な配列長はnullを返す", () => {
		expect(calculateImageDirection(null, "equine")).toBeNull();
		expect(calculateImageDirection([1, 0, 0], "equine")).toBeNull();
	});

	it("斜め方向（複合cosine）の馬体方向を正しく変換する", () => {
		const result = calculateImageDirection([0.7, 0.7, 0, 0, 0, -1], "equine");
		expect(result).toEqual({
			left: "LatDo",
			right: "MedPa",
			top: "Pr",
			bottom: "Di",
		});
	});
});

describe("calculatePatientOrientationDirection", () => {
	it("BIPED の略号は反対側を補って4方向にする", () => {
		expect(
			calculatePatientOrientationDirection(
				{ row: "A", column: "FR" },
				"BIPED",
				"human",
			),
		).toEqual({ left: "P", right: "A", top: "HL", bottom: "FR" });
	});

	it("BIPED の略号を馬の用語に変換できる", () => {
		expect(
			calculatePatientOrientationDirection(
				{ row: "L", column: "F" },
				"BIPED",
				"equine",
			),
		).toEqual({ left: "Lat", right: "Med", top: "Pr", bottom: "Di" });
	});

	it("BIPED で規格外の文字があれば表示しない", () => {
		expect(
			calculatePatientOrientationDirection(
				{ row: "X", column: "F" },
				"BIPED",
				"equine",
			),
		).toBeNull();
	});

	it("QUADRUPED の肢の外内側像（行=D, 列=DI）を馬の用語で出す", () => {
		// 肢では背側の反対は掌側(前肢)か底側(後肢)のどちらかで、タグだけでは決まらない
		expect(
			calculatePatientOrientationDirection(
				{ row: "D", column: "DI" },
				"QUADRUPED",
				"equine",
			),
		).toEqual({ left: "Pa/Pl", right: "Do", top: "Pr", bottom: "Di" });
	});

	it("QUADRUPED の掌側が明示されていれば反対側は背側にする", () => {
		expect(
			calculatePatientOrientationDirection(
				{ row: "PA", column: "DI" },
				"QUADRUPED",
				"equine",
			),
		).toEqual({ left: "Do", right: "Pa", top: "Pr", bottom: "Di" });
	});

	it("QUADRUPED の体幹では背側の反対を腹側にする", () => {
		expect(
			calculatePatientOrientationDirection(
				{ row: "CR", column: "V" },
				"QUADRUPED",
				"equine",
			),
		).toEqual({ left: "Cd", right: "Cr", top: "Do", bottom: "V" });
	});

	it("QUADRUPED の複合略号（LEV）を1文字先読みで区切る", () => {
		expect(
			calculatePatientOrientationDirection(
				{ row: "LEV", column: "CD" },
				"QUADRUPED",
				"equine",
			),
		).toEqual({ left: "RtDo", right: "LeV", top: "Cr", bottom: "Cd" });
	});

	it("QUADRUPED で馬の用語を切ると DICOM の略号のまま出す", () => {
		expect(
			calculatePatientOrientationDirection(
				{ row: "L", column: "DI" },
				"QUADRUPED",
				"human",
			),
		).toEqual({ left: "M", right: "L", top: "PR", bottom: "DI" });
	});

	it("QUADRUPED で読めない略号があれば表示しない", () => {
		expect(
			calculatePatientOrientationDirection(
				{ row: "DX", column: "DI" },
				"QUADRUPED",
				"equine",
			),
		).toBeNull();
	});

	it("null は null を返す", () => {
		expect(
			calculatePatientOrientationDirection(null, "BIPED", "equine"),
		).toBeNull();
	});
});

describe("orientDirectionInfo", () => {
	const info = { top: "T", bottom: "B", left: "L", right: "R" };

	it("変換なしならそのまま", () => {
		expect(
			orientDirectionInfo(info, {
				rotation: 0,
				flipHorizontal: false,
				flipVertical: false,
			}),
		).toEqual(info);
	});

	it("右に90°回すと画像の上辺が右へ来る", () => {
		expect(
			orientDirectionInfo(info, {
				rotation: 90,
				flipHorizontal: false,
				flipVertical: false,
			}),
		).toEqual({ top: "L", right: "T", bottom: "R", left: "B" });
	});

	it("左に90°回すと画像の上辺が左へ来る", () => {
		expect(
			orientDirectionInfo(info, {
				rotation: -90,
				flipHorizontal: false,
				flipVertical: false,
			}),
		).toEqual({ top: "R", right: "B", bottom: "L", left: "T" });
	});

	it("180°回すと上下左右が入れ替わる", () => {
		expect(
			orientDirectionInfo(info, {
				rotation: 180,
				flipHorizontal: false,
				flipVertical: false,
			}),
		).toEqual({ top: "B", right: "L", bottom: "T", left: "R" });
	});

	it("左右反転で左右だけ入れ替わる", () => {
		expect(
			orientDirectionInfo(info, {
				rotation: 0,
				flipHorizontal: true,
				flipVertical: false,
			}),
		).toEqual({ top: "T", right: "L", bottom: "B", left: "R" });
	});

	it("上下反転で上下だけ入れ替わる", () => {
		expect(
			orientDirectionInfo(info, {
				rotation: 0,
				flipHorizontal: false,
				flipVertical: true,
			}),
		).toEqual({ top: "B", right: "R", bottom: "T", left: "L" });
	});

	it("90°回転中の左右反転は画面の左右で反転する", () => {
		// 描画側は「回転してから画面基準で反転」なので、回転後の左右が入れ替わる
		expect(
			orientDirectionInfo(info, {
				rotation: 90,
				flipHorizontal: true,
				flipVertical: false,
			}),
		).toEqual({ top: "L", right: "B", bottom: "R", left: "T" });
	});
});

describe("resolveImageDirection", () => {
	it("BIPED では IOP を優先する", () => {
		expect(
			resolveImageDirection(
				{
					imageOrientationPatient: [1, 0, 0, 0, 1, 0],
					patientOrientation: { row: "A", column: "F" },
					anatomicalOrientationType: "BIPED",
				},
				"human",
			),
		).toEqual({ left: "R", right: "L", top: "A", bottom: "P" });
	});

	it("IOP がなければ Patient Orientation を使う", () => {
		expect(
			resolveImageDirection(
				{
					imageOrientationPatient: null,
					patientOrientation: { row: "D", column: "DI" },
					anatomicalOrientationType: "QUADRUPED",
				},
				"equine",
			),
		).toEqual({ left: "Pa/Pl", right: "Do", top: "Pr", bottom: "Di" });
	});

	it("QUADRUPED の IOP は部位で軸の意味が変わるため推測しない", () => {
		expect(
			resolveImageDirection(
				{
					imageOrientationPatient: [1, 0, 0, 0, 1, 0],
					patientOrientation: null,
					anatomicalOrientationType: "QUADRUPED",
				},
				"equine",
			),
		).toBeNull();
	});

	it("表示の回転・反転を反映する", () => {
		expect(
			resolveImageDirection(
				{
					imageOrientationPatient: null,
					patientOrientation: { row: "D", column: "DI" },
					anatomicalOrientationType: "QUADRUPED",
				},
				"equine",
				{ rotation: 90, flipHorizontal: false, flipVertical: false },
			),
		).toEqual({ top: "Pa/Pl", right: "Pr", bottom: "Do", left: "Di" });
	});

	it("方向タグがなければ null", () => {
		expect(
			resolveImageDirection(
				{
					imageOrientationPatient: null,
					patientOrientation: null,
					anatomicalOrientationType: "BIPED",
				},
				"equine",
			),
		).toBeNull();
	});
});
