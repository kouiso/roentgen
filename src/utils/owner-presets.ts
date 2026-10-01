// 飼い主向けの「見たい部分で選ぶ」プリセット
// 臨床用プリセットの WW/WC は CT の HU を前提にした絶対値で、装置ごとに画素値の
// 範囲が違う一般撮影（DX/CR）では真っ白・真っ黒になりやすい。
// そこで、その画像を「おまかせ」で見やすくした窓を基準に、部位ごとに
// どの濃さの帯を広げて見せるかを相対値で決める。

import type { DisplayWindow } from "./auto-window";

export type OwnerPresetKey =
	| "bone"
	| "soft"
	| "hoof"
	| "navicular"
	| "chest"
	| "abdomen";

export type OwnerPreset = {
	key: OwnerPresetKey;
	label: string;
	hint: string;
	// 基準 WW に掛ける倍率。小さいほどコントラストが強い
	widthScale: number;
	// 中心をどれだけ「白く写る側（骨・金属側）」へ寄せるか。基準 WW に対する比率
	centerShift: number;
};

export const OWNER_PRESETS: OwnerPreset[] = [
	{
		key: "bone",
		label: "骨",
		hint: "骨の輪郭をくっきり",
		widthScale: 0.6,
		centerShift: 0.2,
	},
	{
		key: "soft",
		label: "腱・筋肉",
		hint: "やわらかい部分",
		widthScale: 0.5,
		centerShift: -0.2,
	},
	{
		key: "hoof",
		label: "蹄",
		hint: "蹄の中の骨",
		widthScale: 0.7,
		centerShift: 0.1,
	},
	{
		key: "navicular",
		label: "蹄の奥",
		hint: "舟状骨のまわり",
		widthScale: 0.45,
		centerShift: 0.25,
	},
	{
		key: "chest",
		label: "胸",
		hint: "肺のまわり",
		widthScale: 0.8,
		centerShift: -0.25,
	},
	{
		key: "abdomen",
		label: "お腹",
		hint: "腹部",
		widthScale: 0.55,
		centerShift: 0,
	},
];

// MONOCHROME1 は画素値が大きいほど黒く写るため、「白く写る側」は値が小さい方向になる
export const ownerPresetWindow = (
	preset: OwnerPreset,
	base: DisplayWindow,
	photometricInterpretation?: string,
): DisplayWindow => {
	const brightSide = photometricInterpretation === "MONOCHROME1" ? -1 : 1;
	return {
		ww: Math.max(1, base.ww * preset.widthScale),
		wc: base.wc + brightSide * preset.centerShift * base.ww,
	};
};
