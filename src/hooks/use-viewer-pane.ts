// 単一ペインのビューア状態管理フック
// DicomViewerから状態ロジックを抽出し、複数ペイン対応を実現
import { useCallback, useEffect, useMemo, useState } from "react";
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
import { calculateImageDirection } from "@/utils/image-direction";
import { containerToImageCoord } from "@/utils/measurement-math";

const PRELOAD_COUNT = 10;

export const useViewerPane = (paneId: string, files: DicomFileInfo[]) => {
	const [activeMode, setActiveMode] = useState<ViewerControlType>(
		VIEWER_CONTROL_TYPE.WW_WC,
	);
	const [showOverlay, setShowOverlay] = useState(true);
	const [showDirection, setShowDirection] = useState(true);
	const [isOsdReady, setIsOsdReady] = useState(false);

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
		? calculateImageDirection(currentFile.imageOrientationPatient)
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

	const measurement = useMeasurement(currentFile?.pixelSpacing ?? null);

	// 計測モード連動
	useEffect(() => {
		if (activeMode === VIEWER_CONTROL_TYPE.MEASURE_DISTANCE) {
			measurement.startDistanceTool();
		} else if (activeMode === VIEWER_CONTROL_TYPE.MEASURE_ANGLE) {
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
	]);

	// 計測モード時のクリックハンドラ
	const handleMeasurementClick = useCallback(
		(e: MouseEvent) => {
			if (
				activeMode !== VIEWER_CONTROL_TYPE.MEASURE_DISTANCE &&
				activeMode !== VIEWER_CONTROL_TYPE.MEASURE_ANGLE
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
				measurement.addPoint(imageCoord);
			}
		},
		[
			activeMode,
			containerId,
			getViewport,
			imageWidth,
			imageHeight,
			measurement.addPoint,
		],
	);

	// 計測クリックイベント登録
	useEffect(() => {
		if (!isOsdReady) return;
		if (
			activeMode !== VIEWER_CONTROL_TYPE.MEASURE_DISTANCE &&
			activeMode !== VIEWER_CONTROL_TYPE.MEASURE_ANGLE
		) {
			return;
		}
		const container = document.getElementById(containerId);
		if (!container) return;
		container.addEventListener("click", handleMeasurementClick);
		return () => container.removeEventListener("click", handleMeasurementClick);
	}, [isOsdReady, activeMode, containerId, handleMeasurementClick]);

	// マウスインタラクション
	useMouseInteraction({
		containerId,
		activeMode,
		onModeChange: setActiveMode,
		adjustWwWc: controls.adjustWwWc,
		zoomBy: controls.zoomBy,
		panBy: controls.panBy,
		onNextFrame: nextFrame,
		onPrevFrame: prevFrame,
		enabled: isOsdReady,
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
		loadAndDisplayImage(currentFile, { signal: controller.signal });
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
			onModeChange: setActiveMode,
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
			onSetWwWc: controls.setWwWc,
			isPlaying: cine.isPlaying,
			fps: cine.fps,
			onTogglePlay: cine.togglePlay,
			onIncreaseFps: cine.increaseFps,
			onDecreaseFps: cine.decreaseFps,
			onClearMeasurements: measurement.clearAll,
			hasMeasurements: measurement.measurements.length > 0,
			isInverted: worldInfo.invert,
		}),
		[
			activeMode,
			controls.fitSize,
			controls.oneToOneSize,
			controls.toggleInvert,
			resetImage,
			controls.rotate,
			controls.toggleFlipHorizontal,
			controls.toggleFlipVertical,
			showOverlay,
			showDirection,
			controls.setWwWc,
			cine.isPlaying,
			worldInfo.invert,
			cine.fps,
			cine.togglePlay,
			cine.increaseFps,
			cine.decreaseFps,
			measurement.clearAll,
			measurement.measurements,
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
		// 計測
		measurements: measurement.measurements,
		activePoints: measurement.activePoints,
		removeMeasurement: measurement.removeMeasurement,
		// 操作
		controls,
		cine,
		measurement,
		activeMode,
		setActiveMode,
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
