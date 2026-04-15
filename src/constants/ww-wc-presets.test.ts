import { describe, expect, it } from "vitest";
import {
	CLINICAL_WW_WC_PRESETS,
	EQUINE_WW_WC_PRESETS,
	WW_WC_PRESETS,
} from "./ww-wc-presets";

describe("WW/WC presets", () => {
	it("clinical presets array is non-empty", () => {
		expect(CLINICAL_WW_WC_PRESETS.length).toBeGreaterThan(0);
	});

	it("equine presets array is non-empty", () => {
		expect(EQUINE_WW_WC_PRESETS.length).toBeGreaterThan(0);
	});

	it("combined array contains all clinical and equine presets", () => {
		expect(WW_WC_PRESETS.length).toBe(
			CLINICAL_WW_WC_PRESETS.length + EQUINE_WW_WC_PRESETS.length,
		);
	});

	it("every preset has required fields", () => {
		for (const preset of WW_WC_PRESETS) {
			expect(preset.label).toBeTruthy();
			expect(preset.key).toBeTruthy();
			expect(typeof preset.ww).toBe("number");
			expect(typeof preset.wc).toBe("number");
			expect(preset.category).toBeTruthy();
		}
	});

	it("no duplicate keys across all presets", () => {
		const keys = WW_WC_PRESETS.map((p) => p.key);
		const unique = new Set(keys);
		expect(unique.size).toBe(keys.length);
	});

	it("all WW values are positive", () => {
		for (const preset of WW_WC_PRESETS) {
			expect(preset.ww).toBeGreaterThan(0);
		}
	});

	it("category is either clinical or equine", () => {
		for (const preset of WW_WC_PRESETS) {
			expect(["clinical", "equine"]).toContain(preset.category);
		}
	});

	it("clinical presets all have category=clinical", () => {
		for (const preset of CLINICAL_WW_WC_PRESETS) {
			expect(preset.category).toBe("clinical");
		}
	});

	it("equine presets all have category=equine", () => {
		for (const preset of EQUINE_WW_WC_PRESETS) {
			expect(preset.category).toBe("equine");
		}
	});
});
