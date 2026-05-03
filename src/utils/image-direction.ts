// 画像方向計算（renkeibox ImageDirection.ts 移植）
// direction cosinesから6軸方向マーカーを生成
import type { ImageDirectionInfo } from "@/types/overlay";

export type Species = "human" | "equine";

// 人体方向 → 馬体方向の変換テーブル
// R→Lateral, L→Medial, A→Dorsal, P→Palmar, H→Proximal, F→Distal
const EQUINE_DIRECTION_MAP: Record<string, string> = {
	R: "Lat",
	L: "Med",
	A: "Do", // Dorsal (肢部前面)
	P: "Pa", // Palmar (前肢後面) / Plantar (後肢後面)
	H: "Pr", // Proximal (近位)
	F: "Di", // Distal (遠位)
};

// 人体方向文字列を馬体方向に変換
// 例: "RA" → "LatDo", "PH" → "PaPr"
const translateToEquine = (humanDirection: string): string => {
	let result = "";
	for (const char of humanDirection) {
		result += EQUINE_DIRECTION_MAP[char] ?? char;
	}
	return result;
};

type UnitVector = readonly [number, number, number];

const UNIT_VECTORS: UnitVector[] = [
	[1, 0, 0],
	[0, 1, 0],
	[0, 0, 1],
	[-1, 0, 0],
	[0, -1, 0],
	[0, 0, -1],
	[0.7, 0.7, 0],
	[0.7, 0, 0.7],
	[0, 0.7, 0.7],
	[-0.7, -0.7, 0],
	[-0.7, 0, -0.7],
	[0, -0.7, -0.7],
	[-0.7, 0.7, 0],
	[-0.7, 0, 0.7],
	[0, -0.7, 0.7],
	[0.7, -0.7, 0],
	[0.7, 0, -0.7],
	[0, 0.7, -0.7],
];

const getNearestAxis = (l: number, p: number, h: number): UnitVector => {
	let maxProduct = 0;
	let result: UnitVector = [0, 0, 0];
	for (const vec of UNIT_VECTORS) {
		const product = l * vec[0] + p * vec[1] + h * vec[2];
		if (product > maxProduct) {
			maxProduct = product;
			result = vec;
		}
	}
	return result;
};

// 3つのcosine値から方向文字列を構築
const getDirectionString = (
	rowCosX: number,
	rowCosY: number,
	rowCosZ: number,
): string => {
	const nearestAxis = getNearestAxis(rowCosX, rowCosY, rowCosZ);
	let result = "";
	// R/L: 右/左 (X軸)
	if (nearestAxis[0] > 0) result += "R";
	if (nearestAxis[0] < 0) result += "L";
	// A/P: 前/後 (Y軸)
	if (nearestAxis[1] > 0) result += "A";
	if (nearestAxis[1] < 0) result += "P";
	// H/F: 頭/足 (Z軸)
	if (nearestAxis[2] > 0) result += "H";
	if (nearestAxis[2] < 0) result += "F";
	return result;
};

// ImageOrientationPatient (0020,0037) から4方向マーカーを計算
// species: "human" はR/L/A/P/H/F、"equine" (default) はLat/Med/Do/Pa/Pr/Di
export const calculateImageDirection = (
	imageOrientationPatient: number[] | null,
	species: Species = "equine",
): ImageDirectionInfo | null => {
	if (!imageOrientationPatient || imageOrientationPatient.length !== 6) {
		return null;
	}

	const [rowCosX, rowCosY, rowCosZ, colCosX, colCosY, colCosZ] =
		imageOrientationPatient;

	if (
		rowCosX === undefined ||
		rowCosY === undefined ||
		rowCosZ === undefined ||
		colCosX === undefined ||
		colCosY === undefined ||
		colCosZ === undefined
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

	const result = {
		left: rowOpposite,
		right: rowDirection,
		top: colOpposite,
		bottom: colDirection,
	};

	if (species === "equine") {
		return {
			left: translateToEquine(result.left),
			right: translateToEquine(result.right),
			top: translateToEquine(result.top),
			bottom: translateToEquine(result.bottom),
		};
	}

	return result;
};
