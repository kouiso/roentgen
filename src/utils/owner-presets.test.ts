import { describe, expect, it } from "vitest";
import { OWNER_PRESETS, ownerPresetWindow } from "./owner-presets";

const findPreset = (key: string) => {
	const preset = OWNER_PRESETS.find((p) => p.key === key);
	if (!preset) throw new Error(`preset ${key} not found`);
	return preset;
};

describe("ownerPresetWindow", () => {
	// 14bit 一般撮影の実データ相当（おまかせ窓）
	const base = { ww: 10914, wc: 7813 };

	it("stays inside the image's own pixel range instead of using CT-style absolute values", () => {
		for (const preset of OWNER_PRESETS) {
			const { ww, wc } = ownerPresetWindow(preset, base, "MONOCHROME2");
			expect(ww).toBeGreaterThan(0);
			expect(ww).toBeLessThanOrEqual(base.ww);
			// 窓の中心が元の窓の範囲内にあれば、真っ白・真っ黒にはならない
			expect(wc).toBeGreaterThan(base.wc - base.ww / 2);
			expect(wc).toBeLessThan(base.wc + base.ww / 2);
		}
	});

	it("moves the bone window toward bright pixels for MONOCHROME2", () => {
		const bone = ownerPresetWindow(findPreset("bone"), base, "MONOCHROME2");

		expect(bone.wc).toBeGreaterThan(base.wc);
		expect(bone.ww).toBeLessThan(base.ww);
	});

	it("flips the shift for MONOCHROME1 where high values are dark", () => {
		const bone = ownerPresetWindow(findPreset("bone"), base, "MONOCHROME1");
		const soft = ownerPresetWindow(findPreset("soft"), base, "MONOCHROME1");

		expect(bone.wc).toBeLessThan(base.wc);
		expect(soft.wc).toBeGreaterThan(base.wc);
	});

	it("keeps preset keys unique", () => {
		const keys = OWNER_PRESETS.map((p) => p.key);
		expect(new Set(keys).size).toBe(keys.length);
	});
});
