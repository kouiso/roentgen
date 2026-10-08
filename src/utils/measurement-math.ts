// 計測ユーティリティ — 距離・角度計算とコンテナ⇄画像座標変換
import type { MeasurementPoint, MeasurementUnit } from "@/types/measurement";
import {
	createImageGeometry,
	displayToImagePoint,
	getDisplaySize,
	type ImageGeometry,
	imageToDisplayPoint,
} from "@/utils/image-geometry";

// OSD Viewport のうち座標変換に使う最小限のAPI
export type OSDViewport = {
	getZoom: () => number;
	getCenter: () => MeasurementPoint;
	getRotation?: () => number;
	getFlip?: () => boolean;
};

export type DistanceCalculationResult = {
	value: number;
	unit: MeasurementUnit;
	calibrated: boolean;
};

const rotateAround = (
	point: MeasurementPoint,
	center: MeasurementPoint,
	degrees: number,
): MeasurementPoint => {
	if (!degrees) return point;
	const radians = (degrees * Math.PI) / 180;
	const cos = Math.cos(radians);
	const sin = Math.sin(radians);
	const dx = point.x - center.x;
	const dy = point.y - center.y;
	return {
		x: center.x + dx * cos - dy * sin,
		y: center.y + dx * sin + dy * cos,
	};
};

// OSD のビューポート座標は等方的（x/y とも「表示タイル幅 = 1.0」で正規化）。
// 可視範囲の幅は 1/zoom で、高さはコンテナの縦横比から決まる。
// homeBounds はコンテナの縦横比に合わせて拡張された矩形なので、画像の高さ換算には使えない。
// rotation/flip は OSD の pointFromPixel / pixelFromPoint と同じ規約で扱う
// （アプリ自身は OSD の回転・反転を使わず、表示タイル側で回転させている）。
const containerToViewportPoint = (
	containerX: number,
	containerY: number,
	containerRect: DOMRect,
	viewport: OSDViewport,
): MeasurementPoint | null => {
	const zoom = viewport.getZoom();
	if (!Number.isFinite(zoom) || zoom <= 0 || containerRect.width <= 0) {
		return null;
	}
	const center = viewport.getCenter();
	const pixelsPerUnit = containerRect.width * zoom;
	const x = viewport.getFlip?.()
		? containerRect.width - containerX
		: containerX;
	const unrotated = {
		x: center.x + (x - containerRect.width / 2) / pixelsPerUnit,
		y: center.y + (containerY - containerRect.height / 2) / pixelsPerUnit,
	};
	return rotateAround(unrotated, center, -(viewport.getRotation?.() ?? 0));
};

const viewportToContainerPoint = (
	point: MeasurementPoint,
	containerRect: DOMRect,
	viewport: OSDViewport,
): MeasurementPoint | null => {
	const zoom = viewport.getZoom();
	if (!Number.isFinite(zoom) || zoom <= 0 || containerRect.width <= 0) {
		return null;
	}
	const center = viewport.getCenter();
	const pixelsPerUnit = containerRect.width * zoom;
	const rotated = rotateAround(point, center, viewport.getRotation?.() ?? 0);
	const x = (rotated.x - center.x) * pixelsPerUnit + containerRect.width / 2;
	return {
		x: viewport.getFlip?.() ? containerRect.width - x : x,
		y: (rotated.y - center.y) * pixelsPerUnit + containerRect.height / 2,
	};
};

const resolveGeometry = (
	imageWidth: number,
	imageHeight: number,
	geometry: ImageGeometry | null | undefined,
): ImageGeometry =>
	geometry && geometry.columns === imageWidth && geometry.rows === imageHeight
		? geometry
		: createImageGeometry(imageWidth, imageHeight);

// 2点間の距離（校正済みならmm、PixelSpacingなしならpx）
// pixelSpacing: [rowSpacing, colSpacing] in mm/pixel
export const calculateDistance = (
	p1: MeasurementPoint,
	p2: MeasurementPoint,
	pixelSpacing: [number, number] | null,
): DistanceCalculationResult => {
	const validSpacing =
		pixelSpacing?.every((spacing) => Number.isFinite(spacing) && spacing > 0) ??
		false;
	const spacing = validSpacing ? pixelSpacing : null;
	const rowSpacing = spacing?.[0] ?? 1;
	const colSpacing = spacing?.[1] ?? 1;

	const dx = (p2.x - p1.x) * colSpacing;
	const dy = (p2.y - p1.y) * rowSpacing;

	return {
		value: Math.sqrt(dx * dx + dy * dy),
		unit: spacing ? "mm" : "px",
		calibrated: spacing !== null,
	};
};

// 既存呼び出し向け: 校正なしの場合はpx値を返す
export const calculateDistanceMm = (
	p1: MeasurementPoint,
	p2: MeasurementPoint,
	pixelSpacing: [number, number] | null,
): number => calculateDistance(p1, p2, pixelSpacing).value;

// 3点の角度（度単位）— p2が頂点
export const calculateAngleDeg = (
	p1: MeasurementPoint,
	p2: MeasurementPoint,
	p3: MeasurementPoint,
): number => {
	const v1x = p1.x - p2.x;
	const v1y = p1.y - p2.y;
	const v2x = p3.x - p2.x;
	const v2y = p3.y - p2.y;

	const dot = v1x * v2x + v1y * v2y;
	const cross = v1x * v2y - v1y * v2x;

	// 3点角度ツールは臨床計測の慣例に合わせ、反射角ではなく内角を返す。
	const angleRad = Math.atan2(Math.abs(cross), dot);
	return (angleRad * 180) / Math.PI;
};

// コンテナ座標(clientX/Y) → 画像ピクセル座標。画像の外なら null。
// geometry には表示中の回転・反転・縦横比を渡す。省略時は無変換の正方ピクセル扱い。
export const containerToImageCoord = (
	clientX: number,
	clientY: number,
	containerRect: DOMRect,
	imageWidth: number,
	imageHeight: number,
	viewport: OSDViewport | null,
	geometry?: ImageGeometry | null,
): MeasurementPoint | null => {
	if (!viewport || imageWidth <= 0 || imageHeight <= 0) return null;

	const vp = containerToViewportPoint(
		clientX - containerRect.left,
		clientY - containerRect.top,
		containerRect,
		viewport,
	);
	if (!vp) return null;

	const resolved = resolveGeometry(imageWidth, imageHeight, geometry);
	const displayWidth = getDisplaySize(resolved).width;
	const image = displayToImagePoint(
		{ x: vp.x * displayWidth, y: vp.y * displayWidth },
		resolved,
	);

	if (
		image.x < 0 ||
		image.x >= imageWidth ||
		image.y < 0 ||
		image.y >= imageHeight
	) {
		return null;
	}

	return image;
};

// 画像ピクセル座標 → コンテナ座標（SVG描画用）
export const imageToContainerCoord = (
	imagePoint: MeasurementPoint,
	imageWidth: number,
	imageHeight: number,
	containerRect: DOMRect,
	viewport: OSDViewport | null,
	geometry?: ImageGeometry | null,
): MeasurementPoint | null => {
	if (!viewport || imageWidth <= 0 || imageHeight <= 0) return null;

	const resolved = resolveGeometry(imageWidth, imageHeight, geometry);
	const displayWidth = getDisplaySize(resolved).width;
	const display = imageToDisplayPoint(imagePoint, resolved);

	return viewportToContainerPoint(
		{ x: display.x / displayWidth, y: display.y / displayWidth },
		containerRect,
		viewport,
	);
};
