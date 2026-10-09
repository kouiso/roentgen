// 単一ペインのビューア状態管理フック
// DicomViewerから状態ロジックを抽出し、複数ペイン対応を実現
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAnnotation } from "@/hooks/use-annotation";
import { useCineMode } from "@/hooks/use-cine-mode";
import { useCornerstone } from "@/hooks/use-cornerstone";
import { useDirectionSpecies } from "@/hooks/use-direction-species";
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
import { resolveImageDirection } from "@/utils/image-direction";
import {
	createImageGeometry,
	getDisplaySize,
	getPixelAspect,
} from "@/utils/image-geometry";
import { containerToImageCoord } from "@/utils/measurement-math";

const PRELOAD_COUNT = 10;

export const useViewerPane = (paneId: string, files: DicomFileInfo[]) => {
	// 写真ビューアと同じ「ドラッグで動かす・ホイールで拡大」を既定にする。
	// 明るさはドラッグではなくパネルのスライダーで変える（誤操作で画像が真っ白/真っ黒にならないように）
	const [activeMode, setActiveMode] = useState<ViewerControlType>(
		VIEWER_CONTROL_TYPE.PAN,
	);
	// 装置の撮影パラメータ一覧は飼い主には読めない情報なので、必要な人だけが出す
	const [showOverlay, setShowOverlay] = useState(false);
	const [showDirection, setShowDirection] = useState(true);
	const { species, toggleSpecies } = useDirectionSpecies();
	const [isOsdReady, setIsOsdReady] = useState(false);
	const [imageLoadError, setImageLoadError] = useState<string | null>(null);
	const loadedFileRef = useRef<DicomFileInfo | null>(null);
	const isFreehandDraggingRef = useRef(false);
	const freehandPointerIdRef = useRef<number | null>(null);

	const {
		cornerstoneReady,
		currentImage,
		initialWindow,
		worldInfo,
		setWorldInfo,
		triggerRedraw,
		loadAndDisplayImage,
		setupTileDrawingBridge,
		detachTileDrawingBridge,
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

	// 計測・注釈は常に元画像のピクセル座標で保存し、表示時だけこの幾何で変換する
	const pixelAspect = getPixelAspect(currentFile?.pixelSpacing);
	const geometry = useMemo(
		() =>
			createImageGeometry(imageWidth, imageHeight, {
				pixelAspect,
				rotation: worldInfo.rotation,
				flipHorizontal: worldInfo.flipHorizontal,
				flipVertical: worldInfo.flipVertical,
			}),
		[
			imageWidth,
			imageHeight,
			pixelAspect,
			worldInfo.rotation,
			worldInfo.flipHorizontal,
			worldInfo.flipVertical,
		],
	);
	const displaySize = getDisplaySize(geometry);

	const { initViewer, getViewport, tileReady, tileCanvasRef, viewerRef } =
		useOpenSeaDragon({
			containerId,
			imageWidth: displaySize.width,
			imageHeight: displaySize.height,
			onViewerCreated: (viewer) => {
				setupTileDrawingBridge(viewer);
				setIsOsdReady(true);
			},
			onViewerDestroyed: () => {
				detachTileDrawingBridge();
				setIsOsdReady(false);
			},
		});

	const overlayInfo = useImageOverlay(
		currentFile,
		worldInfo.windowWidth,
		worldInfo.windowCenter,
	);

	const directionInfo = useMemo(
		() =>
			currentFile
				? resolveImageDirection(currentFile, species, {
						rotation: worldInfo.rotation,
						flipHorizontal: worldInfo.flipHorizontal,
						flipVertical: worldInfo.flipVertical,
					})
				: null,
		[
			currentFile,
			species,
			worldInfo.rotation,
			worldInfo.flipHorizontal,
			worldInfo.flipVertical,
		],
	);

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
				geometry,
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
			geometry,
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
				geometry,
			);
		},
		[containerId, getViewport, imageWidth, imageHeight, geometry],
	);

	// 計測・注釈クリックイベント登録
	useEffect(() => {
		if (!isOsdReady) return;
		const isMeasurementMode =
			activeMode === VIEWER_CONTROL_TYPE.MEASURE_DISTANCE ||
			activeMode === VIEWER_CONTROL_TYPE.MEASURE_ANGLE;
		const isAnnotationMode =
			!!annotation.activeAnnotationTool || !!annotation.pendingTextPosition;
		if (!isAnnotationMode && !isMeasurementMode) return;
		// For measurement mode, wait until activeTool is propagated — addPoint returns
		// early if activeTool is null, so setting data-measurement-ready before that
		// causes the first E2E click to silently drop the point.
		if (isMeasurementMode && !measurement.activeTool) return;
		// Wait for image dimensions — containerToImageCoord returns null when either is 0.
		if (imageWidth === 0 || imageHeight === 0) return;
		const container = document.getElementById(containerId);
		if (!container) return;
		container.addEventListener("click", addImagePointFromClick);
		container.setAttribute("data-measurement-ready", "true");
		return () => {
			container.removeEventListener("click", addImagePointFromClick);
			container.removeAttribute("data-measurement-ready");
		};
	}, [
		isOsdReady,
		activeMode,
		annotation.activeAnnotationTool,
		annotation.pendingTextPosition,
		containerId,
		addImagePointFromClick,
		imageWidth,
		imageHeight,
		measurement.activeTool,
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
		setActiveMode(VIEWER_CONTROL_TYPE.PAN);
		measurement.cancelTool();
		annotation.startTextTool();
	}, [annotation.startTextTool, measurement.cancelTool]);

	const startArrowTool = useCallback(() => {
		setActiveMode(VIEWER_CONTROL_TYPE.PAN);
		measurement.cancelTool();
		annotation.startArrowTool();
	}, [annotation.startArrowTool, measurement.cancelTool]);

	const startRectTool = useCallback(() => {
		setActiveMode(VIEWER_CONTROL_TYPE.PAN);
		measurement.cancelTool();
		annotation.startRectTool();
	}, [annotation.startRectTool, measurement.cancelTool]);

	const startEllipseTool = useCallback(() => {
		setActiveMode(VIEWER_CONTROL_TYPE.PAN);
		measurement.cancelTool();
		annotation.startEllipseTool();
	}, [annotation.startEllipseTool, measurement.cancelTool]);

	const startFreehandTool = useCallback(() => {
		setActiveMode(VIEWER_CONTROL_TYPE.PAN);
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
		wheelZooms: files.length <= 1,
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
		// 90°回転では表示タイルの縦横が入れ替わるため OSD ビューアが作り直される。
		// 同じ画像を読み直すと明るさ調整が初期値に戻ってしまうので、読込済みなら再利用する。
		if (loadedFileRef.current === currentFile) return;
		const controller = new AbortController();
		setImageLoadError(null);
		Promise.resolve(
			loadAndDisplayImage(currentFile, { signal: controller.signal }),
		).then((success) => {
			if (controller.signal.aborted) return;
			loadedFileRef.current = success !== false ? currentFile : null;
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
		controls.resetImage(
			initialWindow?.ww ?? currentFile.windowWidth,
			initialWindow?.wc ?? currentFile.windowCenter,
		);
	}, [controls, currentFile, initialWindow]);

	const autoContrast = useCallback(() => {
		if (!initialWindow) return;
		controls.setWwWc(initialWindow.ww, initialWindow.wc);
	}, [controls, initialWindow]);

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
			onToggleSpecies: toggleSpecies,
			onSetWwWc: controls.setWwWc,
			onAutoContrast: autoContrast,
			baseWW: initialWindow?.ww,
			baseWC: initialWindow?.wc,
			photometricInterpretation: currentFile?.photometricInterpretation,
			currentWW: worldInfo.windowWidth,
			currentWC: worldInfo.windowCenter,
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
			toggleSpecies,
			controls.setWwWc,
			autoContrast,
			initialWindow,
			currentFile?.photometricInterpretation,
			worldInfo.windowWidth,
			worldInfo.windowCenter,
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
		viewerRef,
		tileReady,
		tileCanvasRef,
		isOsdReady,
		currentFile,
		imageWidth,
		imageHeight,
		geometry,
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
