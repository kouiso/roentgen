// メインビューア全体コンポーネント
// ControlPanel + StackView + Overlay + Direction + Slider + Thumbnail を統合
// OSD初期化 → cornerstoneブリッジ接続 → DICOM画像表示の流れを管理
import { useCallback, useEffect, useState } from "react";
import type { DicomFileInfo } from "@/types/dicom";
import type { ViewerControlType } from "@/types/viewer";
import { VIEWER_CONTROL_TYPE } from "@/types/viewer";
import { useCornerstone } from "@/hooks/useCornerstone";
import { useImageOverlay } from "@/hooks/useImageOverlay";
import { useOpenSeaDragon } from "@/hooks/useOpenSeaDragon";
import { useViewerControls } from "@/hooks/useViewerControls";
import { useMouseInteraction } from "@/hooks/useMouseInteraction";
import { useViewerSlider } from "@/hooks/useViewerSlider";
import { calculateImageDirection } from "@/utils/image-direction";
import { ControlPanel } from "./ControlPanel";
import { ImageDirection } from "./ImageDirection";
import { ImageOverlay } from "./ImageOverlay";
import { StackSlider } from "./StackSlider";
import { StackView } from "./StackView";
import { ThumbnailPanel } from "./ThumbnailPanel";

type DicomViewerProps = {
	files: DicomFileInfo[];
};

export const DicomViewer = ({ files }: DicomViewerProps) => {
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
	} = useCornerstone();

	const {
		sliderState,
		setFrame,
		setMaxFrame,
		nextFrame,
		prevFrame,
	} = useViewerSlider();

	const currentFile = files[sliderState.currentFrame] ?? null;

	// 現在画像の寸法（OSD TileSource用）
	const imageWidth = currentFile?.columns ?? 0;
	const imageHeight = currentFile?.rows ?? 0;

	// OSD初期化
	const { initViewer, getViewport, tileReady } = useOpenSeaDragon({
		containerId: "osd-viewer",
		imageWidth,
		imageHeight,
		onViewerCreated: (viewer) => {
			setupTileDrawingBridge(viewer);
			setIsOsdReady(true);
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
		worldInfo,
		setWorldInfo,
		triggerRedraw,
		getViewport,
	});

	// マウスインタラクション（WW/WCドラッグ + モード切替 + ホイールフレーム切替）
	useMouseInteraction({
		containerId: "osd-viewer",
		activeMode,
		onModeChange: setActiveMode,
		adjustWwWc: controls.adjustWwWc,
		onNextFrame: nextFrame,
		onPrevFrame: prevFrame,
		enabled: isOsdReady,
	});

	// ファイルの画像データをcornerstoneのimageLoaderに登録
	useEffect(() => {
		for (const file of files) {
			registerImageData(
				file.imageId.replace("roentgen:", ""),
				file.rawData,
			);
		}
	}, [files, registerImageData]);

	// スライダー最大値設定
	useEffect(() => {
		setMaxFrame(Math.max(0, files.length - 1));
	}, [files.length, setMaxFrame]);

	// OSDビューア初期化（StackViewマウント後）
	const handleViewerReady = useCallback(() => {
		initViewer();
	}, [initViewer]);

	// 現在フレーム変更時に画像読み込み（OSDとcornerstone両方の初期化完了が必要）
	useEffect(() => {
		if (!currentFile || !isOsdReady || !cornerstoneReady) return;
		loadAndDisplayImage(currentFile);
	}, [currentFile, isOsdReady, cornerstoneReady, loadAndDisplayImage]);

	// タイル読込完了 + cornerstone画像準備完了 → OSD再描画トリガー
	// needsDraw()はタイル読込後でないとimageLoader.clear()→abort循環に陥る
	useEffect(() => {
		if (tileReady && currentImage) {
			triggerRedraw();
		}
	}, [tileReady, currentImage, triggerRedraw]);

	const handleFrameChange = useCallback(
		(frame: number) => {
			setFrame(frame);
		},
		[setFrame],
	);

	const handleThumbnailSelect = useCallback(
		(index: number) => {
			setFrame(index);
		},
		[setFrame],
	);

	const handleReset = useCallback(() => {
		if (!currentFile) return;
		controls.resetImage(currentFile.windowWidth, currentFile.windowCenter);
	}, [controls, currentFile]);

	return (
		<div className="flex flex-1 flex-col">
			<ControlPanel
				activeMode={activeMode}
				onModeChange={setActiveMode}
				onFitSize={controls.fitSize}
				onOneToOne={controls.oneToOneSize}
				onToggleInvert={controls.toggleInvert}
				onReset={handleReset}
				onRotateCW={() => controls.rotate(90)}
				onRotateCCW={() => controls.rotate(-90)}
				onFlipH={controls.toggleFlipHorizontal}
				onFlipV={controls.toggleFlipVertical}
				showOverlay={showOverlay}
				onToggleOverlay={() => setShowOverlay((v) => !v)}
				showDirection={showDirection}
				onToggleDirection={() => setShowDirection((v) => !v)}
			/>

			<div className="flex min-h-0 flex-1">
				<div className="relative flex flex-1 flex-col">
					<div className="relative flex-1">
						<StackView
							containerId="osd-viewer"
							onViewerReady={handleViewerReady}
						/>
						<ImageOverlay
							overlayInfo={overlayInfo}
							visible={showOverlay}
						/>
						<ImageDirection
							directionInfo={directionInfo}
							visible={showDirection}
						/>
					</div>

					<StackSlider
						currentFrame={sliderState.currentFrame}
						maxFrame={sliderState.maxFrame}
						onFrameChange={handleFrameChange}
						onNext={nextFrame}
						onPrev={prevFrame}
					/>
				</div>

				<ThumbnailPanel
					files={files}
					currentIndex={sliderState.currentFrame}
					onSelect={handleThumbnailSelect}
				/>
			</div>
		</div>
	);
};
