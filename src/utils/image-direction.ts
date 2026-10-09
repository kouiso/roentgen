// 画像方向計算
// 画像の上下左右の辺が動物のどちら側を向いているかを求める
import type {
	AnatomicalOrientationType,
	DicomFileInfo,
	PatientOrientation,
} from "@/types/dicom";
import type { ImageDirectionInfo } from "@/types/overlay";
import { createImageGeometry, getImageToDisplayMatrix } from "./image-geometry";

// "equine" は馬の用語、"human" は DICOM の略号をそのまま出す
export type Species = "human" | "equine";

export type DirectionViewTransform = {
	rotation: number;
	flipHorizontal: boolean;
	flipVertical: boolean;
};

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

const BIPED_OPPOSITE: Record<string, string> = {
	A: "P",
	P: "A",
	R: "L",
	L: "R",
	H: "F",
	F: "H",
};

// 掌側(前肢)か底側(後肢)かは Patient Orientation だけでは決まらないため両方を示す
const PALMAR_OR_PLANTAR = "PA/PL";

// PS3.3 C.7.6.1.1.1 の四足動物用略号と、馬の用語での表示
const QUADRUPED_LABELS: Record<string, string> = {
	LE: "Le",
	RT: "Rt",
	D: "Do",
	V: "V",
	CR: "Cr",
	CD: "Cd",
	R: "Ro",
	M: "Med",
	L: "Lat",
	PR: "Pr",
	DI: "Di",
	PA: "Pa",
	PL: "Pl",
	[PALMAR_OR_PLANTAR]: "Pa/Pl",
};

// 規格どおり左から1文字先読みで区切れるよう、2文字の略号を先に試す
const QUADRUPED_TWO_LETTER = ["LE", "RT", "CR", "CD", "PR", "DI", "PA", "PL"];
const QUADRUPED_ONE_LETTER = ["D", "V", "R", "M", "L"];

// D(背側)の反対は体幹では V、遠位肢では掌側/底側になる。肢でしか使わない略号で判別する
const LIMB_TOKENS = new Set(["PR", "DI", "PA", "PL", "M", "L"]);

const tokenizeQuadruped = (value: string): string[] | null => {
	const tokens: string[] = [];
	let index = 0;
	while (index < value.length) {
		const pair = value.slice(index, index + 2);
		if (QUADRUPED_TWO_LETTER.includes(pair)) {
			tokens.push(pair);
			index += 2;
			continue;
		}
		const single = value.charAt(index);
		if (!QUADRUPED_ONE_LETTER.includes(single)) return null;
		tokens.push(single);
		index += 1;
	}
	return tokens.length > 0 ? tokens : null;
};

const getQuadrupedOpposite = (token: string, isLimb: boolean): string => {
	switch (token) {
		case "LE":
			return "RT";
		case "RT":
			return "LE";
		case "D":
			return isLimb ? PALMAR_OR_PLANTAR : "V";
		case "V":
			return "D";
		case "CR":
			return "CD";
		case "CD":
			return "CR";
		case "R":
			return "CD";
		case "M":
			return "L";
		case "L":
			return "M";
		case "PR":
			return "DI";
		case "DI":
			return "PR";
		case "PA":
		case "PL":
			return "D";
		default:
			return token;
	}
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

// 患者座標系は LPS（+x=患者の左, +y=背側(後), +z=頭側）。PS3.3 C.7.6.2.1.1
const getDirectionString = (
	cosX: number,
	cosY: number,
	cosZ: number,
): string => {
	const nearestAxis = getNearestAxis(cosX, cosY, cosZ);
	let result = "";
	if (nearestAxis[0] > 0) result += "L";
	if (nearestAxis[0] < 0) result += "R";
	if (nearestAxis[1] > 0) result += "P";
	if (nearestAxis[1] < 0) result += "A";
	if (nearestAxis[2] > 0) result += "H";
	if (nearestAxis[2] < 0) result += "F";
	return result;
};

const translateBiped = (
	info: ImageDirectionInfo,
	species: Species,
): ImageDirectionInfo =>
	species === "equine"
		? {
				left: translateToEquine(info.left),
				right: translateToEquine(info.right),
				top: translateToEquine(info.top),
				bottom: translateToEquine(info.bottom),
			}
		: info;

// ImageOrientationPatient (0020,0037) から4方向マーカーを計算
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

	return translateBiped(
		{
			left: getDirectionString(-rowCosX, -rowCosY, -rowCosZ),
			right: getDirectionString(rowCosX, rowCosY, rowCosZ),
			top: getDirectionString(-colCosX, -colCosY, -colCosZ),
			bottom: getDirectionString(colCosX, colCosY, colCosZ),
		},
		species,
	);
};

const BIPED_VALUE_PATTERN = /^[APRLHF]+$/;

const oppositeBiped = (value: string): string =>
	[...value].map((char) => BIPED_OPPOSITE[char] ?? char).join("");

// Patient Orientation (0020,0020) から4方向マーカーを計算
export const calculatePatientOrientationDirection = (
	patientOrientation: PatientOrientation | null,
	anatomicalOrientationType: AnatomicalOrientationType,
	species: Species = "equine",
): ImageDirectionInfo | null => {
	if (!patientOrientation) return null;
	const { row, column } = patientOrientation;

	if (anatomicalOrientationType === "BIPED") {
		if (!BIPED_VALUE_PATTERN.test(row) || !BIPED_VALUE_PATTERN.test(column)) {
			return null;
		}
		return translateBiped(
			{
				left: oppositeBiped(row),
				right: row,
				top: oppositeBiped(column),
				bottom: column,
			},
			species,
		);
	}

	const rowTokens = tokenizeQuadruped(row);
	const columnTokens = tokenizeQuadruped(column);
	if (!rowTokens || !columnTokens) return null;
	const isLimb = [...rowTokens, ...columnTokens].some((token) =>
		LIMB_TOKENS.has(token),
	);
	const format = (tokens: string[]) =>
		tokens
			.map((token) =>
				species === "equine" ? (QUADRUPED_LABELS[token] ?? token) : token,
			)
			.join("");
	const opposite = (tokens: string[]) =>
		tokens.map((token) => getQuadrupedOpposite(token, isLimb));

	return {
		left: format(opposite(rowTokens)),
		right: format(rowTokens),
		top: format(opposite(columnTokens)),
		bottom: format(columnTokens),
	};
};

// 画像の辺ごとの方向を、回転・反転後に画面のどの辺へ来るかで並べ替える。
// 描画と同じ行列を使い、方向マーカーが画像の向きとずれないようにする
export const orientDirectionInfo = (
	info: ImageDirectionInfo,
	transform: DirectionViewTransform,
): ImageDirectionInfo => {
	const { a, b, c, d } = getImageToDisplayMatrix(
		createImageGeometry(1, 1, transform),
	);
	const sideOf = (x: number, y: number): keyof ImageDirectionInfo => {
		if (Math.abs(x) >= Math.abs(y)) return x > 0 ? "right" : "left";
		return y > 0 ? "bottom" : "top";
	};
	const oriented: ImageDirectionInfo = { ...info };
	oriented[sideOf(a, b)] = info.right;
	oriented[sideOf(-a, -b)] = info.left;
	oriented[sideOf(c, d)] = info.bottom;
	oriented[sideOf(-c, -d)] = info.top;
	return oriented;
};

type DirectionSource = Pick<
	DicomFileInfo,
	"imageOrientationPatient" | "patientOrientation" | "anatomicalOrientationType"
>;

// 四足動物の IOP は部位ごとに軸の意味が変わる（PS3.3 C.7.6.2.1.1）ため、
// 部位が分からない状態で推測した方向は出さず、Patient Orientation の明示値だけを使う
export const resolveImageDirection = (
	file: DirectionSource,
	species: Species,
	transform?: DirectionViewTransform,
): ImageDirectionInfo | null => {
	const info =
		(file.anatomicalOrientationType !== "QUADRUPED"
			? calculateImageDirection(file.imageOrientationPatient, species)
			: null) ??
		calculatePatientOrientationDirection(
			file.patientOrientation,
			file.anatomicalOrientationType,
			species,
		);
	if (!info) return null;
	return transform ? orientDirectionInfo(info, transform) : info;
};
