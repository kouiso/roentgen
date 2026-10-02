// 「明るさ」「くっきり」スライダー（-100〜100）と WW/WC の相互変換
// 基準は最初に表示した明るさ。0 なら基準どおり、両端で基準から大きく外れる。

const clamp = (value: number) => Math.max(-100, Math.min(100, value));

// 明るくする = 表示窓の中心を下げる。±100 で基準 WW の半分だけ動かす
export const brightnessFromWindow = (
	wc: number,
	baseWC: number,
	baseWW: number,
): number => clamp(((baseWC - wc) / (baseWW / 2)) * 100);

export const windowCenterFromBrightness = (
	brightness: number,
	baseWC: number,
	baseWW: number,
): number => baseWC - (clamp(brightness) / 100) * (baseWW / 2);

// くっきり = 表示窓を狭める。±100 で基準 WW の 1/4〜4 倍
export const contrastFromWindow = (ww: number, baseWW: number): number =>
	ww > 0 && baseWW > 0 ? clamp(-50 * Math.log2(ww / baseWW)) : 0;

export const windowWidthFromContrast = (
	contrast: number,
	baseWW: number,
): number => Math.max(1, baseWW * 2 ** (-clamp(contrast) / 50));
