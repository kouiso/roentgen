// 計測SVGオーバーレイ — 距離・角度の描画

import { useCallback, useEffect, useRef, useState } from "react";
import type { Measurement, MeasurementPoint } from "@/types/measurement";
import { imageToContainerCoord } from "@/utils/measurement-math";

type MeasurementOverlayProps = {
	measurements: Measurement[];
	activePoints: MeasurementPoint[];
	imageWidth: number;
	containerId: string;
	// biome-ignore lint/suspicious/noExplicitAny: OSD viewport
	viewport: any;
	onRemoveMeasurement: (id: string) => void;
	visible: boolean;
};

// 画像座標をコンテナ座標に変換するヘルパー
const useCoordConverter = (
	containerId: string,
	imageWidth: number,
	// biome-ignore lint/suspicious/noExplicitAny: OSD viewport
	viewport: any,
) => {
	const convert = useCallback(
		(point: MeasurementPoint): MeasurementPoint | null => {
			const container = document.getElementById(containerId);
			if (!container || !viewport) return null;
			const rect = container.getBoundingClientRect();
			return imageToContainerCoord(point, imageWidth, rect, viewport);
		},
		[containerId, imageWidth, viewport],
	);
	return convert;
};

// 距離計測の描画
const DistanceLine = ({
	m,
	convert,
	onRemove,
}: {
	m: Measurement & { type: "distance" };
	convert: (p: MeasurementPoint) => MeasurementPoint | null;
	onRemove: () => void;
}) => {
	const p1 = convert(m.points[0]);
	const p2 = convert(m.points[1]);
	if (!p1 || !p2) return null;

	const midX = (p1.x + p2.x) / 2;
	const midY = (p1.y + p2.y) / 2;
	const label =
		m.distanceMm >= 10
			? `${m.distanceMm.toFixed(1)} mm`
			: `${m.distanceMm.toFixed(2)} mm`;

	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: SVG計測線のクリック削除用（role不要）
		<g className="cursor-pointer" onClick={onRemove}>
			<line
				x1={p1.x}
				y1={p1.y}
				x2={p2.x}
				y2={p2.y}
				stroke="#00ff88"
				strokeWidth={1.5}
				strokeLinecap="round"
			/>
			{/* 端点マーカー */}
			<circle cx={p1.x} cy={p1.y} r={3} fill="#00ff88" />
			<circle cx={p2.x} cy={p2.y} r={3} fill="#00ff88" />
			{/* ラベル背景 */}
			<rect
				x={midX - 2}
				y={midY - 14}
				width={label.length * 7 + 4}
				height={16}
				fill="rgba(0,0,0,0.7)"
				rx={2}
			/>
			<text
				x={midX}
				y={midY - 2}
				fill="#00ff88"
				fontSize={11}
				fontFamily="monospace"
			>
				{label}
			</text>
		</g>
	);
};

// 角度計測の描画
const AngleLine = ({
	m,
	convert,
	onRemove,
}: {
	m: Measurement & { type: "angle" };
	convert: (p: MeasurementPoint) => MeasurementPoint | null;
	onRemove: () => void;
}) => {
	const p1 = convert(m.points[0]);
	const p2 = convert(m.points[1]); // 頂点
	const p3 = convert(m.points[2]);
	if (!p1 || !p2 || !p3) return null;

	const label = `${m.angleDeg.toFixed(1)}°`;

	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: SVG計測線のクリック削除用（role不要）
		<g className="cursor-pointer" onClick={onRemove}>
			<line
				x1={p1.x}
				y1={p1.y}
				x2={p2.x}
				y2={p2.y}
				stroke="#ffaa00"
				strokeWidth={1.5}
				strokeLinecap="round"
			/>
			<line
				x1={p2.x}
				y1={p2.y}
				x2={p3.x}
				y2={p3.y}
				stroke="#ffaa00"
				strokeWidth={1.5}
				strokeLinecap="round"
			/>
			{/* 端点・頂点マーカー */}
			<circle cx={p1.x} cy={p1.y} r={3} fill="#ffaa00" />
			<circle cx={p2.x} cy={p2.y} r={4} fill="#ffaa00" />
			<circle cx={p3.x} cy={p3.y} r={3} fill="#ffaa00" />
			{/* 角度ラベル */}
			<rect
				x={p2.x + 8}
				y={p2.y - 14}
				width={label.length * 7 + 4}
				height={16}
				fill="rgba(0,0,0,0.7)"
				rx={2}
			/>
			<text
				x={p2.x + 10}
				y={p2.y - 2}
				fill="#ffaa00"
				fontSize={11}
				fontFamily="monospace"
			>
				{label}
			</text>
		</g>
	);
};

// アクティブポイント（配置中）の描画
const ActivePointsOverlay = ({
	points,
	convert,
}: {
	points: MeasurementPoint[];
	convert: (p: MeasurementPoint) => MeasurementPoint | null;
}) => {
	if (points.length === 0) return null;

	const converted = points.map(convert).filter(Boolean) as MeasurementPoint[];
	if (converted.length === 0) return null;

	return (
		<g>
			{converted.map((p) => (
				<circle
					key={`active-${p.x}-${p.y}`}
					cx={p.x}
					cy={p.y}
					r={4}
					fill="#ffffff"
					stroke="#00ff88"
					strokeWidth={2}
				/>
			))}
			{converted.length >= 2 && (
				<line
					x1={converted[0]?.x}
					y1={converted[0]?.y}
					x2={converted[1]?.x}
					y2={converted[1]?.y}
					stroke="#ffffff"
					strokeWidth={1}
					strokeDasharray="4,4"
				/>
			)}
		</g>
	);
};

export const MeasurementOverlay = ({
	measurements,
	activePoints,
	imageWidth,
	containerId,
	viewport,
	onRemoveMeasurement,
	visible,
}: MeasurementOverlayProps) => {
	const convert = useCoordConverter(containerId, imageWidth, viewport);
	// ビューポート変更時に再描画するためのカウンター
	const [, setRedrawCount] = useState(0);
	const rafRef = useRef(0);

	// OSDのズーム/パン時にSVGを再描画
	useEffect(() => {
		if (!visible) return;

		let running = true;
		const tick = () => {
			if (!running) return;
			setRedrawCount((c) => c + 1);
			rafRef.current = requestAnimationFrame(tick);
		};
		// 30fpsで更新（60fpsは計測描画には過剰）
		const intervalId = setInterval(() => {
			cancelAnimationFrame(rafRef.current);
			rafRef.current = requestAnimationFrame(tick);
		}, 33);

		return () => {
			running = false;
			clearInterval(intervalId);
			cancelAnimationFrame(rafRef.current);
		};
	}, [visible]);

	if (!visible || (measurements.length === 0 && activePoints.length === 0)) {
		return null;
	}

	return (
		<svg
			role="img"
			aria-label="計測オーバーレイ"
			className="pointer-events-none absolute inset-0 z-30"
			style={{ width: "100%", height: "100%" }}
		>
			<g className="pointer-events-auto">
				{measurements.map((m) =>
					m.type === "distance" ? (
						<DistanceLine
							key={m.id}
							m={m}
							convert={convert}
							onRemove={() => onRemoveMeasurement(m.id)}
						/>
					) : (
						<AngleLine
							key={m.id}
							m={m}
							convert={convert}
							onRemove={() => onRemoveMeasurement(m.id)}
						/>
					),
				)}
				<ActivePointsOverlay points={activePoints} convert={convert} />
			</g>
		</svg>
	);
};
