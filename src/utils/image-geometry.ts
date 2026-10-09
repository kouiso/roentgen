// 画像ピクセル座標 ⇄ 表示キャンバス座標の幾何変換
// 回転・反転・非正方ピクセルの縦横比補正をここに集約し、描画（tile-drawing）と
// 計測/注釈の座標変換が必ず同じ式を使うようにする。
import type { MeasurementPoint } from "@/types/measurement";

export type ImageGeometry = {
	columns: number;
	rows: number;
	// 1ピクセルの縦横比 = rowSpacing / columnSpacing（正方ピクセルなら 1）
	pixelAspect: number;
	rotation: number;
	flipHorizontal: boolean;
	flipVertical: boolean;
};

export type CanvasSize = { width: number; height: number };

// canvas の setTransform と同じ並び: x' = a*x + c*y + e, y' = b*x + d*y + f
export type AffineMatrix = {
	a: number;
	b: number;
	c: number;
	d: number;
	e: number;
	f: number;
};

// Chromium の canvas は一辺 32767px / 面積 268M px が上限。縦横比補正で
// 片側を引き伸ばすと上限を超え得るため、表示用キャンバスはこの長さに抑える。
export const MAX_DISPLAY_CANVAS_DIMENSION = 16384;

export const getPixelAspect = (
	pixelSpacing: readonly [number, number] | null | undefined,
): number => {
	if (!pixelSpacing) return 1;
	const [rowSpacing, columnSpacing] = pixelSpacing;
	if (
		!Number.isFinite(rowSpacing) ||
		!Number.isFinite(columnSpacing) ||
		rowSpacing <= 0 ||
		columnSpacing <= 0
	) {
		return 1;
	}
	return rowSpacing / columnSpacing;
};

export const normalizeRotation = (rotation: number): number => {
	if (!Number.isFinite(rotation)) return 0;
	return (((Math.round(rotation / 90) * 90) % 360) + 360) % 360;
};

export const createImageGeometry = (
	columns: number,
	rows: number,
	options: Partial<Omit<ImageGeometry, "columns" | "rows">> = {},
): ImageGeometry => ({
	columns,
	rows,
	pixelAspect: options.pixelAspect ?? 1,
	rotation: options.rotation ?? 0,
	flipHorizontal: options.flipHorizontal ?? false,
	flipVertical: options.flipVertical ?? false,
});

// 縮めると情報が欠けるため、縦横比補正は常に「短い方を伸ばす」向きで行う
const getAxisScale = (geometry: ImageGeometry): { sx: number; sy: number } => {
	const aspect =
		Number.isFinite(geometry.pixelAspect) && geometry.pixelAspect > 0
			? geometry.pixelAspect
			: 1;
	let sx = aspect >= 1 ? 1 : 1 / aspect;
	let sy = aspect >= 1 ? aspect : 1;
	const longest = Math.max(geometry.columns * sx, geometry.rows * sy);
	if (longest > MAX_DISPLAY_CANVAS_DIMENSION) {
		const k = MAX_DISPLAY_CANVAS_DIMENSION / longest;
		sx *= k;
		sy *= k;
	}
	return { sx, sy };
};

const isQuarterTurn = (rotation: number) => {
	const r = normalizeRotation(rotation);
	return r === 90 || r === 270;
};

const getExactDisplaySize = (geometry: ImageGeometry): CanvasSize => {
	const { sx, sy } = getAxisScale(geometry);
	const width = geometry.columns * sx;
	const height = geometry.rows * sy;
	return isQuarterTurn(geometry.rotation)
		? { width: height, height: width }
		: { width, height };
};

// 表示用キャンバス（= OSD に渡すタイル）の整数サイズ
export const getDisplaySize = (geometry: ImageGeometry): CanvasSize => {
	if (geometry.columns <= 0 || geometry.rows <= 0) {
		return { width: 0, height: 0 };
	}
	const exact = getExactDisplaySize(geometry);
	return {
		width: Math.max(1, Math.round(exact.width)),
		height: Math.max(1, Math.round(exact.height)),
	};
};

const QUARTER_TURN_TRIG: Record<number, { cos: number; sin: number }> = {
	0: { cos: 1, sin: 0 },
	90: { cos: 0, sin: 1 },
	180: { cos: -1, sin: 0 },
	270: { cos: 0, sin: -1 },
};

// 画像ピクセル座標 → 表示キャンバス座標。
// 順序は「画像中心へ移動 → 縦横比補正 → 時計回り回転 → 反転 → キャンバス中心へ移動」。
// 反転を回転の後（画面基準）にするのは、90°回転中に「左右」を押したとき
// 画面上で左右に反転させるため（画像基準だと上下反転に見えてしまう）。
export const getImageToDisplayMatrix = (
	geometry: ImageGeometry,
	canvas: CanvasSize = getDisplaySize(geometry),
): AffineMatrix => {
	const { sx, sy } = getAxisScale(geometry);
	const exact = getExactDisplaySize(geometry);
	const fit =
		exact.width > 0 && exact.height > 0
			? Math.min(canvas.width / exact.width, canvas.height / exact.height)
			: 1;
	const kx = fit * sx;
	const ky = fit * sy;
	const fx = geometry.flipHorizontal ? -1 : 1;
	const fy = geometry.flipVertical ? -1 : 1;
	const trig = QUARTER_TURN_TRIG[normalizeRotation(geometry.rotation)] ?? {
		cos: 1,
		sin: 0,
	};
	const a = fx * trig.cos * kx;
	const b = fy * trig.sin * kx;
	const c = fx * -trig.sin * ky;
	const d = fy * trig.cos * ky;
	const halfColumns = geometry.columns / 2;
	const halfRows = geometry.rows / 2;
	return {
		a,
		b,
		c,
		d,
		e: canvas.width / 2 - (a * halfColumns + c * halfRows),
		f: canvas.height / 2 - (b * halfColumns + d * halfRows),
	};
};

const applyMatrix = (
	matrix: AffineMatrix,
	point: MeasurementPoint,
): MeasurementPoint => ({
	x: matrix.a * point.x + matrix.c * point.y + matrix.e,
	y: matrix.b * point.x + matrix.d * point.y + matrix.f,
});

const invertMatrix = (matrix: AffineMatrix): AffineMatrix => {
	const det = matrix.a * matrix.d - matrix.b * matrix.c;
	const a = matrix.d / det;
	const b = -matrix.b / det;
	const c = -matrix.c / det;
	const d = matrix.a / det;
	return {
		a,
		b,
		c,
		d,
		e: -(a * matrix.e + c * matrix.f),
		f: -(b * matrix.e + d * matrix.f),
	};
};

export const imageToDisplayPoint = (
	point: MeasurementPoint,
	geometry: ImageGeometry,
): MeasurementPoint => applyMatrix(getImageToDisplayMatrix(geometry), point);

export const displayToImagePoint = (
	point: MeasurementPoint,
	geometry: ImageGeometry,
): MeasurementPoint =>
	applyMatrix(invertMatrix(getImageToDisplayMatrix(geometry)), point);
