// メインビューア全体コンポーネント
// ControlPanel + StackView + Overlay + Direction + Slider + Thumbnail を統合
// OSD初期化 → cornerstoneブリッジ接続 → DICOM画像表示の流れを管理
import { useCallback, useEffect, useState } from "react";
import { useCornerstone } from "@/hooks/useCornerstone";
import { useImageOverlay } from "@/hooks/useImageOverlay";
import { useMouseInteraction } from "@/hooks/useMouseInteraction";
import { useOpenSeaDragon } from "@/hooks/useOpenSeaDragon";
import { useViewerControls } from "@/hooks/useViewerControls";
import { useViewerSlider } from "@/hooks/useViewerSlider";
import type { DicomFileInfo } from "@/types/dicom";
import type { ViewerControlType } from "@/types/viewer";
import { VIEWER_CONTROL_TYPE } from "@/types/viewer";
import { calculateImageDirection } from "@/utils/image-direction";
import { ControlPanel } from "./ControlPanel";
import { ImageDirection } from "./ImageDirection";
import { ImageOverlay } from "./ImageOverlay";
import { StackSlider } from "./StackSlider";
import { StackView } from "./StackView";
import { ThumbnailPanel } from "./ThumbnailPanel";

const PRELOAD_COUNT = 10;

type DicomViewerProps = {
	files: DicomFileInfo[];
	onClearAll: () => void;
	onRemoveFile: (index: number) => void;
	setImageDataRegistrar: (
		fn: (path: string, data: ArrayBuffer) => void,
	) => void;
};

export const DicomViewer = ({
	files,
	onClearAll,
	onRemoveFile,
	setImageDataRegistrar,
}: DicomViewerProps) => {
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

	// cornerstoneのimageDataMap登録関数をloaderに接続
	// ロード時にrawDataが直接cornerstoneに登録される
	useEffect(() => {
		setImageDataRegistrar(registerImageData);
	}, [setImageDataRegistrar, registerImageData]);

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

	// 画像プリロード — 現在フレームの前後PRELOAD_COUNTフレームを先読み
	useEffect(() => {
		if (!cornerstoneReady || !isOsdReady) return;

		const current = sliderState.currentFrame;
		for (let offset = 1; offset <= PRELOAD_COUNT; offset++) {
			const nextIdx = current + offset;
			const prevIdx = current - offset;
			const nextFile = files[nextIdx];
			const prevFile = files[prevIdx];
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

	// タイル読込完了 + cornerstone画像準備完了 → OSD再描画トリガー
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

	// 全ファイルクリア — imageDataMapも解放
	const handleClearAll = useCallback(() => {
		clearAllImageData();
		onClearAll();
	}, [clearAllImageData, onClearAll]);

	// 選択画像クリア — 現在表示中の画像を除去 + imageDataMap解放
	const handleClearSelected = useCallback(() => {
		const file = files[sliderState.currentFrame];
		if (file) {
			// imageId "roentgen:{path}" からパスを抽出
			const filePath = file.imageId.replace("roentgen:", "");
			unregisterImageData(filePath);
		}
		onRemoveFile(sliderState.currentFrame);
	}, [onRemoveFile, unregisterImageData, files, sliderState.currentFrame]);

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
				onClearSelected={handleClearSelected}
				onClearAll={handleClearAll}
			/>

			<div className="flex min-h-0 flex-1">
				<div className="relative flex flex-1 flex-col">
					<div className="relative flex-1">
						<StackView
							containerId="osd-viewer"
							onViewerReady={handleViewerReady}
						/>
						<ImageOverlay overlayInfo={overlayInfo} visible={showOverlay} />
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
