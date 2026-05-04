// 注釈SVGオーバーレイ — テキスト・矢印・ROIの描画

import { useCallback, useEffect, useRef, useState } from "react";
import type { Annotation, AnnotationPoint } from "@/types/annotation";
import { imageToContainerCoord } from "@/utils/measurement-math";

const ANNOTATION_COLOR = "#FFD700";

type AnnotationOverlayProps = {
	annotations: Annotation[];
	activePoints: AnnotationPoint[];
	pendingTextPosition: AnnotationPoint | null;
	imageWidth: number;
	imageHeight: number;
	containerId: string;
	// biome-ignore lint/suspicious/noExplicitAny: OSD viewport
	viewport: any;
	onRemoveAnnotation: (id: string) => void;
	onSubmitTextAnnotation: (text: string) => void;
	onCancelPendingText: () => void;
	visible: boolean;
};

// 画像座標をコンテナ座標に変換するヘルパー
const useCoordConverter = (
	containerId: string,
	imageWidth: number,
	imageHeight: number,
	// biome-ignore lint/suspicious/noExplicitAny: OSD viewport
	viewport: any,
) => {
	const convert = useCallback(
		(point: AnnotationPoint): AnnotationPoint | null => {
			const container = document.getElementById(containerId);
			if (!container || !viewport) return null;
			const rect = container.getBoundingClientRect();
			return imageToContainerCoord(
				point,
				imageWidth,
				imageHeight,
				rect,
				viewport,
			);
		},
		[containerId, imageWidth, imageHeight, viewport],
	);
	return convert;
};

const DeleteButton = ({
	x,
	y,
	onRemove,
}: {
	x: number;
	y: number;
	onRemove: () => void;
}) => (
	<foreignObject
		x={x - 8}
		y={y - 8}
		width={16}
		height={16}
		className="cursor-pointer opacity-0 transition-opacity group-hover:opacity-100"
	>
		<button
			type="button"
			aria-label="注釈削除"
			onClick={(e) => {
				e.stopPropagation();
				onRemove();
			}}
			className="flex h-4 w-4 items-center justify-center rounded-full bg-black/80 font-mono text-[12px] leading-none text-white"
		>
			×
		</button>
	</foreignObject>
);

const TextAnnotationView = ({
	annotation,
	convert,
	onRemove,
}: {
	annotation: Annotation & { type: "text" };
	convert: (p: AnnotationPoint) => AnnotationPoint | null;
	onRemove: () => void;
}) => {
	const p = convert(annotation.position);
	if (!p) return null;

	const color = annotation.color ?? ANNOTATION_COLOR;
	const width = annotation.text.length * 8 + 10;

	return (
		<g className="group">
			<rect
				x={p.x}
				y={p.y - 17}
				width={width}
				height={20}
				fill="rgba(0,0,0,0.68)"
				rx={2}
			/>
			<text
				x={p.x + 5}
				y={p.y - 3}
				fill={color}
				fontSize={13}
				fontFamily="sans-serif"
			>
				{annotation.text}
			</text>
			<DeleteButton x={p.x + width + 9} y={p.y - 8} onRemove={onRemove} />
		</g>
	);
};

const ArrowAnnotationView = ({
	annotation,
	convert,
	onRemove,
}: {
	annotation: Annotation & { type: "arrow" };
	convert: (p: AnnotationPoint) => AnnotationPoint | null;
	onRemove: () => void;
}) => {
	const start = convert(annotation.start);
	const end = convert(annotation.end);
	if (!start || !end) return null;
	const color = annotation.color ?? ANNOTATION_COLOR;

	return (
		<g className="group">
			<line
				x1={start.x}
				y1={start.y}
				x2={end.x}
				y2={end.y}
				stroke={color}
				strokeWidth={2}
				strokeLinecap="round"
				markerEnd="url(#annotation-arrowhead)"
			/>
			<circle cx={start.x} cy={start.y} r={3} fill={color} />
			<DeleteButton x={end.x + 12} y={end.y - 12} onRemove={onRemove} />
		</g>
	);
};

const RectAnnotationView = ({
	annotation,
	convert,
	onRemove,
}: {
	annotation: Annotation & { type: "rect" };
	convert: (p: AnnotationPoint) => AnnotationPoint | null;
	onRemove: () => void;
}) => {
	const topLeft = convert(annotation.topLeft);
	const bottomRight = convert(annotation.bottomRight);
	if (!topLeft || !bottomRight) return null;
	const color = annotation.color ?? ANNOTATION_COLOR;

	const x = Math.min(topLeft.x, bottomRight.x);
	const y = Math.min(topLeft.y, bottomRight.y);
	const width = Math.abs(bottomRight.x - topLeft.x);
	const height = Math.abs(bottomRight.y - topLeft.y);

	return (
		<g className="group">
			<rect
				x={x}
				y={y}
				width={width}
				height={height}
				fill="transparent"
				stroke={color}
				strokeWidth={1.5}
				strokeDasharray="6,4"
			/>
			<DeleteButton x={x + width + 10} y={y - 10} onRemove={onRemove} />
		</g>
	);
};

const EllipseAnnotationView = ({
	annotation,
	convert,
	onRemove,
}: {
	annotation: Annotation & { type: "ellipse" };
	convert: (p: AnnotationPoint) => AnnotationPoint | null;
	onRemove: () => void;
}) => {
	const center = convert(annotation.center);
	const radiusXPoint = convert({
		x: annotation.center.x + annotation.radiusX,
		y: annotation.center.y,
	});
	const radiusYPoint = convert({
		x: annotation.center.x,
		y: annotation.center.y + annotation.radiusY,
	});
	if (!center || !radiusXPoint || !radiusYPoint) return null;

	const radiusX = Math.abs(radiusXPoint.x - center.x);
	const radiusY = Math.abs(radiusYPoint.y - center.y);
	const color = annotation.color ?? ANNOTATION_COLOR;

	return (
		<g className="group">
			<ellipse
				cx={center.x}
				cy={center.y}
				rx={radiusX}
				ry={radiusY}
				fill="transparent"
				stroke={color}
				strokeWidth={1.5}
				strokeDasharray="6,4"
			/>
			<DeleteButton
				x={center.x + radiusX + 10}
				y={center.y - radiusY - 10}
				onRemove={onRemove}
			/>
		</g>
	);
};

const ActivePointsOverlay = ({
	points,
	convert,
}: {
	points: AnnotationPoint[];
	convert: (p: AnnotationPoint) => AnnotationPoint | null;
}) => {
	if (points.length === 0) return null;

	const converted = points.map(convert).filter(Boolean) as AnnotationPoint[];
	if (converted.length === 0) return null;

	return (
		<g>
			{converted.map((p) => (
				<circle
					key={`${p.x}:${p.y}`}
					cx={p.x}
					cy={p.y}
					r={4}
					fill="#000000"
					stroke={ANNOTATION_COLOR}
					strokeWidth={2}
				/>
			))}
			{converted.length >= 2 && (
				<line
					x1={converted[0]?.x}
					y1={converted[0]?.y}
					x2={converted[1]?.x}
					y2={converted[1]?.y}
					stroke={ANNOTATION_COLOR}
					strokeWidth={1}
					strokeDasharray="4,4"
				/>
			)}
		</g>
	);
};

const PendingTextInput = ({
	position,
	convert,
	onSubmit,
	onCancel,
}: {
	position: AnnotationPoint;
	convert: (p: AnnotationPoint) => AnnotationPoint | null;
	onSubmit: (text: string) => void;
	onCancel: () => void;
}) => {
	const [value, setValue] = useState("");
	const inputRef = useRef<HTMLInputElement>(null);
	const p = convert(position);

	useEffect(() => {
		inputRef.current?.focus();
	}, []);

	if (!p) return null;

	return (
		<foreignObject x={p.x} y={p.y - 22} width={180} height={28}>
			<input
				ref={inputRef}
				type="text"
				aria-label="注釈テキスト"
				value={value}
				onClick={(e) => e.stopPropagation()}
				onChange={(e) => setValue(e.currentTarget.value)}
				onKeyDown={(e) => {
					if (e.key === "Enter") {
						e.preventDefault();
						onSubmit(value);
					} else if (e.key === "Escape") {
						e.preventDefault();
						onCancel();
					}
				}}
				className="h-6 w-full rounded-sm border border-yellow-300 bg-black/80 px-1.5 text-[12px] text-yellow-200 outline-none"
			/>
		</foreignObject>
	);
};

export const AnnotationOverlay = ({
	annotations,
	activePoints,
	pendingTextPosition,
	imageWidth,
	imageHeight,
	containerId,
	viewport,
	onRemoveAnnotation,
	onSubmitTextAnnotation,
	onCancelPendingText,
	visible,
}: AnnotationOverlayProps) => {
	const convert = useCoordConverter(
		containerId,
		imageWidth,
		imageHeight,
		viewport,
	);
	// ビューポート変更時に再描画するためのカウンター
	const [, setRedrawCount] = useState(0);

	// OSDのズーム/パン/描画更新イベントに合わせてSVGを再描画
	useEffect(() => {
		if (
			!visible ||
			(annotations.length === 0 &&
				activePoints.length === 0 &&
				!pendingTextPosition)
		) {
			return;
		}
		if (!viewport || typeof viewport.addHandler !== "function") return;

		const requestRedraw = () => {
			setRedrawCount((c) => c + 1);
		};
		const events = [
			"viewport-change",
			"animation",
			"animation-finish",
			"update-viewport",
		];

		for (const eventName of events) {
			viewport.addHandler(eventName, requestRedraw);
		}

		return () => {
			if (typeof viewport.removeHandler !== "function") return;
			for (const eventName of events) {
				viewport.removeHandler(eventName, requestRedraw);
			}
		};
	}, [
		visible,
		annotations.length,
		activePoints.length,
		pendingTextPosition,
		viewport,
	]);

	if (
		!visible ||
		(annotations.length === 0 &&
			activePoints.length === 0 &&
			!pendingTextPosition)
	) {
		return null;
	}

	return (
		<svg
			role="img"
			aria-label="注釈オーバーレイ"
			className="pointer-events-none absolute inset-0 z-40"
			style={{ width: "100%", height: "100%" }}
		>
			<defs>
				<marker
					id="annotation-arrowhead"
					markerWidth={10}
					markerHeight={10}
					refX={9}
					refY={3}
					orient="auto"
					markerUnits="strokeWidth"
				>
					<path d="M0,0 L0,6 L9,3 z" fill={ANNOTATION_COLOR} />
				</marker>
			</defs>
			<g className="pointer-events-auto">
				{annotations.map((annotation) => {
					switch (annotation.type) {
						case "text":
							return (
								<TextAnnotationView
									key={annotation.id}
									annotation={annotation}
									convert={convert}
									onRemove={() => onRemoveAnnotation(annotation.id)}
								/>
							);
						case "arrow":
							return (
								<ArrowAnnotationView
									key={annotation.id}
									annotation={annotation}
									convert={convert}
									onRemove={() => onRemoveAnnotation(annotation.id)}
								/>
							);
						case "rect":
							return (
								<RectAnnotationView
									key={annotation.id}
									annotation={annotation}
									convert={convert}
									onRemove={() => onRemoveAnnotation(annotation.id)}
								/>
							);
						case "ellipse":
							return (
								<EllipseAnnotationView
									key={annotation.id}
									annotation={annotation}
									convert={convert}
									onRemove={() => onRemoveAnnotation(annotation.id)}
								/>
							);
					}
					return null;
				})}
				<ActivePointsOverlay points={activePoints} convert={convert} />
				{pendingTextPosition && (
					<PendingTextInput
						position={pendingTextPosition}
						convert={convert}
						onSubmit={onSubmitTextAnnotation}
						onCancel={onCancelPendingText}
					/>
				)}
			</g>
		</svg>
	);
};
