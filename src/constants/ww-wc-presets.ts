// 臨床用WW/WCプリセット定義
export type PresetCategory = "clinical" | "equine";

export type WwWcPreset = {
	label: string;
	key: string;
	ww: number;
	wc: number;
	category: PresetCategory;
};

// ヒト臨床プリセット
const CLINICAL_PRESETS: WwWcPreset[] = [
	{ label: "肺", key: "lung", ww: 1500, wc: -600, category: "clinical" },
	{ label: "骨", key: "bone", ww: 2000, wc: 400, category: "clinical" },
	{ label: "脳", key: "brain", ww: 80, wc: 40, category: "clinical" },
	{ label: "軟部組織", key: "soft", ww: 400, wc: 40, category: "clinical" },
	{ label: "縦隔", key: "mediastinum", ww: 350, wc: 50, category: "clinical" },
	{ label: "腹部", key: "abdomen", ww: 400, wc: 60, category: "clinical" },
	{ label: "肝臓", key: "liver", ww: 150, wc: 30, category: "clinical" },
];

// 馬用プリセット（獣医学X線検査向け）
const EQUINE_PRESETS: WwWcPreset[] = [
	{
		label: "馬・骨",
		key: "equine_bone",
		ww: 2500,
		wc: 500,
		category: "equine",
	},
	{
		label: "馬・軟部",
		key: "equine_soft",
		ww: 350,
		wc: 50,
		category: "equine",
	},
	{ label: "蹄骨", key: "equine_hoof", ww: 3000, wc: 800, category: "equine" },
	{
		label: "舟状骨",
		key: "equine_navicular",
		ww: 2000,
		wc: 600,
		category: "equine",
	},
	{
		label: "馬・肺",
		key: "equine_lung",
		ww: 1500,
		wc: -500,
		category: "equine",
	},
	{
		label: "馬・腹部",
		key: "equine_abdomen",
		ww: 450,
		wc: 50,
		category: "equine",
	},
];

export const WW_WC_PRESETS: WwWcPreset[] = [
	...CLINICAL_PRESETS,
	...EQUINE_PRESETS,
];

export const CLINICAL_WW_WC_PRESETS = CLINICAL_PRESETS;
export const EQUINE_WW_WC_PRESETS = EQUINE_PRESETS;
