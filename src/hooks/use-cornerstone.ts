// cornerstone初期化 + OSD tileDrawingブリッジ（renkeibox useRender.ts 参考）
// OSDのtileDrawingイベント内でcornerstone.renderToCanvasを呼び出す
import { useCallback, useEffect, useRef, useState } from "react";
import type { DicomFileInfo } from "@/types/dicom";
import type { ViewerWorldInfo } from "@/types/viewer";
import { INITIAL_WORLD_INFO } from "@/types/viewer";

// cornerstone-coreの型（旧版に型定義なし）
type CornerstoneImage = {
	imageId: string;
	rows: number;
	columns: number;
	width: number;
	height: number;
	getPixelData: () => Int16Array | Uint16Array | Uint8Array;
	windowCenter: number;
	windowWidth: number;
	slope: number;
	intercept: number;
	invert: boolean;
	minPixelValue: number;
	maxPixelValue: number;
	render?: (enabledElement: unknown, invalidated: boolean) => void;
};

type CornerstoneViewport = {
	voi?: { windowWidth: number; windowCenter: number };
	invert?: boolean;
	rotation?: number;
	hflip?: boolean;
	vflip?: boolean;
};

// OSD (OpenSeadragon)の型
export type OSDViewer = {
	addHandler: (event: string, handler: (event: OSDTileEvent) => void) => void;
	removeAllHandlers: (event: string) => void;
	world: { needsDraw: () => boolean };
	viewport: {
		getZoom: () => number;
		zoomTo: (zoom: number) => void;
		zoomBy: (factor: number) => void;
		panTo: (point: { x: number; y: number }) => void;
		panBy: (delta: { x: number; y: number }) => void;
		fitBounds: (rect: {
			x: number;
			y: number;
			width: number;
			height: number;
		}) => void;
		getHomeBounds: () => {
			x: number;
			y: number;
			width: number;
			height: number;
		};
		getCenter: () => { x: number; y: number };
	};
	addTiledImage: (options: {
		tileSource: unknown;
		success?: () => void;
	}) => void;
	// OSD内部のアニメーションループでdrawWorld()を再トリガーするフラグセッター
	forceRedraw: () => void;
	// タイル読込ジョブキュー管理 — clear()は全pendingジョブをabortする
	imageLoader: { clear: () => void };
	destroy: () => void;
};

export type OSDTileEvent = {
	context?: CanvasRenderingContext2D;
	rendered?: { canvas: HTMLCanvasElement };
	tile?: { level: number; x: number; y: number };
};

// ============================================================
// モジュールレベルシングルトン — 複数ペイン間で共有
// ============================================================
// biome-ignore lint/suspicious/noExplicitAny: cornerstone-coreに型定義なし
let _cornerstoneModule: any = null;

// 全ペインで共有するimageDataMap（rawDataのキャッシュ）
const _sharedImageDataMap = new Map<string, ArrayBuffer>();

// 初期化は1回のみ実行する
let _initPromise: Promise<void> | null = null;
const _initDoneCallbacks: Array<() => void> = [];
let _isInitDone = false;

const _initCornerstoneOnce = (): Promise<void> => {
	if (_initPromise) return _initPromise;
	_initPromise = (async () => {
		try {
			const cornerstone = await import("cornerstone-core");
			_cornerstoneModule = cornerstone.default ?? cornerstone;
		} catch (err) {
			console.error("[useCornerstone] cornerstone-core import失敗:", err);
			_initPromise = null;
			return;
		}

		try {
			const cornerstoneWADO = await import("cornerstone-wado-image-loader");
			const wado = cornerstoneWADO.default ?? cornerstoneWADO;
			if (wado.external) {
				wado.external.cornerstone = _cornerstoneModule;
				const dicomParser = await import("dicom-parser");
				wado.external.dicomParser = dicomParser.default ?? dicomParser;
			}
			if (wado.configure) {
				wado.configure({ useWebWorkers: false });
			}
		} catch (err) {
			console.error(
				"[useCornerstone] cornerstone-wado-image-loader import失敗:",
				err,
			);
			_initPromise = null;
			return;
		}

		// ローカルファイル用カスタムimageLoader登録（1回のみ）
		const dicomParserMod = await import("dicom-parser");
		const dp = dicomParserMod.default ?? dicomParserMod;

		_cornerstoneModule.registerImageLoader("roentgen", (imageId: string) => {
			const promise = (async () => {
				const filePath = imageId.replace("roentgen:", "");
				const arrayBuffer = _sharedImageDataMap.get(filePath);

				if (!arrayBuffer) {
					throw new Error(`ファイルデータ未登録: ${filePath}`);
				}

				const byteArray = new Uint8Array(arrayBuffer);
				const dataSet = dp.parseDicom(byteArray);

				const rows = dataSet.uint16("x00280010") ?? 0;
				const columns = dataSet.uint16("x00280011") ?? 0;
				const bitsAllocated = dataSet.uint16("x00280100") ?? 16;
				const bitsStored = dataSet.uint16("x00280101") ?? bitsAllocated;
				const pixelRepresentation = dataSet.uint16("x00280103") ?? 0;
				const samplesPerPixel = dataSet.uint16("x00280002") ?? 1;
				const photometricInterpretation =
					dataSet.string("x00280004") ?? "MONOCHROME2";

				const pixelDataElement = dataSet.elements.x7fe00010;
				if (!pixelDataElement) {
					throw new Error("PixelData (7FE0,0010) が見つかりません");
				}

				let pixelData: Int16Array | Uint16Array | Uint8Array;
				if (bitsAllocated === 16) {
					if (pixelRepresentation === 1) {
						pixelData = new Int16Array(
							arrayBuffer,
							pixelDataElement.dataOffset,
							pixelDataElement.length / 2,
						);
					} else {
						pixelData = new Uint16Array(
							arrayBuffer,
							pixelDataElement.dataOffset,
							pixelDataElement.length / 2,
						);
					}
				} else {
					pixelData = new Uint8Array(
						arrayBuffer,
						pixelDataElement.dataOffset,
						pixelDataElement.length,
					);
				}

				let minVal = Number.MAX_SAFE_INTEGER;
				let maxVal = Number.MIN_SAFE_INTEGER;
				for (let i = 0; i < pixelData.length; i++) {
					const v = pixelData[i] ?? 0;
					if (v < minVal) minVal = v;
					if (v > maxVal) maxVal = v;
				}

				const windowCenter =
					Number.parseFloat(dataSet.string("x00281050") ?? "") ||
					(maxVal + minVal) / 2;
				const windowWidth =
					Number.parseFloat(dataSet.string("x00281051") ?? "") ||
					maxVal - minVal;
				const slope = Number.parseFloat(dataSet.string("x00281053") ?? "1");
				const intercept = Number.parseFloat(dataSet.string("x00281052") ?? "0");
				const isColor = samplesPerPixel > 1;
				const invert = photometricInterpretation === "MONOCHROME1";

				const image: CornerstoneImage = {
					imageId,
					rows,
					columns,
					width: columns,
					height: rows,
					getPixelData: () => pixelData,
					windowCenter,
					windowWidth,
					slope,
					intercept,
					invert,
					minPixelValue: minVal,
					maxPixelValue: maxVal,
				};

				const extended = image as CornerstoneImage & Record<string, unknown>;
				extended.color = isColor;
				extended.columnPixelSpacing = Number.parseFloat(
					(dataSet.string("x00280030") ?? "").split("\\")[1] ?? "1",
				);
				extended.rowPixelSpacing = Number.parseFloat(
					(dataSet.string("x00280030") ?? "").split("\\")[0] ?? "1",
				);
				extended.sizeInBytes = pixelData.byteLength;
				extended.rgba = false;
				extended.photometricInterpretation = photometricInterpretation;
				extended.bitsStored = bitsStored;

				return image;
			})();

			return { promise };
		});

		_isInitDone = true;
		for (const cb of _initDoneCallbacks) cb();
		_initDoneCallbacks.length = 0;
	})();
	return _initPromise;
};

export const useCornerstone = () => {
	// ペインごとの状態（モジュールレベルシングルトンとは独立）
	const osdViewerRef = useRef<OSDViewer | null>(null);
	const [currentImage, setCurrentImage] = useState<CornerstoneImage | null>(
		null,
	);
	const [worldInfo, setWorldInfo] =
		useState<ViewerWorldInfo>(INITIAL_WORLD_INFO);
	const [cornerstoneReady, setCornerstoneReady] = useState(false);

	// クロージャ問題回避: tileDrawingハンドラ内で最新値を参照するためにrefsを使用
	const currentImageRef = useRef<CornerstoneImage | null>(null);
	const worldInfoRef = useRef<ViewerWorldInfo>(INITIAL_WORLD_INFO);
	const overlayDataRef = useRef<import("@/types/dicom").OverlayPlaneData[]>([]);

	useEffect(() => {
		currentImageRef.current = currentImage;
	}, [currentImage]);

	useEffect(() => {
		worldInfoRef.current = worldInfo;
		// ref同期後に再描画 — setWorldInfoだけで自動的にtile-drawingが発火する
		osdViewerRef.current?.forceRedraw();
	}, [worldInfo]);

	// モジュールレベルの初期化を待って cornerstoneReady を設定（1回のみ初期化）
	useEffect(() => {
		if (_isInitDone) {
			setCornerstoneReady(true);
			return;
		}
		const onReady = () => setCornerstoneReady(true);
		_initDoneCallbacks.push(onReady);
		_initCornerstoneOnce();
		return () => {
			const idx = _initDoneCallbacks.indexOf(onReady);
			if (idx !== -1) _initDoneCallbacks.splice(idx, 1);
		};
	}, []);

	// 画像データの登録（共有マップへ書き込む）
	const registerImageData = useCallback(
		(filePath: string, data: ArrayBuffer) => {
			_sharedImageDataMap.set(filePath, data);
		},
		[],
	);

	const unregisterImageData = useCallback((filePath: string) => {
		_sharedImageDataMap.delete(filePath);
	}, []);

	const clearAllImageData = useCallback(() => {
		_sharedImageDataMap.clear();
	}, []);

	// 画像読み込み・表示
	const loadAndDisplayImage = useCallback(async (fileInfo: DicomFileInfo) => {
		const cs = _cornerstoneModule;
		if (!cs) return;

		try {
			const image = await cs.loadImage(fileInfo.imageId);
			currentImageRef.current = image;
			setCurrentImage(image);
			overlayDataRef.current = fileInfo.overlayData;

			// 初期WW/WC設定
			const hasDicomWindow = fileInfo.windowWidth > 0;
			let ww = hasDicomWindow ? fileInfo.windowWidth : image.windowWidth;
			let wc = hasDicomWindow ? fileInfo.windowCenter : image.windowCenter;

			// WW/WCタグが無い場合のみ、2-98パーセンタイルで自動計算する
			if (!hasDicomWindow) {
				const fullRange = image.maxPixelValue - image.minPixelValue;
				const pixels = image.getPixelData();
				const histSize = 4096;
				const hist = new Uint32Array(histSize);
				const scale = (histSize - 1) / (fullRange || 1);
				for (let i = 0; i < pixels.length; i++) {
					const bin = Math.min(
						histSize - 1,
						Math.max(
							0,
							Math.round(((pixels[i] ?? 0) - image.minPixelValue) * scale),
						),
					);
					hist[bin] = (hist[bin] ?? 0) + 1;
				}
				const total = pixels.length;
				let cumulative = 0;
				let p02 = image.minPixelValue;
				let p98 = image.maxPixelValue;
				for (let i = 0; i < histSize; i++) {
					cumulative += hist[i] ?? 0;
					if (cumulative >= total * 0.02 && p02 === image.minPixelValue) {
						p02 = image.minPixelValue + i / scale;
					}
					if (cumulative >= total * 0.98) {
						p98 = image.minPixelValue + i / scale;
						break;
					}
				}
				ww = Math.max(1, p98 - p02);
				wc = (p02 + p98) / 2;
			}

			setWorldInfo((prev) => ({
				...prev,
				windowWidth: ww,
				windowCenter: wc,
			}));
		} catch (err) {
			console.error("[useCornerstone] loadImage失敗:", err);
		}
	}, []);

	// OSD tileDrawingブリッジ設定
	const setupTileDrawingBridge = useCallback((osdViewer: OSDViewer) => {
		if (osdViewerRef.current) {
			osdViewerRef.current.removeAllHandlers("tile-drawing");
		}
		osdViewerRef.current = osdViewer;

		osdViewer.addHandler("tile-drawing", (event: OSDTileEvent) => {
			const cs = _cornerstoneModule;
			const image = currentImageRef.current;
			if (!cs || !image || !event.rendered?.canvas) return;

			const canvas = event.rendered.canvas;
			const wi = worldInfoRef.current;

			const viewport: CornerstoneViewport = {
				voi: {
					windowWidth: wi.windowWidth,
					windowCenter: wi.windowCenter,
				},
				invert: wi.invert,
				rotation: wi.rotation,
				hflip: wi.flipHorizontal,
				vflip: wi.flipVertical,
			};

			try {
				cs.renderToCanvas(canvas, image, viewport);

				const overlays = overlayDataRef.current;
				if (overlays.length > 0) {
					const ctx = canvas.getContext("2d");
					if (ctx) {
						for (const overlay of overlays) {
							const imgData = ctx.getImageData(
								overlay.originCol - 1,
								overlay.originRow - 1,
								overlay.columns,
								overlay.rows,
							);
							for (let y = 0; y < overlay.rows; y++) {
								for (let x = 0; x < overlay.columns; x++) {
									const bitIdx = y * overlay.columns + x;
									const byteIdx = Math.floor(bitIdx / 8);
									const bitOffset = bitIdx % 8;
									const byteVal = overlay.data[byteIdx] ?? 0;
									const isSet = (byteVal >> bitOffset) & 1;
									if (isSet) {
										const pixelIdx = (y * overlay.columns + x) * 4;
										imgData.data[pixelIdx] = 255;
										imgData.data[pixelIdx + 1] = 165;
										imgData.data[pixelIdx + 2] = 0;
										imgData.data[pixelIdx + 3] = 180;
									}
								}
							}
							ctx.putImageData(
								imgData,
								overlay.originCol - 1,
								overlay.originRow - 1,
							);
						}
					}
				}
			} catch (err) {
				console.error("[tileDrawing] renderToCanvas失敗:", err);
			}
		});
	}, []);

	const triggerRedraw = useCallback(() => {
		osdViewerRef.current?.forceRedraw();
	}, []);

	const preloadImage = useCallback(async (fileInfo: DicomFileInfo) => {
		const cs = _cornerstoneModule;
		if (!cs) return;
		try {
			await cs.loadImage(fileInfo.imageId);
		} catch {
			// プリロード失敗は無視（表示時に再取得される）
		}
	}, []);

	return {
		cornerstoneReady,
		currentImage,
		worldInfo,
		setWorldInfo,
		loadAndDisplayImage,
		setupTileDrawingBridge,
		triggerRedraw,
		registerImageData,
		unregisterImageData,
		clearAllImageData,
		preloadImage,
	};
};
