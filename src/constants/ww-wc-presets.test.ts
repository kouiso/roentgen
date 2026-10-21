import { describe, expect, it } from "vitest";
import { WW_WC_PRESETS } from "./ww-wc-presets";

describe("WW/WC presets", () => {
	it("lists the six equine presets in number-key order", () => {
		expect(WW_WC_PRESETS.map((p) => p.label)).toEqual([
			"馬・骨",
			"馬・軟部",
			"蹄骨",
			"舟状骨",
			"馬・肺",
			"馬・腹部",
		]);
	});

	it("does not include human CT presets", () => {
		const labels = WW_WC_PRESETS.map((p) => p.label);
		for (const human of [
			"肺",
			"脳",
			"縦隔",
			"肝臓",
			"軟部組織",
			"腹部",
			"骨",
		]) {
			expect(labels).not.toContain(human);
		}
	});

	it("every preset has required fields", () => {
		for (const preset of WW_WC_PRESETS) {
			expect(preset.label).toBeTruthy();
			expect(preset.key).toBeTruthy();
			expect(typeof preset.ww).toBe("number");
			expect(typeof preset.wc).toBe("number");
		}
	});

	it("no duplicate keys across all presets", () => {
		const keys = WW_WC_PRESETS.map((p) => p.key);
		expect(new Set(keys).size).toBe(keys.length);
	});

	it("all WW values are positive", () => {
		for (const preset of WW_WC_PRESETS) {
			expect(preset.ww).toBeGreaterThan(0);
		}
	});
});
