// 数値付き WW/WC プリセット。並び順が数字キー 1〜6 の割り当てになる
export type WwWcPreset = {
	label: string;
	key: string;
	ww: number;
	wc: number;
};

// 人の CT 用（肺・脳・縦隔など）は馬の X 線では使わない。先頭に並ぶと数字キーまで
// 人用になっていたため持たない
export const WW_WC_PRESETS: WwWcPreset[] = [
	{ label: "馬・骨", key: "equine_bone", ww: 2500, wc: 500 },
	{ label: "馬・軟部", key: "equine_soft", ww: 350, wc: 50 },
	{ label: "蹄骨", key: "equine_hoof", ww: 3000, wc: 800 },
	{ label: "舟状骨", key: "equine_navicular", ww: 2000, wc: 600 },
	{ label: "馬・肺", key: "equine_lung", ww: 1500, wc: -500 },
	{ label: "馬・腹部", key: "equine_abdomen", ww: 450, wc: 50 },
];
