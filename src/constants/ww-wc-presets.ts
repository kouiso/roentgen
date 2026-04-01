// 臨床用WW/WCプリセット定義
export const WW_WC_PRESETS = [
	{ label: "肺", key: "lung", ww: 1500, wc: -600 },
	{ label: "骨", key: "bone", ww: 2000, wc: 400 },
	{ label: "脳", key: "brain", ww: 80, wc: 40 },
	{ label: "軟部組織", key: "soft", ww: 400, wc: 40 },
	{ label: "縦隔", key: "mediastinum", ww: 350, wc: 50 },
	{ label: "腹部", key: "abdomen", ww: 400, wc: 60 },
	{ label: "肝臓", key: "liver", ww: 150, wc: 30 },
] as const;

export type WwWcPreset = (typeof WW_WC_PRESETS)[number];
