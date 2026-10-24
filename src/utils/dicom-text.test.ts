import { describe, expect, it } from "vitest";
import {
	decodeDicomText,
	formatPersonName,
	formatPersonNameText,
} from "./dicom-text";

// 実在の馬・所有者と無関係な合成名で、日本語と PN グループの文字化けを検出する。
// 「テスト馬」の Shift_JIS
const TEST_HORSE_SJIS = [0x83, 0x65, 0x83, 0x58, 0x83, 0x67, 0x94, 0x6e];
// 「試験」の Shift_JIS（合成の所有者名）
const TEST_OWNER_SJIS = [0x8e, 0x8e, 0x8c, 0xb1];

const ascii = (text: string) => Array.from(text, (ch) => ch.charCodeAt(0));

describe("decodeDicomText", () => {
	it("decodes Shift_JIS names even when the file declares ISO_IR 6", () => {
		const bytes = new Uint8Array([
			...TEST_HORSE_SJIS,
			...ascii("=^SYNTHETIC^TESTHORSE="),
			...TEST_OWNER_SJIS,
		]);

		expect(decodeDicomText(bytes, "ISO_IR 6")).toBe(
			"テスト馬=^SYNTHETIC^TESTHORSE=試験",
		);
	});

	it("decodes UTF-8 when ISO_IR 192 is declared", () => {
		const bytes = new TextEncoder().encode("テスト馬 ");

		expect(decodeDicomText(bytes, "ISO_IR 192")).toBe("テスト馬");
	});

	it("keeps plain ASCII and strips DICOM padding", () => {
		const bytes = new Uint8Array([...ascii("HORSE^TARO"), 0x20, 0x00]);

		expect(decodeDicomText(bytes)).toBe("HORSE^TARO");
	});

	it("uses Latin-1 style decoding when a Latin charset is declared", () => {
		const bytes = new Uint8Array([...ascii("Ren"), 0xe9]);

		expect(decodeDicomText(bytes, "ISO_IR 100")).toBe("René");
	});
});

describe("formatPersonName", () => {
	it("returns the first readable group and drops duplicates", () => {
		expect(formatPersonName("テスト馬=^SYNTHETIC^TESTHORSE=試験")).toEqual({
			primary: "テスト馬",
			all: ["テスト馬", "SYNTHETIC TESTHORSE", "試験"],
		});
		expect(formatPersonName("TARO^HORSE=TARO^HORSE")).toEqual({
			primary: "TARO HORSE",
			all: ["TARO HORSE"],
		});
	});

	it("returns null for empty names", () => {
		expect(formatPersonName("")).toBeNull();
		expect(formatPersonName("^^=")).toBeNull();
		expect(formatPersonName(undefined)).toBeNull();
	});

	it("joins all groups for printing", () => {
		expect(formatPersonNameText("テスト馬=^SYNTHETIC^TESTHORSE")).toBe(
			"テスト馬 / SYNTHETIC TESTHORSE",
		);
		expect(formatPersonNameText(null)).toBe("");
	});
});
