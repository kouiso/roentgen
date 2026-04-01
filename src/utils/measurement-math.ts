// 計測ユーティリティ — 距離・角度計算
import type { MeasurementPoint } from "@/types/measurement";

// 2点間の距離（mm単位）
// pixelSpacing: [rowSpacing, colSpacing] in mm/pixel
export const calculateDistanceMm = (
	p1: MeasurementPoint,
	p2: MeasurementPoint,
	pixelSpacing: [number, number] | null,
): number => {
	const rowSpacing = pixelSpacing?.[0] ?? 1;
	const colSpacing = pixelSpacing?.[1] ?? 1;

	const dx = (p2.x - p1.x) * colSpacing;
	const dy = (p2.y - p1.y) * rowSpacing;

	return Math.sqrt(dx * dx + dy * dy);
};

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
	// biome-ignore lint/suspicious/noExplicitAny: OSD viewport
	viewport: any,
): MeasurementPoint | null => {
	if (!viewport) return null;

	// コンテナ内の相対座標
	const containerX = clientX - containerRect.left;
	const containerY = clientY - containerRect.top;

	// OSDビューポート座標系に変換
	const zoom = viewport.getZoom();
	const center = viewport.getCenter();
	const homeBounds = viewport.getHomeBounds();

	// ビューポート座標
	const vpWidth = homeBounds.width / zoom;
	const vpHeight =
		(homeBounds.width * containerRect.height) / containerRect.width / zoom;

	const vpX =
		center.x - vpWidth / 2 + (containerX / containerRect.width) * vpWidth;
	const vpY =
		center.y - vpHeight / 2 + (containerY / containerRect.height) * vpHeight;

	// 画像座標に変換
	const imgX = (vpX / homeBounds.width) * imageWidth;
	const imgY = (vpY / homeBounds.width) * imageWidth;

	if (imgX < 0 || imgX >= imageWidth || imgY < 0 || imgY >= imageHeight) {
		return null;
	}

	return { x: imgX, y: imgY };
};

// 画像座標 → コンテナピクセル座標（SVG描画用）
export const imageToContainerCoord = (
	imagePoint: MeasurementPoint,
	imageWidth: number,
	containerRect: DOMRect,
	// biome-ignore lint/suspicious/noExplicitAny: OSD viewport
	viewport: any,
): MeasurementPoint | null => {
	if (!viewport) return null;

	const homeBounds = viewport.getHomeBounds();
	const zoom = viewport.getZoom();
	const center = viewport.getCenter();

	// 画像座標 → ビューポート座標
	const vpX = (imagePoint.x / imageWidth) * homeBounds.width;
	const vpY = (imagePoint.y / imageWidth) * homeBounds.width;

	// ビューポート座標 → コンテナ座標
	const vpWidth = homeBounds.width / zoom;
	const vpHeight =
		(homeBounds.width * containerRect.height) / containerRect.width / zoom;

	const containerX =
		((vpX - (center.x - vpWidth / 2)) / vpWidth) * containerRect.width;
	const containerY =
		((vpY - (center.y - vpHeight / 2)) / vpHeight) * containerRect.height;

	return { x: containerX, y: containerY };
};
