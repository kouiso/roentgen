// メインビューア全体コンポーネント（複数ペインレイアウト対応版）
// useViewerPane × 4 + ViewerLayout + 右サイドToolPanel の構成
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { WW_WC_PRESETS } from "@/constants/ww-wc-presets";
import { useKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts";
import { useViewerLayout } from "@/hooks/use-viewer-layout";
import { useViewerPane } from "@/hooks/use-viewer-pane";
import type { Annotation } from "@/types/annotation";
import type { DicomFileInfo } from "@/types/dicom";
import { LAYOUT_PANE_COUNT, LAYOUT_TYPE } from "@/types/layout";
import type { Measurement } from "@/types/measurement";
import { VIEWER_CONTROL_TYPE } from "@/types/viewer";
import {
	type AnnotationStorageState,
	createAnnotationStoragePayload,
	createEmptyAnnotationStorageState,
	deserializeAnnotationStorage,
	getDicomFileSopInstanceUid,
} from "@/utils/annotation-storage";
import { compositeCanvasWithOverlays } from "@/utils/composite-canvas";
import { runBooleanExportWithFallback } from "@/utils/export-fallback";
import {
	buildPrintImageMetadata,
	createPrintImageHtml,
} from "@/utils/print-image";
import { getAllSeries, groupByStudySeries } from "@/utils/study-grouper";
import { StatusBar } from "./status-bar";
import { ToolPanel } from "./tool-panel";
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

const SAVE_DEBOUNCE_MS = 1000;

export type AnnotationSaveStatus = "idle" | "pending" | "saved" | "error";

export const AnnotationSaveStatusBadge = ({
	status,
}: {
	status: AnnotationSaveStatus;
}) => {
	if (status === "idle") return null;

	const config = {
		pending: {
			label: "注釈を保存中",
			className: "border-sky-400/20 bg-sky-950/50 text-sky-200",
		},
		saved: {
			label: "注釈を保存しました",
			className: "border-emerald-400/20 bg-emerald-950/50 text-emerald-200",
		},
		error: {
			label: "注釈の保存に失敗しました",
			className: "border-rose-400/25 bg-rose-950/60 text-rose-200",
		},
	}[status];

	return (
		<div
			className={`pointer-events-none absolute left-3 top-3 z-40 rounded border px-2.5 py-1 text-[11px] shadow-lg ${config.className}`}
			role="status"
			aria-live="polite"
		>
			{config.label}
		</div>
	);
};

const getPrimaryStudyInstanceUid = (files: DicomFileInfo[]): string | null => {
	for (const file of files) {
		if (file.studyInstanceUID) return file.studyInstanceUID;
	}
	return null;
};

const getSopInstanceUidSet = (files: DicomFileInfo[]): Set<string> => {
	const sopInstanceUids = new Set<string>();
	for (const file of files) {
		const sopInstanceUid = getDicomFileSopInstanceUid(file);
		if (sopInstanceUid) sopInstanceUids.add(sopInstanceUid);
	}
	return sopInstanceUids;
};

const filterAnnotationsForFiles = (
	annotations: Annotation[],
	files: DicomFileInfo[],
): Annotation[] => {
	const sopInstanceUids = getSopInstanceUidSet(files);
	if (sopInstanceUids.size === 0) return [];
	return annotations.filter(
		(annotation) =>
			!annotation.sopInstanceUid ||
			sopInstanceUids.has(annotation.sopInstanceUid),
	);
};

const filterMeasurementsForFiles = (
	measurements: Measurement[],
	files: DicomFileInfo[],
): Measurement[] => {
	const sopInstanceUids = getSopInstanceUidSet(files);
	if (sopInstanceUids.size === 0) return [];
	return measurements.filter(
		(measurement) =>
			!measurement.sopInstanceUid ||
			sopInstanceUids.has(measurement.sopInstanceUid),
	);
};

const openBrowserPrintWindow = (html: string) => {
	const printWindow = window.open("", "_blank", "width=960,height=720");
	if (!printWindow) return;
	printWindow.document.open();
	printWindow.document.write(html);
	printWindow.document.close();
	window.setTimeout(() => {
		printWindow.focus();
		printWindow.print();
	}, 100);
};

const saveScreenshotInBrowser = (dataUrl: string) => {
	const link = document.createElement("a");
	link.download = `roentgen-${Date.now()}.png`;
	link.href = dataUrl;
	link.click();
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
	const [loadedStorage, setLoadedStorage] =
		useState<AnnotationStorageState | null>(null);
	const [storageReadyStudyUid, setStorageReadyStudyUid] = useState<
		string | null
	>(null);
	const [annotationSaveStatus, setAnnotationSaveStatus] =
		useState<AnnotationSaveStatus>("idle");
	const [syncWwWc, setSyncWwWc] = useState(false);
	const [syncZoom, setSyncZoom] = useState(false);

	const paneCount = LAYOUT_PANE_COUNT[layout];
	const studyInstanceUid = useMemo(
		() => getPrimaryStudyInstanceUid(files),
		[files],
	);

	// Study/Series グルーピング → ペイン用ファイルリスト
	const studies = useMemo(() => groupByStudySeries(files), [files]);
	const seriesList = useMemo(() => getAllSeries(studies), [studies]);

	// 複数シリーズ検出時に1回だけ2x1レイアウトへ自動切替（ユーザー操作後は介入しない）
	const hasAutoLayouted = useRef(false);
	useEffect(() => {
		if (!hasAutoLayouted.current && seriesList.length >= 2) {
			hasAutoLayouted.current = true;
			setLayout(LAYOUT_TYPE.TWO_BY_ONE);
		}
	}, [seriesList.length, setLayout]);

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

	// Study単位の注釈・計測を読み込み
	useEffect(() => {
		setStorageReadyStudyUid(null);
		setAnnotationSaveStatus("idle");
		if (!studyInstanceUid) {
			setLoadedStorage(null);
			return;
		}

		let cancelled = false;
		const api = window.electronAPI;
		if (!api?.loadAnnotations) {
			setLoadedStorage(createEmptyAnnotationStorageState(studyInstanceUid));
			return;
		}

		api
			.loadAnnotations(studyInstanceUid)
			.then((data) => {
				if (cancelled) return;
				setLoadedStorage(deserializeAnnotationStorage(studyInstanceUid, data));
			})
			.catch((err: unknown) => {
				if (cancelled) return;
				console.warn("[annotations] 読込失敗", err);
				setLoadedStorage(createEmptyAnnotationStorageState(studyInstanceUid));
			});

		return () => {
			cancelled = true;
		};
	}, [studyInstanceUid]);

	// 読み込んだStudyデータを各ペインの担当ファイルへ復元
	useEffect(() => {
		if (
			!studyInstanceUid ||
			loadedStorage?.studyInstanceUid !== studyInstanceUid
		)
			return;

		pane0.annotation.replaceAnnotations(
			filterAnnotationsForFiles(loadedStorage.annotations, paneFiles[0]),
		);
		pane0.measurement.replaceMeasurements(
			filterMeasurementsForFiles(loadedStorage.measurements, paneFiles[0]),
		);
		pane1.annotation.replaceAnnotations(
			filterAnnotationsForFiles(loadedStorage.annotations, paneFiles[1]),
		);
		pane1.measurement.replaceMeasurements(
			filterMeasurementsForFiles(loadedStorage.measurements, paneFiles[1]),
		);
		pane2.annotation.replaceAnnotations(
			filterAnnotationsForFiles(loadedStorage.annotations, paneFiles[2]),
		);
		pane2.measurement.replaceMeasurements(
			filterMeasurementsForFiles(loadedStorage.measurements, paneFiles[2]),
		);
		pane3.annotation.replaceAnnotations(
			filterAnnotationsForFiles(loadedStorage.annotations, paneFiles[3]),
		);
		pane3.measurement.replaceMeasurements(
			filterMeasurementsForFiles(loadedStorage.measurements, paneFiles[3]),
		);

		const timeoutId = window.setTimeout(() => {
			setStorageReadyStudyUid(studyInstanceUid);
		}, 0);
		return () => window.clearTimeout(timeoutId);
	}, [
		studyInstanceUid,
		loadedStorage,
		paneFiles,
		pane0.annotation.replaceAnnotations,
		pane0.measurement.replaceMeasurements,
		pane1.annotation.replaceAnnotations,
		pane1.measurement.replaceMeasurements,
		pane2.annotation.replaceAnnotations,
		pane2.measurement.replaceMeasurements,
		pane3.annotation.replaceAnnotations,
		pane3.measurement.replaceMeasurements,
	]);

	const allStoredAnnotations = useMemo(
		() => [
			...pane0.allAnnotations,
			...pane1.allAnnotations,
			...pane2.allAnnotations,
			...pane3.allAnnotations,
		],
		[
			pane0.allAnnotations,
			pane1.allAnnotations,
			pane2.allAnnotations,
			pane3.allAnnotations,
		],
	);

	const allStoredMeasurements = useMemo(
		() => [
			...pane0.allMeasurements,
			...pane1.allMeasurements,
			...pane2.allMeasurements,
			...pane3.allMeasurements,
		],
		[
			pane0.allMeasurements,
			pane1.allMeasurements,
			pane2.allMeasurements,
			pane3.allMeasurements,
		],
	);

	// 注釈・計測変更時にStudy単位で遅延保存
	useEffect(() => {
		if (!studyInstanceUid || storageReadyStudyUid !== studyInstanceUid) return;
		const api = window.electronAPI;
		if (!api?.saveAnnotations) return;

		setAnnotationSaveStatus("pending");
		const timeoutId = window.setTimeout(() => {
			const payload = createAnnotationStoragePayload({
				studyInstanceUid,
				annotations: allStoredAnnotations,
				measurements: allStoredMeasurements,
			});
			api
				.saveAnnotations(studyInstanceUid, payload)
				.then(() => setAnnotationSaveStatus("saved"))
				.catch((err: unknown) => {
					console.warn("[annotations] 保存失敗", err);
					setAnnotationSaveStatus("error");
				});
		}, SAVE_DEBOUNCE_MS);

		return () => window.clearTimeout(timeoutId);
	}, [
		studyInstanceUid,
		storageReadyStudyUid,
		allStoredAnnotations,
		allStoredMeasurements,
	]);

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

	// スクリーンショット（アクティブペインのcanvas + SVG注釈を合成）
	const handleScreenshot = useCallback(() => {
		const canvas = activePane.tileCanvasRef?.current;
		if (!canvas) return;
		void compositeCanvasWithOverlays(canvas).then((dataUrl) => {
			const api = (
				window as {
					electronAPI?: {
						saveScreenshot?: (dataUrl: string) => Promise<boolean>;
					};
				}
			).electronAPI;
			if (api?.saveScreenshot) {
				void runBooleanExportWithFallback(api.saveScreenshot(dataUrl), () =>
					saveScreenshotInBrowser(dataUrl),
				);
			} else {
				saveScreenshotInBrowser(dataUrl);
			}
		});
	}, [activePane.tileCanvasRef]);

	// 印刷（アクティブペインのcanvas + SVG注釈を合成してDICOMメタデータ付き印刷）
	const handlePrint = useCallback(() => {
		const canvas = activePane.tileCanvasRef?.current;
		if (!canvas || !activePane.currentFile) return;
		const currentFile = activePane.currentFile;
		void compositeCanvasWithOverlays(canvas).then((dataUrl) => {
			const metadata = buildPrintImageMetadata(currentFile);
			const html = createPrintImageHtml(dataUrl, metadata);
			if (window.electronAPI?.printImage) {
				void runBooleanExportWithFallback(
					window.electronAPI.printImage(dataUrl, metadata),
					() => openBrowserPrintWindow(html),
				);
				return;
			}
			openBrowserPrintWindow(html);
		});
	}, [activePane.currentFile, activePane.tileCanvasRef]);

	// WW/WCプリセット適用（アクティブペイン）
	const handleSetWwWcPreset = useCallback(
		(index: number) => {
			const preset = WW_WC_PRESETS[index];
			if (preset) activePane.controls.setWwWc(preset.ww, preset.wc);
		},
		[activePane.controls.setWwWc],
	);

	// 全アクティブペインを画面にフィット
	const handleFitAllPanes = useCallback(() => {
		for (const pane of allPanes.slice(0, paneCount)) {
			pane.controls.fitSize();
		}
	}, [allPanes, paneCount]);

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
			printImage: handlePrint,
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
			handlePrint,
			activePane.measurement.clearAll,
		],
	);

	useKeyboardShortcuts(shortcutActions, activePane.isOsdReady);

	// WW/WC同期: アクティブペインの値変化を他の全アクティブペインへ伝播
	useEffect(() => {
		if (!syncWwWc || paneCount <= 1) return;
		const ww = activePane.worldInfo.windowWidth;
		const wc = activePane.worldInfo.windowCenter;
		for (const pane of allPanes.slice(0, paneCount)) {
			if (pane.containerId === activePane.containerId) continue;
			pane.controls.setWwWc(ww, wc);
		}
	}, [
		syncWwWc,
		paneCount,
		activePane.worldInfo.windowWidth,
		activePane.worldInfo.windowCenter,
		activePane.containerId,
		allPanes,
	]);

	// ズーム/パン同期: アクティブペインのOSD viewport-changeを他のペインへ伝播
	useEffect(() => {
		if (!syncZoom || paneCount <= 1) return;
		const viewer = activePane.viewerRef.current;
		if (!viewer) return;
		const activePaneId = activePane.containerId;
		const handler = () => {
			const vp = activePane.getViewport();
			if (!vp) return;
			const center = vp.getCenter();
			const zoom = vp.getZoom();
			for (const pane of allPanes.slice(0, paneCount)) {
				if (pane.containerId === activePaneId) continue;
				const otherVp = pane.getViewport();
				if (!otherVp) continue;
				otherVp.zoomTo(zoom, undefined, true);
				otherVp.panTo(center, true);
			}
		};
		viewer.addHandler("viewport-change", handler);
		return () => {
			viewer.removeHandler("viewport-change", handler);
		};
	}, [
		syncZoom,
		paneCount,
		activePane.viewerRef,
		activePane.getViewport,
		activePane.containerId,
		allPanes,
	]);

	return (
		<div className="relative flex flex-1 flex-col">
			<div className="flex min-h-0 flex-1">
				<AnnotationSaveStatusBadge status={annotationSaveStatus} />
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

				<ToolPanel
					{...activePane.controlPanelProps}
					onFitAllPanes={paneCount > 1 ? handleFitAllPanes : undefined}
					syncWwWc={syncWwWc}
					onToggleSyncWwWc={
						paneCount > 1 ? () => setSyncWwWc((v) => !v) : undefined
					}
					syncZoom={syncZoom}
					onToggleSyncZoom={
						paneCount > 1 ? () => setSyncZoom((v) => !v) : undefined
					}
					onClearSelected={handleClearSelected}
					onClearAll={handleClearAll}
					onScreenshot={handleScreenshot}
					onPrint={handlePrint}
					isFullscreen={isFullscreen}
					onToggleFullscreen={toggleFullscreen}
					layout={layout}
					onSetLayout={setLayout}
					viewerReady={activePane.isOsdReady && !!activePane.currentFile}
				/>
			</div>
			<StatusBar
				activeMode={activePane.activeMode}
				currentWW={activePane.worldInfo.windowWidth}
				currentWC={activePane.worldInfo.windowCenter}
				isInverted={activePane.worldInfo.invert}
				layout={layout}
				activePaneIndex={activePaneIndex}
				paneCount={paneCount}
				viewerReady={activePane.isOsdReady && !!activePane.currentFile}
			/>
		</div>
	);
};
