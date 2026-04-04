// メインビューア全体コンポーネント（複数ペインレイアウト対応版）
// useViewerPane × 4 + ViewerLayout + 共有 ControlPanel の構成
import { useCallback, useEffect, useMemo, useState } from "react";
import { WW_WC_PRESETS } from "@/constants/ww-wc-presets";
import { useKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts";
import { useViewerLayout } from "@/hooks/use-viewer-layout";
import { useViewerPane } from "@/hooks/use-viewer-pane";
import type { DicomFileInfo } from "@/types/dicom";
import { LAYOUT_PANE_COUNT } from "@/types/layout";
import { VIEWER_CONTROL_TYPE } from "@/types/viewer";
import { getAllSeries, groupByStudySeries } from "@/utils/study-grouper";
import { ControlPanel } from "./control-panel";
import { ViewerLayout } from "./viewer-layout";
import { ViewerPane } from "./viewer-pane";

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
	const { layout, setLayout } = useViewerLayout();
	const [activePaneIndex, setActivePaneIndex] = useState(0);
	const [isFullscreen, setIsFullscreen] = useState(false);

	const paneCount = LAYOUT_PANE_COUNT[layout];

	// Study/Series グルーピング → ペイン用ファイルリスト
	const studies = useMemo(() => groupByStudySeries(files), [files]);
	const seriesList = useMemo(() => getAllSeries(studies), [studies]);

	// 1x1: pane0 = 全ファイル / マルチペイン: pane i = series i のファイル
	const paneFiles = useMemo<
		[DicomFileInfo[], DicomFileInfo[], DicomFileInfo[], DicomFileInfo[]]
	>(() => {
		if (paneCount === 1) {
			return [files, [], [], []];
		}
		return [0, 1, 2, 3].map((i) => seriesList[i]?.files ?? []) as [
			DicomFileInfo[],
			DicomFileInfo[],
			DicomFileInfo[],
			DicomFileInfo[],
		];
	}, [paneCount, files, seriesList]);

	// 4ペイン固定（React hooksはループ不可のため常時生成、未使用ペインはfiles=[]）
	const pane0 = useViewerPane("pane-0", paneFiles[0]);
	const pane1 = useViewerPane("pane-1", paneFiles[1]);
	const pane2 = useViewerPane("pane-2", paneFiles[2]);
	const pane3 = useViewerPane("pane-3", paneFiles[3]);
	const allPanes = useMemo(
		() => [pane0, pane1, pane2, pane3],
		[pane0, pane1, pane2, pane3],
	);
	const activePane = allPanes[activePaneIndex] ?? pane0;

	// レイアウト変更時にアクティブペインをリセット（範囲外になった場合）
	useEffect(() => {
		if (activePaneIndex >= paneCount) {
			setActivePaneIndex(0);
		}
	}, [paneCount, activePaneIndex]);

	// imageDataRegistrar 接続（共有マップなのでpane0代表で登録）
	useEffect(() => {
		setImageDataRegistrar(pane0.registerImageData);
	}, [setImageDataRegistrar, pane0.registerImageData]);

	// フルスクリーン状態追跡
	useEffect(() => {
		const handler = () => setIsFullscreen(!!document.fullscreenElement);
		document.addEventListener("fullscreenchange", handler);
		return () => document.removeEventListener("fullscreenchange", handler);
	}, []);

	const toggleFullscreen = useCallback(() => {
		if (document.fullscreenElement) {
			document.exitFullscreen();
		} else {
			document.documentElement.requestFullscreen();
		}
	}, []);

	// スクリーンショット（アクティブペインのcanvasから取得）
	const handleScreenshot = useCallback(() => {
		const canvas = activePane.tileCanvasRef?.current;
		if (!canvas) return;
		const dataUrl = canvas.toDataURL("image/png");
		const api = (
			window as {
				electronAPI?: {
					saveScreenshot?: (dataUrl: string) => Promise<boolean>;
				};
			}
		).electronAPI;
		if (api?.saveScreenshot) {
			api.saveScreenshot(dataUrl);
		} else {
			const link = document.createElement("a");
			link.download = `roentgen-${Date.now()}.png`;
			link.href = dataUrl;
			link.click();
		}
	}, [activePane.tileCanvasRef]);

	// WW/WCプリセット適用（アクティブペイン）
	const handleSetWwWcPreset = useCallback(
		(index: number) => {
			const preset = WW_WC_PRESETS[index];
			if (preset) activePane.controls.setWwWc(preset.ww, preset.wc);
		},
		[activePane.controls.setWwWc],
	);

	// 全ファイルクリア
	const handleClearAll = useCallback(() => {
		pane0.clearAllImageData();
		onClearAll();
	}, [pane0.clearAllImageData, onClearAll]);

	// 選択画像クリア（アクティブペインの現在ファイルを全体リストから削除）
	const handleClearSelected = useCallback(() => {
		const file = activePane.currentFile;
		if (file) {
			const filePath = file.imageId.replace("roentgen:", "");
			pane0.unregisterImageData(filePath);
			const globalIdx = files.findIndex((f) => f.imageId === file.imageId);
			if (globalIdx !== -1) onRemoveFile(globalIdx);
		}
	}, [activePane.currentFile, files, pane0.unregisterImageData, onRemoveFile]);

	// キーボードショートカット（アクティブペインに適用）
	const shortcutActions = useMemo(
		() => ({
			nextFrame: activePane.nextFrame,
			prevFrame: activePane.prevFrame,
			setModeWwWc: () => activePane.setActiveMode(VIEWER_CONTROL_TYPE.WW_WC),
			setModeZoom: () => activePane.setActiveMode(VIEWER_CONTROL_TYPE.ZOOM),
			setModePan: () => activePane.setActiveMode(VIEWER_CONTROL_TYPE.PAN),
			fitSize: activePane.controls.fitSize,
			toggleInvert: activePane.controls.toggleInvert,
			resetImage: activePane.resetImage,
			toggleCinePlay: activePane.toggleCinePlay,
			setWwWcPreset: handleSetWwWcPreset,
			toggleFullscreen,
			setModeMeasureDistance: () =>
				activePane.setActiveMode(VIEWER_CONTROL_TYPE.MEASURE_DISTANCE),
			setModeMeasureAngle: () =>
				activePane.setActiveMode(VIEWER_CONTROL_TYPE.MEASURE_ANGLE),
			clearMeasurements: activePane.measurement.clearAll,
		}),
		[
			activePane.nextFrame,
			activePane.prevFrame,
			activePane.setActiveMode,
			activePane.controls.fitSize,
			activePane.controls.toggleInvert,
			activePane.resetImage,
			activePane.toggleCinePlay,
			handleSetWwWcPreset,
			toggleFullscreen,
			activePane.measurement.clearAll,
		],
	);

	useKeyboardShortcuts(shortcutActions, activePane.isOsdReady);

	return (
		<div className="flex flex-1 flex-col">
			<ControlPanel
				{...activePane.controlPanelProps}
				onClearSelected={handleClearSelected}
				onClearAll={handleClearAll}
				onScreenshot={handleScreenshot}
				isFullscreen={isFullscreen}
				onToggleFullscreen={toggleFullscreen}
				layout={layout}
				onSetLayout={setLayout}
			/>

			<ViewerLayout layout={layout}>
				{allPanes.slice(0, paneCount).map((pane, i) => (
					<ViewerPane
						key={pane.containerId}
						pane={pane}
						files={paneFiles[i] ?? []}
						isActive={i === activePaneIndex}
						onFocus={() => setActivePaneIndex(i)}
					/>
				))}
			</ViewerLayout>
		</div>
	);
};
