// 画像方向計算（renkeibox ImageDirection.ts 移植）
// direction cosinesから6軸方向マーカーを生成
import type { ImageDirectionInfo } from "@/types/overlay";

// direction cosine値から方向文字を取得
const getDirectionChar = (cosine: number, positive: string, negative: string): string => {
	const threshold = 0.0001;
	if (Math.abs(cosine) < threshold) return "";
	return cosine > 0 ? positive : negative;
};

// 3つのcosine値から方向文字列を構築
const getDirectionString = (
	rowCosX: number,
	rowCosY: number,
	rowCosZ: number,
): string => {
	let result = "";
	// R/L: 右/左 (X軸)
	result += getDirectionChar(rowCosX, "R", "L");
	// A/P: 前/後 (Y軸)
	result += getDirectionChar(rowCosY, "A", "P");
	// H/F: 頭/足 (Z軸)
	result += getDirectionChar(rowCosZ, "H", "F");
	return result;
};

// ImageOrientationPatient (0020,0037) から4方向マーカーを計算
export const calculateImageDirection = (
	imageOrientationPatient: number[] | null,
): ImageDirectionInfo | null => {
	if (!imageOrientationPatient || imageOrientationPatient.length !== 6) {
		return null;
	}

	const [rowCosX, rowCosY, rowCosZ, colCosX, colCosY, colCosZ] =
		imageOrientationPatient;

	if (
		rowCosX === undefined || rowCosY === undefined || rowCosZ === undefined ||
		colCosX === undefined || colCosY === undefined || colCosZ === undefined
	) {
		return null;
	}

	// 行方向（左→右）
	const rowDirection = getDirectionString(rowCosX, rowCosY, rowCosZ);
	// 列方向（上→下）
	const colDirection = getDirectionString(colCosX, colCosY, colCosZ);

	// 反転方向
	const rowOpposite = getDirectionString(-rowCosX, -rowCosY, -rowCosZ);
	const colOpposite = getDirectionString(-colCosX, -colCosY, -colCosZ);

	return {
		left: rowOpposite,
		right: rowDirection,
		top: colOpposite,
		bottom: colDirection,
	};
};
