// 明るさ・コントラストの「おまかせ」計算
// 撮影装置が付ける WW/WC は画素の全レンジをそのまま指定していることが多く、
// その場合は全体が灰色に眠い画像になる。骨や蹄の輪郭が見えるように、
// 実際の画素分布の 5〜95% だけを白黒に割り当てる。
// 照射野の外（最小値に張り付いた黒）や飽和した白（最大値に張り付いた画素）は
// 骨や軟部の見え方と関係ないので、分布の計算から外す。

export type DisplayWindow = { ww: number; wc: number };

const HIST_SIZE = 4096;
const LOW_PERCENTILE = 0.05;
const HIGH_PERCENTILE = 0.95;

export const computeAutoWindow = (
	pixels: ArrayLike<number>,
	minPixelValue: number,
	maxPixelValue: number,
): DisplayWindow => {
	const fullRange = maxPixelValue - minPixelValue;
	if (pixels.length === 0 || fullRange <= 0) {
		return {
			ww: Math.max(1, fullRange),
			wc: (minPixelValue + maxPixelValue) / 2,
		};
	}

	const hist = new Uint32Array(HIST_SIZE);
	const scale = (HIST_SIZE - 1) / fullRange;
	let total = 0;
	for (let i = 0; i < pixels.length; i++) {
		const value = pixels[i] ?? 0;
		// NaN/±Infinity は比較をすり抜けて total だけを水増しし、
		// パーセンタイルに届かなくなるため明示的に外す
		if (!Number.isFinite(value)) continue;
		if (value <= minPixelValue || value >= maxPixelValue) continue;
		const bin = Math.min(
			HIST_SIZE - 1,
			Math.max(0, Math.round((value - minPixelValue) * scale)),
		);
		hist[bin] = (hist[bin] ?? 0) + 1;
		total++;
	}
	// 中間の画素がほとんど無い（2 値画像など）なら全レンジをそのまま使う
	if (total === 0) {
		return { ww: fullRange, wc: (minPixelValue + maxPixelValue) / 2 };
	}

	let cumulative = 0;
	let low: number | null = null;
	let high = maxPixelValue;
	for (let i = 0; i < HIST_SIZE; i++) {
		cumulative += hist[i] ?? 0;
		if (low === null && cumulative >= total * LOW_PERCENTILE) {
			low = minPixelValue + i / scale;
		}
		if (cumulative >= total * HIGH_PERCENTILE) {
			high = minPixelValue + i / scale;
			break;
		}
	}
	const lower = low ?? minPixelValue;
	return { ww: Math.max(1, high - lower), wc: (lower + high) / 2 };
};

// 装置指定の WW が実画素レンジ以上なら、何もクリップしない＝見やすさに寄与しない指定とみなす
export const isUninformativeWindow = (
	ww: number,
	minPixelValue: number,
	maxPixelValue: number,
): boolean => {
	if (!Number.isFinite(ww) || ww <= 0) return true;
	const range = maxPixelValue - minPixelValue;
	return range > 0 && ww >= range;
};
