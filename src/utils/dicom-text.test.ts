import { describe, expect, it } from "vitest";
import {
	decodeDicomText,
	formatPersonName,
	formatPersonNameText,
} from "./dicom-text";

// 「ルバーノ」を Shift_JIS で表したバイト列（実際の病院装置の出力と同じ形）
const RUBANO_SJIS = [0x83, 0x8b, 0x83, 0x6f, 0x81, 0x5b, 0x83, 0x6d];
// 「磯貝」の Shift_JIS
const ISOGAI_SJIS = [0x88, 0xe9, 0x8a, 0x4c];

const ascii = (text: string) => Array.from(text, (ch) => ch.charCodeAt(0));

describe("decodeDicomText", () => {
	it("decodes Shift_JIS names even when the file declares ISO_IR 6", () => {
		const bytes = new Uint8Array([
			...RUBANO_SJIS,
			...ascii("=^ISOGAI^RUBANO="),
			...ISOGAI_SJIS,
		]);

		expect(decodeDicomText(bytes, "ISO_IR 6")).toBe(
			"ルバーノ=^ISOGAI^RUBANO=磯貝",
		);
	});

	it("decodes UTF-8 when ISO_IR 192 is declared", () => {
		const bytes = new TextEncoder().encode("ルバーノ ");

		expect(decodeDicomText(bytes, "ISO_IR 192")).toBe("ルバーノ");
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
		expect(formatPersonName("ルバーノ=^ISOGAI^RUBANO=磯貝")).toEqual({
			primary: "ルバーノ",
			all: ["ルバーノ", "ISOGAI RUBANO", "磯貝"],
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
		expect(formatPersonNameText("ルバーノ=^ISOGAI^RUBANO")).toBe(
			"ルバーノ / ISOGAI RUBANO",
		);
		expect(formatPersonNameText(null)).toBe("");
	});
});
