// 計測ユーティリティ — 距離・角度計算
import type { MeasurementPoint, MeasurementUnit } from "@/types/measurement";

type OSDViewport = {
	getZoom: () => number;
	getCenter: () => MeasurementPoint;
	getHomeBounds: () => {
		x: number;
		y: number;
		width: number;
		height: number;
	};
	getRotation?: () => number;
	getFlip?: () => boolean;
};

export type DistanceCalculationResult = {
	value: number;
	unit: MeasurementUnit;
	calibrated: boolean;
};

const getViewportTransformMatrix = (
	rotation: number,
	flip: boolean,
): { a: number; b: number; c: number; d: number } => {
	const radians = (rotation * Math.PI) / 180;
	const cos = Math.cos(radians);
	const sin = Math.sin(radians);

	if (!flip) {
		return { a: cos, b: sin, c: -sin, d: cos };
	}

	return { a: -cos, b: sin, c: sin, d: cos };
};

const applyMatrixAroundCenter = (
	point: MeasurementPoint,
	center: MeasurementPoint,
	matrix: { a: number; b: number; c: number; d: number },
): MeasurementPoint => {
	const dx = point.x - center.x;
	const dy = point.y - center.y;

	return {
		x: center.x + matrix.a * dx + matrix.c * dy,
		y: center.y + matrix.b * dx + matrix.d * dy,
	};
};

export const applyViewportTransform = (
	point: MeasurementPoint,
	center: MeasurementPoint,
	rotation: number,
	flip: boolean,
): MeasurementPoint => {
	return applyMatrixAroundCenter(
		point,
		center,
		getViewportTransformMatrix(rotation, flip),
	);
};

export const invertViewportTransform = (
	point: MeasurementPoint,
	center: MeasurementPoint,
	rotation: number,
	flip: boolean,
): MeasurementPoint => {
	const matrix = getViewportTransformMatrix(rotation, flip);
	const determinant = matrix.a * matrix.d - matrix.b * matrix.c;

	return applyMatrixAroundCenter(point, center, {
		a: matrix.d / determinant,
		b: -matrix.b / determinant,
		c: -matrix.c / determinant,
		d: matrix.a / determinant,
	});
};

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

// コンテナ座標 → 画像座標
export const containerToImageCoord = (
	clientX: number,
	clientY: number,
	containerRect: DOMRect,
	imageWidth: number,
	imageHeight: number,
	viewport: OSDViewport | null,
): MeasurementPoint | null => {
	if (!viewport) return null;

	// コンテナ内の相対座標
	const containerX = clientX - containerRect.left;
	const containerY = clientY - containerRect.top;

	// OSDビューポート座標系に変換
	const zoom = viewport.getZoom();
	const center = viewport.getCenter();
	const homeBounds = viewport.getHomeBounds();

	// ビューポート座標 (OSD 6.x: image normalized width = 1.0, NOT homeBounds.width)
	const vpWidth = 1.0 / zoom;
	const vpHeight = homeBounds.height / zoom;

	const vpX =
		center.x - vpWidth / 2 + (containerX / containerRect.width) * vpWidth;
	const vpY =
		center.y - vpHeight / 2 + (containerY / containerRect.height) * vpHeight;
	const transformed = invertViewportTransform(
		{ x: vpX, y: vpY },
		center,
		viewport.getRotation?.() ?? 0,
		viewport.getFlip?.() ?? false,
	);

	// 画像座標に変換 (OSD 6.x: image x ∈ [0, 1.0], not [0, homeBounds.width])
	const imgX = transformed.x * imageWidth;
	const imgY = (transformed.y / homeBounds.height) * imageHeight;

	if (imgX < 0 || imgX >= imageWidth || imgY < 0 || imgY >= imageHeight) {
		return null;
	}

	return { x: imgX, y: imgY };
};

// 画像座標 → コンテナピクセル座標（SVG描画用）
export function imageToContainerCoord(
	imagePoint: MeasurementPoint,
	imageWidth: number,
	imageHeight: number,
	containerRect: DOMRect,
	viewport: OSDViewport | null,
): MeasurementPoint | null;
export function imageToContainerCoord(
	imagePoint: MeasurementPoint,
	imageWidth: number,
	containerRect: DOMRect,
	viewport: OSDViewport | null,
): MeasurementPoint | null;
export function imageToContainerCoord(
	imagePoint: MeasurementPoint,
	imageWidth: number,
	imageHeightOrContainerRect: number | DOMRect,
	containerRectOrViewport: DOMRect | OSDViewport | null,
	maybeViewport?: OSDViewport | null,
): MeasurementPoint | null {
	let containerRect: DOMRect;
	let viewport: OSDViewport | null;
	let explicitImageHeight: number | null = null;

	if (typeof imageHeightOrContainerRect === "number") {
		explicitImageHeight = imageHeightOrContainerRect;
		if (
			!containerRectOrViewport ||
			"getHomeBounds" in containerRectOrViewport
		) {
			return null;
		}
		containerRect = containerRectOrViewport;
		viewport = maybeViewport ?? null;
	} else {
		containerRect = imageHeightOrContainerRect;
		if (
			!containerRectOrViewport ||
			!("getHomeBounds" in containerRectOrViewport)
		) {
			return null;
		}
		viewport = containerRectOrViewport;
	}

	if (!viewport) return null;

	const homeBounds = viewport.getHomeBounds();
	const zoom = viewport.getZoom();
	const center = viewport.getCenter();
	const imageHeight = explicitImageHeight ?? imageWidth * homeBounds.height;

	// 画像座標 → ビューポート座標 (OSD 6.x: image x ∈ [0, 1.0])
	const vpX = imagePoint.x / imageWidth;
	const vpY = (imagePoint.y / imageHeight) * homeBounds.height;
	const transformed = applyViewportTransform(
		{ x: vpX, y: vpY },
		center,
		viewport.getRotation?.() ?? 0,
		viewport.getFlip?.() ?? false,
	);

	// ビューポート座標 → コンテナ座標
	const vpWidth = 1.0 / zoom;
	const vpHeight = homeBounds.height / zoom;

	const containerX =
		((transformed.x - (center.x - vpWidth / 2)) / vpWidth) *
		containerRect.width;
	const containerY =
		((transformed.y - (center.y - vpHeight / 2)) / vpHeight) *
		containerRect.height;

	return { x: containerX, y: containerY };
}
