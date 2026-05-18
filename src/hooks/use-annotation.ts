// 注釈ツール状態管理
import { useCallback, useState } from "react";
import type {
	Annotation,
	AnnotationPoint,
	AnnotationToolType,
	ArrowAnnotation,
	EllipseAnnotation,
	RectAnnotation,
	TextAnnotation,
} from "@/types/annotation";
import { DEFAULT_ANNOTATION_COLOR } from "@/utils/annotation-storage";

const createAnnotationId = (): string => {
	const cryptoApi = globalThis.crypto;
	if (!cryptoApi?.randomUUID) {
		throw new Error("crypto.randomUUID is required for annotation IDs");
	}
	return cryptoApi.randomUUID();
};

const getRectCorners = (
	p1: AnnotationPoint,
	p2: AnnotationPoint,
): { topLeft: AnnotationPoint; bottomRight: AnnotationPoint } => ({
	topLeft: {
		x: Math.min(p1.x, p2.x),
		y: Math.min(p1.y, p2.y),
	},
	bottomRight: {
		x: Math.max(p1.x, p2.x),
		y: Math.max(p1.y, p2.y),
	},
});

const createAnnotationMetadata = (
	sopInstanceUid: string | null,
	label = "",
) => ({
	color: DEFAULT_ANNOTATION_COLOR,
	label,
	...(sopInstanceUid ? { sopInstanceUid } : {}),
});

export const useAnnotation = (currentSopInstanceUid: string | null = null) => {
	const [annotations, setAnnotations] = useState<Annotation[]>([]);
	const [activePoints, setActivePoints] = useState<AnnotationPoint[]>([]);
	const [activeAnnotationTool, setActiveAnnotationTool] =
		useState<AnnotationToolType | null>(null);
	const [pendingTextPosition, setPendingTextPosition] =
		useState<AnnotationPoint | null>(null);

	const addPoint = useCallback(
		(point: AnnotationPoint) => {
			if (!activeAnnotationTool || pendingTextPosition) return;

			if (activeAnnotationTool === "text") {
				setPendingTextPosition(point);
				setActivePoints([]);
				return;
			}

			const id = createAnnotationId();

			setActivePoints((prev) => {
				const next = [...prev, point];
				if (next.length < 2) return next;

				const p1 = next[0] as AnnotationPoint;
				const p2 = next[1] as AnnotationPoint;

				if (activeAnnotationTool === "arrow") {
					const annotation: ArrowAnnotation = {
						id,
						type: "arrow",
						...createAnnotationMetadata(currentSopInstanceUid),
						start: p1,
						end: p2,
					};
					setAnnotations((items) => [...items, annotation]);
				} else if (activeAnnotationTool === "rect") {
					const { topLeft, bottomRight } = getRectCorners(p1, p2);
					const annotation: RectAnnotation = {
						id,
						type: "rect",
						...createAnnotationMetadata(currentSopInstanceUid),
						topLeft,
						bottomRight,
					};
					setAnnotations((items) => [...items, annotation]);
				} else if (activeAnnotationTool === "ellipse") {
					const annotation: EllipseAnnotation = {
						id,
						type: "ellipse",
						...createAnnotationMetadata(currentSopInstanceUid),
						center: {
							x: (p1.x + p2.x) / 2,
							y: (p1.y + p2.y) / 2,
						},
						radiusX: Math.abs(p2.x - p1.x) / 2,
						radiusY: Math.abs(p2.y - p1.y) / 2,
					};
					setAnnotations((items) => [...items, annotation]);
				}

				return [];
			});
		},
		[activeAnnotationTool, pendingTextPosition, currentSopInstanceUid],
	);

	const submitTextAnnotation = useCallback(
		(text: string) => {
			const trimmed = text.trim();
			if (!pendingTextPosition || trimmed.length === 0) {
				setPendingTextPosition(null);
				return;
			}

			const id = createAnnotationId();
			const annotation: TextAnnotation = {
				id,
				type: "text",
				...createAnnotationMetadata(currentSopInstanceUid, trimmed),
				position: pendingTextPosition,
				text: trimmed,
			};
			setAnnotations((items) => [...items, annotation]);
			setPendingTextPosition(null);
		},
		[pendingTextPosition, currentSopInstanceUid],
	);

	const cancelPendingText = useCallback(() => {
		setPendingTextPosition(null);
	}, []);

	const removeAnnotation = useCallback((id: string) => {
		setAnnotations((prev) => prev.filter((a) => a.id !== id));
	}, []);

	const restoreAnnotation = useCallback((annotation: Annotation) => {
		setAnnotations((prev) => {
			if (prev.some((item) => item.id === annotation.id)) return prev;
			return [...prev, annotation];
		});
	}, []);

	const clearAllAnnotations = useCallback(() => {
		setAnnotations([]);
		setActivePoints([]);
		setActiveAnnotationTool(null);
		setPendingTextPosition(null);
	}, []);

	const replaceAnnotations = useCallback((items: Annotation[]) => {
		setAnnotations(items);
		setActivePoints([]);
		setActiveAnnotationTool(null);
		setPendingTextPosition(null);
	}, []);

	const startTextTool = useCallback(() => {
		setActiveAnnotationTool("text");
		setActivePoints([]);
		setPendingTextPosition(null);
	}, []);

	const startArrowTool = useCallback(() => {
		setActiveAnnotationTool("arrow");
		setActivePoints([]);
		setPendingTextPosition(null);
	}, []);

	const startRectTool = useCallback(() => {
		setActiveAnnotationTool("rect");
		setActivePoints([]);
		setPendingTextPosition(null);
	}, []);

	const startEllipseTool = useCallback(() => {
		setActiveAnnotationTool("ellipse");
		setActivePoints([]);
		setPendingTextPosition(null);
	}, []);

	const cancelTool = useCallback(() => {
		setActiveAnnotationTool(null);
		setActivePoints([]);
		setPendingTextPosition(null);
	}, []);

	return {
		annotations,
		activePoints,
		activeAnnotationTool,
		pendingTextPosition,
		addPoint,
		submitTextAnnotation,
		cancelPendingText,
		removeAnnotation,
		restoreAnnotation,
		clearAllAnnotations,
		replaceAnnotations,
		startTextTool,
		startArrowTool,
		startRectTool,
		startEllipseTool,
		cancelTool,
	};
};
