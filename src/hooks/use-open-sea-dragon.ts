// OpenSeadragon初期化・ビューア作成（renkeibox useRender.createViewer 参考）
// DICOM画像を単一タイルとしてOSDに表示し、ズーム/パン/ビューポート制御をOSDに委譲
import { useCallback, useEffect, useRef, useState } from "react";
import type { OSDViewer } from "./use-cornerstone";

type UseOpenSeaDragonProps = {
	containerId: string;
	imageWidth: number;
	imageHeight: number;
	onViewerCreated?: (viewer: OSDViewer) => void;
	onViewerDestroyed?: () => void;
};

export const useOpenSeaDragon = ({
	containerId,
	imageWidth,
	imageHeight,
	onViewerCreated,
	onViewerDestroyed,
}: UseOpenSeaDragonProps) => {
	const viewerRef = useRef<OSDViewer | null>(null);
	const tileCanvasRef = useRef<HTMLCanvasElement | null>(null);
	// StrictModeの二重initViewer呼出による競合を防止する世代カウンター
	// await後に「自分がまだ最新の呼び出しか」をチェックし、古い呼び出しを破棄する
	const initGenerationRef = useRef(0);
	const onViewerCreatedRef = useRef(onViewerCreated);
	// OSDの初回タイル読込完了を追跡 — needsDraw()はタイル読込後でないと
	// drawWorld()→imageLoader.clear()→タイルabortのサイクルに陥る
	const [tileReady, setTileReady] = useState(false);
	// 現在のOSDに適用済みの画像サイズを追跡
	const activeSizeRef = useRef<{ w: number; h: number }>({ w: 0, h: 0 });

	const onViewerDestroyedRef = useRef(onViewerDestroyed);

	useEffect(() => {
		onViewerCreatedRef.current = onViewerCreated;
	}, [onViewerCreated]);

	useEffect(() => {
		onViewerDestroyedRef.current = onViewerDestroyed;
	}, [onViewerDestroyed]);

	// 画像サイズが変わったらOSDビューアを再作成
	useEffect(() => {
		if (imageWidth <= 0 || imageHeight <= 0) return;
		if (
			activeSizeRef.current.w === imageWidth &&
			activeSizeRef.current.h === imageHeight
		)
			return;
		// サイズ変更 — 古いビューアを破棄して再作成を許可
		if (viewerRef.current) {
			initGenerationRef.current++;
			viewerRef.current.destroy();
			viewerRef.current = null;
			tileCanvasRef.current = null;
			setTileReady(false);
			activeSizeRef.current = { w: 0, h: 0 };
			onViewerDestroyedRef.current?.();
		}
	}, [imageWidth, imageHeight]);

	// OSDビューア作成
	const initViewer = useCallback(async () => {
		if (imageWidth <= 0 || imageHeight <= 0) return;
		// 既に同じサイズで作成済みなら何もしない
		if (
			viewerRef.current &&
			activeSizeRef.current.w === imageWidth &&
			activeSizeRef.current.h === imageHeight
		)
			return;
		// サイズ変更で古いビューアが残っていたら破棄
		if (viewerRef.current) {
			initGenerationRef.current++;
			viewerRef.current.destroy();
			viewerRef.current = null;
			tileCanvasRef.current = null;
		}

		const container = document.getElementById(containerId);
		if (!container) return;

		const generation = ++initGenerationRef.current;

		const OpenSeadragon = await import("openseadragon" as string);

		// await後に世代チェック — StrictModeのcleanup→re-mountで新しい呼び出しが走った場合、
		// 古い呼び出し(gen < current)は破棄する
		if (initGenerationRef.current !== generation) return;

		// await後にviewerRef再チェック
		if (viewerRef.current) return;

		const OSD = OpenSeadragon.default ?? OpenSeadragon;

		// 単一レベル（maxLevel=0）: level 0 = 原寸（scale = 1/2^(0-0) = 1）
		// 複数レベルにするとviewportアニメーション中にレベル切替が発生し、
		// ImageLoader.clear()がタイルロードをabortするサイクルに陥る
		const maxLevel = 0;
		const tileSize = Math.max(imageWidth, imageHeight);

		// getContext2DでCanvasを直接提供し、ImageJob/ImageLoaderを完全にバイパスする。
		// OSDのdrawWorld()→imageLoader.clear()によるタイルabort問題を根本的に回避。
		// cornerstoneがtile-drawingイベント内でこのCanvasを上書きするため初期内容は無関係。
		const tileCanvas = document.createElement("canvas");
		tileCanvas.width = tileSize;
		tileCanvas.height = tileSize;
		const tileCtx = tileCanvas.getContext("2d");
		tileCanvasRef.current = tileCanvas;

		// DICOM画像用カスタムTileSource — 全レベルで単一タイル
		// getContext2DでCanvasを直接返すことでImageLoaderを完全にバイパス
		const tileSource = {
			width: imageWidth,
			height: imageHeight,
			tileSize,
			tileOverlap: 0,
			minLevel: 0,
			maxLevel,
			getTileUrl: () => "",
			getContext2D: () => tileCtx,
		};

		// tileSources を渡さずにviewerを作成する。
		// OSDコンストラクタにtileSourcesを渡すと、rAFコールバック内の
		// drawWorld()→imageLoader.clear()でタイル読込がabortされるため、
		// monkey-patch適用後にaddTiledImageで追加する。
		const viewer = OSD({
			id: containerId,
			prefixUrl: "",
			showNavigationControl: false,
			animationTime: 0,
			blendTime: 0,
			constrainDuringPan: false,
			maxZoomPixelRatio: 10,
			minZoomImageRatio: 0.1,
			visibilityRatio: 0.5,
			springStiffness: 10,
			immediateRender: true,
			loadTilesWithAjax: false,
			gestureSettingsMouse: {
				scrollToZoom: false,
				clickToZoom: false,
				dblClickToZoom: false,
				flickEnabled: false,
			},
			gestureSettingsTouch: {
				scrollToZoom: false,
				clickToZoom: false,
				dblClickToZoom: false,
				pinchToZoom: true,
				flickEnabled: false,
			},
		}) as OSDViewer;

		// OSDのdrawWorld()は毎フレームimageLoader.clear()を呼び、
		// 読込中の全タイルジョブをabortする。単一ダミータイル構成では
		// この動作が初回タイル読込を妨げるため、clear()を無効化する。
		viewer.imageLoader.clear = () => {};

		// monkey-patch適用後にタイルソースを追加
		viewer.addTiledImage({ tileSource });

		viewerRef.current = viewer;
		activeSizeRef.current = { w: imageWidth, h: imageHeight };

		// OSD初期化完了 — getContext2DでCanvasを直接提供するためImageLoader不使用。
		// tile-loadedイベントは発火しないため、openイベントでtileReadyをセットする。
		// ハンドラはdestroy()前に除去するため、名前付き関数で登録
		const onOpen = () => {
			if (
				initGenerationRef.current !== generation ||
				viewerRef.current !== viewer
			) {
				return;
			}
			setTileReady(true);
			onViewerCreatedRef.current?.(viewer);
			// コンテナサイズ確定後にfitBoundsで画像をビューポートにフィット
			requestAnimationFrame(() => {
				if (
					initGenerationRef.current !== generation ||
					viewerRef.current !== viewer
				) {
					return;
				}
				viewer.viewport.fitBounds(viewer.viewport.getHomeBounds());
			});
			// 一度発火すれば不要 — 蓄積防止のため自己除去
			viewer.removeAllHandlers("open");
		};
		viewer.addHandler("open", onOpen);
	}, [containerId, imageWidth, imageHeight]);

	// ビューア破棄
	useEffect(() => {
		return () => {
			// 世代をインクリメントしてpending中のinitViewerを無効化
			initGenerationRef.current++;
			setTileReady(false);
			if (viewerRef.current) {
				viewerRef.current.destroy();
				viewerRef.current = null;
				tileCanvasRef.current = null;
				activeSizeRef.current = { w: 0, h: 0 };
				onViewerDestroyedRef.current?.();
			}
		};
	}, []);

	// ウィンドウリサイズ対応 — コンテナサイズ変更時にOSD再描画をトリガー
	// OSDは内部でviewportを自動調整するが、cornerstone側のtileDrawingイベントが
	// 再発火しないケースがあるため、forceRedraw()で明示的に再描画を保証する
	useEffect(() => {
		if (!tileReady) return;

		const container = document.getElementById(containerId);
		if (!container) return;

		const observer = new ResizeObserver(() => {
			// OSD内部のviewport更新が先に完了するよう1フレーム待機
			requestAnimationFrame(() => {
				viewerRef.current?.forceRedraw();
			});
		});

		observer.observe(container);

		return () => {
			observer.disconnect();
		};
	}, [containerId, tileReady]);

	// viewport取得
	const getViewport = useCallback(() => {
		return viewerRef.current?.viewport ?? null;
	}, []);

	return {
		viewerRef,
		initViewer,
		getViewport,
		tileReady,
		tileCanvasRef,
	};
};
