// 単一ペインのビューア状態管理フック
// DicomViewerから状態ロジックを抽出し、複数ペイン対応を実現
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAnnotation } from "@/hooks/use-annotation";
import { useCineMode } from "@/hooks/use-cine-mode";
import { useCornerstone } from "@/hooks/use-cornerstone";
import { useImageOverlay } from "@/hooks/use-image-overlay";
import { useMeasurement } from "@/hooks/use-measurement";
import { useMouseInteraction } from "@/hooks/use-mouse-interaction";
import { useOpenSeaDragon } from "@/hooks/use-open-sea-dragon";
import { useViewerControls } from "@/hooks/use-viewer-controls";
import { useViewerSlider } from "@/hooks/use-viewer-slider";
import type { DicomFileInfo } from "@/types/dicom";
import type { ViewerControlType } from "@/types/viewer";
import { VIEWER_CONTROL_TYPE } from "@/types/viewer";
import {
	getDicomFileSopInstanceUid,
	matchesSopInstanceUid,
} from "@/utils/annotation-storage";
import { calculateImageDirection, type Species } from "@/utils/image-direction";
import { containerToImageCoord } from "@/utils/measurement-math";

const PRELOAD_COUNT = 10;

export const useViewerPane = (paneId: string, files: DicomFileInfo[]) => {
	const [activeMode, setActiveMode] = useState<ViewerControlType>(
		VIEWER_CONTROL_TYPE.WW_WC,
	);
	const [showOverlay, setShowOverlay] = useState(true);
	const [showDirection, setShowDirection] = useState(true);
	const [species, setSpecies] = useState<Species>("equine");
	const [isOsdReady, setIsOsdReady] = useState(false);
	const [imageLoadError, setImageLoadError] = useState<string | null>(null);
	const isFreehandDraggingRef = useRef(false);
	const freehandPointerIdRef = useRef<number | null>(null);

	const {
		cornerstoneReady,
		currentImage,
		worldInfo,
		setWorldInfo,
		triggerRedraw,
		loadAndDisplayImage,
		setupTileDrawingBridge,
		registerImageData,
		unregisterImageData,
		clearAllImageData,
		preloadImage,
	} = useCornerstone();

	const { sliderState, setFrame, setMaxFrame, nextFrame, prevFrame } =
		useViewerSlider();

	const currentFile = files[sliderState.currentFrame] ?? null;
	const imageWidth = currentFile?.columns ?? 0;
	const imageHeight = currentFile?.rows ?? 0;
	const currentSopInstanceUid = getDicomFileSopInstanceUid(currentFile);

	const containerId = `osd-${paneId}`;

	const { initViewer, getViewport, tileReady, tileCanvasRef } =
		useOpenSeaDragon({
			containerId,
			imageWidth,
			imageHeight,
			onViewerCreated: (viewer) => {
				setupTileDrawingBridge(viewer);
				setIsOsdReady(true);
			},
			onViewerDestroyed: () => {
				setIsOsdReady(false);
			},
		});

	const overlayInfo = useImageOverlay(
		currentFile,
		worldInfo.windowWidth,
		worldInfo.windowCenter,
	);

	const directionInfo = currentFile
		? calculateImageDirection(currentFile.imageOrientationPatient, species)
		: null;

	const controls = useViewerControls({
		setWorldInfo,
		getViewport,
	});

	const cine = useCineMode({
		nextFrame,
		setFrame,
		maxFrame: sliderState.maxFrame,
		currentFrame: sliderState.currentFrame,
	});

	const measurement = useMeasurement(
		currentFile?.pixelSpacing ?? null,
		currentSopInstanceUid,
	);
	const annotation = useAnnotation(currentSopInstanceUid);
	const visibleMeasurements = useMemo(
		() =>
			measurement.measurements.filter((item) =>
				matchesSopInstanceUid(item.sopInstanceUid, currentSopInstanceUid),
			),
		[measurement.measurements, currentSopInstanceUid],
	);
	const visibleAnnotations = useMemo(
		() =>
			annotation.annotations.filter((item) =>
				matchesSopInstanceUid(item.sopInstanceUid, currentSopInstanceUid),
			),
		[annotation.annotations, currentSopInstanceUid],
	);

	const setViewerMode = useCallback(
		(mode: ViewerControlType) => {
			annotation.cancelTool();
			setActiveMode(mode);
		},
		[annotation.cancelTool],
	);

	// 計測モード連動
	useEffect(() => {
		if (activeMode === VIEWER_CONTROL_TYPE.MEASURE_DISTANCE) {
			annotation.cancelTool();
			measurement.startDistanceTool();
		} else if (activeMode === VIEWER_CONTROL_TYPE.MEASURE_ANGLE) {
			annotation.cancelTool();
			measurement.startAngleTool();
		} else if (measurement.activeTool) {
			measurement.cancelTool();
		}
	}, [
		activeMode,
		measurement.activeTool,
		measurement.startDistanceTool,
		measurement.startAngleTool,
		measurement.cancelTool,
		annotation.cancelTool,
	]);

	const addImagePointFromClick = useCallback(
		(e: MouseEvent) => {
			const isMeasurementMode =
				activeMode === VIEWER_CONTROL_TYPE.MEASURE_DISTANCE ||
				activeMode === VIEWER_CONTROL_TYPE.MEASURE_ANGLE;
			const isClickAnnotationMode =
				!!annotation.activeAnnotationTool &&
				annotation.activeAnnotationTool !== "freehand";
			if (
				!isClickAnnotationMode &&
				!annotation.pendingTextPosition &&
				!isMeasurementMode
			) {
				return;
			}
			const container = document.getElementById(containerId);
			if (!container) return;
			const rect = container.getBoundingClientRect();
			const viewport = getViewport();
			const imageCoord = containerToImageCoord(
				e.clientX,
				e.clientY,
				rect,
				imageWidth,
				imageHeight,
				viewport,
			);
			if (imageCoord) {
				if (isClickAnnotationMode || annotation.pendingTextPosition) {
					annotation.addPoint(imageCoord);
				} else {
					measurement.addPoint(imageCoord);
				}
			}
		},
		[
			activeMode,
			annotation.activeAnnotationTool,
			annotation.pendingTextPosition,
			annotation.addPoint,
			containerId,
			getViewport,
			imageWidth,
			imageHeight,
			measurement.addPoint,
		],
	);

	const getImagePointFromPointerEvent = useCallback(
		(e: PointerEvent) => {
			const container = document.getElementById(containerId);
			if (!container) return null;
			const rect = container.getBoundingClientRect();
			const viewport = getViewport();
			return containerToImageCoord(
				e.clientX,
				e.clientY,
				rect,
				imageWidth,
				imageHeight,
				viewport,
			);
		},
		[containerId, getViewport, imageWidth, imageHeight],
	);

	// 計測・注釈クリックイベント登録
	useEffect(() => {
		if (!isOsdReady) return;
		const isAnnotationMode =
			!!annotation.activeAnnotationTool || !!annotation.pendingTextPosition;
		if (
			!isAnnotationMode &&
			activeMode !== VIEWER_CONTROL_TYPE.MEASURE_DISTANCE &&
			activeMode !== VIEWER_CONTROL_TYPE.MEASURE_ANGLE
		) {
			return;
		}
		const container = document.getElementById(containerId);
		if (!container) return;
		container.addEventListener("click", addImagePointFromClick);
		return () => container.removeEventListener("click", addImagePointFromClick);
	}, [
		isOsdReady,
		activeMode,
		annotation.activeAnnotationTool,
		annotation.pendingTextPosition,
		containerId,
		addImagePointFromClick,
	]);

	// フリーハンド注釈はクリックではなくドラッグ中の pointer 座標を連続記録する。
	useEffect(() => {
		if (!isOsdReady || annotation.activeAnnotationTool !== "freehand") return;
		const container = document.getElementById(containerId);
		if (!container) return;

		const stopPointerEvent = (e: PointerEvent) => {
			e.preventDefault();
			e.stopPropagation();
		};

		const handlePointerDown = (e: PointerEvent) => {
			if (e.button !== 0 || e.isPrimary === false) return;
			const imageCoord = getImagePointFromPointerEvent(e);
			if (!imageCoord) return;

			stopPointerEvent(e);
			isFreehandDraggingRef.current = true;
			freehandPointerIdRef.current = e.pointerId;
			container.setPointerCapture?.(e.pointerId);
			annotation.beginFreehand(imageCoord);
		};

		const handlePointerMove = (e: PointerEvent) => {
			if (
				!isFreehandDraggingRef.current ||
				freehandPointerIdRef.current !== e.pointerId
			) {
				return;
			}
			const imageCoord = getImagePointFromPointerEvent(e);
			if (!imageCoord) return;

			stopPointerEvent(e);
			annotation.appendFreehandPoint(imageCoord);
		};

		const finishStroke = (e: PointerEvent) => {
			if (
				!isFreehandDraggingRef.current ||
				freehandPointerIdRef.current !== e.pointerId
			) {
				return;
			}

			stopPointerEvent(e);
			isFreehandDraggingRef.current = false;
			freehandPointerIdRef.current = null;
			container.releasePointerCapture?.(e.pointerId);
			const imageCoord = getImagePointFromPointerEvent(e);
			if (imageCoord) {
				annotation.appendFreehandPoint(imageCoord);
			}
			annotation.finishFreehand();
		};

		container.addEventListener("pointerdown", handlePointerDown, {
			capture: true,
		});
		container.addEventListener("pointermove", handlePointerMove, {
			capture: true,
		});
		container.addEventListener("pointerup", finishStroke, { capture: true });
		container.addEventListener("pointercancel", finishStroke, {
			capture: true,
		});

		return () => {
			isFreehandDraggingRef.current = false;
			freehandPointerIdRef.current = null;
			container.removeEventListener("pointerdown", handlePointerDown, {
				capture: true,
			});
			container.removeEventListener("pointermove", handlePointerMove, {
				capture: true,
			});
			container.removeEventListener("pointerup", finishStroke, {
				capture: true,
			});
			container.removeEventListener("pointercancel", finishStroke, {
				capture: true,
			});
		};
	}, [
		isOsdReady,
		annotation.activeAnnotationTool,
		annotation.beginFreehand,
		annotation.appendFreehandPoint,
		annotation.finishFreehand,
		containerId,
		getImagePointFromPointerEvent,
	]);

	const startTextTool = useCallback(() => {
		setActiveMode(VIEWER_CONTROL_TYPE.WW_WC);
		measurement.cancelTool();
		annotation.startTextTool();
	}, [annotation.startTextTool, measurement.cancelTool]);

	const startArrowTool = useCallback(() => {
		setActiveMode(VIEWER_CONTROL_TYPE.WW_WC);
		measurement.cancelTool();
		annotation.startArrowTool();
	}, [annotation.startArrowTool, measurement.cancelTool]);

	const startRectTool = useCallback(() => {
		setActiveMode(VIEWER_CONTROL_TYPE.WW_WC);
		measurement.cancelTool();
		annotation.startRectTool();
	}, [annotation.startRectTool, measurement.cancelTool]);

	const startEllipseTool = useCallback(() => {
		setActiveMode(VIEWER_CONTROL_TYPE.WW_WC);
		measurement.cancelTool();
		annotation.startEllipseTool();
	}, [annotation.startEllipseTool, measurement.cancelTool]);

	const startFreehandTool = useCallback(() => {
		setActiveMode(VIEWER_CONTROL_TYPE.WW_WC);
		measurement.cancelTool();
		annotation.startFreehandTool();
	}, [annotation.startFreehandTool, measurement.cancelTool]);

	// マウスインタラクション
	useMouseInteraction({
		containerId,
		activeMode,
		onModeChange: setViewerMode,
		adjustWwWc: controls.adjustWwWc,
		zoomBy: controls.zoomBy,
		panBy: controls.panBy,
		currentWindowWidth: worldInfo.windowWidth,
		onNextFrame: nextFrame,
		onPrevFrame: prevFrame,
		enabled:
			isOsdReady &&
			!annotation.activeAnnotationTool &&
			!annotation.pendingTextPosition,
	});

	// スライダー最大値設定（ファイル数変化時）
	useEffect(() => {
		setMaxFrame(Math.max(0, files.length - 1));
	}, [files.length, setMaxFrame]);

	// ファイルが完全に入れ替わった場合（最初のimageIdが変わった場合）はフレームリセット
	const firstImageId = files[0]?.imageId ?? "";
	// biome-ignore lint/correctness/useExhaustiveDependencies: firstImageId を変化検出トリガーとして意図的に使用
	useEffect(() => {
		setFrame(0);
	}, [firstImageId, setFrame]);

	// 現在フレーム変更時に画像読み込み
	useEffect(() => {
		if (!currentFile || !isOsdReady || !cornerstoneReady) return;
		const controller = new AbortController();
		setImageLoadError(null);
		Promise.resolve(
			loadAndDisplayImage(currentFile, { signal: controller.signal }),
		).then((success) => {
			if (controller.signal.aborted) return;
			setImageLoadError(
				success !== false
					? null
					: `${currentFile.fileName} の画像表示に失敗しました`,
			);
		});
		return () => {
			controller.abort();
		};
	}, [currentFile, isOsdReady, cornerstoneReady, loadAndDisplayImage]);

	// 画像プリロード
	useEffect(() => {
		if (!cornerstoneReady || !isOsdReady) return;
		const current = sliderState.currentFrame;
		for (let offset = 1; offset <= PRELOAD_COUNT; offset++) {
			const nextFile = files[current + offset];
			const prevFile = files[current - offset];
			if (nextFile) preloadImage(nextFile);
			if (prevFile) preloadImage(prevFile);
		}
	}, [
		sliderState.currentFrame,
		files,
		cornerstoneReady,
		isOsdReady,
		preloadImage,
	]);

	// tileReady + currentImage → OSD再描画 + ビューポートフィット
	useEffect(() => {
		if (tileReady && currentImage) {
			triggerRedraw();
			const viewport = getViewport();
			if (viewport) {
				viewport.fitBounds(viewport.getHomeBounds());
			}
		}
	}, [tileReady, currentImage, triggerRedraw, getViewport]);

	// ビューアリセット
	const resetImage = useCallback(() => {
		if (!currentFile) return;
		controls.resetImage(currentFile.windowWidth, currentFile.windowCenter);
	}, [controls, currentFile]);

	const handleFrameChange = useCallback(
		(frame: number) => setFrame(frame),
		[setFrame],
	);

	const handleThumbnailSelect = useCallback(
		(index: number) => setFrame(index),
		[setFrame],
	);

	// ControlPanelへ渡す props セット
	const controlPanelProps = useMemo(
		() => ({
			activeMode,
			onModeChange: setViewerMode,
			onFitSize: controls.fitSize,
			onOneToOne: controls.oneToOneSize,
			onToggleInvert: controls.toggleInvert,
			onReset: resetImage,
			onRotateCW: () => controls.rotate(90),
			onRotateCCW: () => controls.rotate(-90),
			onFlipH: controls.toggleFlipHorizontal,
			onFlipV: controls.toggleFlipVertical,
			showOverlay,
			onToggleOverlay: () => setShowOverlay((v) => !v),
			showDirection,
			onToggleDirection: () => setShowDirection((v) => !v),
			species,
			onToggleSpecies: () =>
				setSpecies((current) => (current === "equine" ? "human" : "equine")),
			onSetWwWc: controls.setWwWc,
			isPlaying: cine.isPlaying,
			fps: cine.fps,
			onTogglePlay: cine.togglePlay,
			onIncreaseFps: cine.increaseFps,
			onDecreaseFps: cine.decreaseFps,
			onClearMeasurements: measurement.clearAll,
			hasMeasurements: measurement.measurements.length > 0,
			activeAnnotationTool: annotation.activeAnnotationTool,
			onStartTextTool: startTextTool,
			onStartArrowTool: startArrowTool,
			onStartRectTool: startRectTool,
			onStartEllipseTool: startEllipseTool,
			onStartFreehandTool: startFreehandTool,
			onClearAnnotations: annotation.clearAllAnnotations,
			hasAnnotations: annotation.annotations.length > 0,
			isInverted: worldInfo.invert,
		}),
		[
			activeMode,
			setViewerMode,
			controls.fitSize,
			controls.oneToOneSize,
			controls.toggleInvert,
			resetImage,
			controls.rotate,
			controls.toggleFlipHorizontal,
			controls.toggleFlipVertical,
			showOverlay,
			showDirection,
			species,
			controls.setWwWc,
			cine.isPlaying,
			worldInfo.invert,
			cine.fps,
			cine.togglePlay,
			cine.increaseFps,
			cine.decreaseFps,
			measurement.clearAll,
			measurement.measurements,
			annotation.activeAnnotationTool,
			startTextTool,
			startArrowTool,
			startRectTool,
			startEllipseTool,
			startFreehandTool,
			annotation.clearAllAnnotations,
			annotation.annotations,
		],
	);

	return {
		// コンテナID
		containerId,
		// OSD / cornerstone
		initViewer,
		getViewport,
		tileReady,
		tileCanvasRef,
		isOsdReady,
		currentFile,
		imageWidth,
		imageHeight,
		cornerstoneReady,
		currentImage,
		imageLoadError,
		worldInfo,
		// スライダー
		sliderState,
		nextFrame,
		prevFrame,
		handleFrameChange,
		handleThumbnailSelect,
		// オーバーレイ・方向
		overlayInfo,
		directionInfo,
		showOverlay,
		showDirection,
		species,
		// 計測
		measurements: visibleMeasurements,
		allMeasurements: measurement.measurements,
		activePoints: measurement.activePoints,
		removeMeasurement: measurement.removeMeasurement,
		restoreMeasurement: measurement.restoreMeasurement,
		annotations: visibleAnnotations,
		allAnnotations: annotation.annotations,
		activeAnnotationPoints: annotation.activePoints,
		activeAnnotationTool: annotation.activeAnnotationTool,
		pendingTextPosition: annotation.pendingTextPosition,
		removeAnnotation: annotation.removeAnnotation,
		restoreAnnotation: annotation.restoreAnnotation,
		submitTextAnnotation: annotation.submitTextAnnotation,
		cancelPendingText: annotation.cancelPendingText,
		// 操作
		controls,
		cine,
		measurement,
		annotation,
		activeMode,
		setActiveMode: setViewerMode,
		// データ管理
		registerImageData,
		unregisterImageData,
		clearAllImageData,
		// ControlPanel props
		controlPanelProps,
		// Cine shortcut helpers
		toggleCinePlay: cine.togglePlay,
		// Keyboard shortcut helpers
		resetImage,
	};
};

export type ViewerPaneHandle = ReturnType<typeof useViewerPane>;
