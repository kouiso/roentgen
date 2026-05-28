// cornerstone初期化 + OSD tileDrawingブリッジ（renkeibox useRender.ts 参考）
// OSDのtileDrawingイベント内でcornerstone.renderToCanvasを呼び出す
import { useCallback, useEffect, useRef, useState } from "react";
import type { DicomFileInfo } from "@/types/dicom";
import type { ViewerWorldInfo } from "@/types/viewer";
import { INITIAL_WORLD_INFO } from "@/types/viewer";
import { isEncapsulatedTransferSyntax } from "@/utils/dicom-parser";

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

type CornerstoneWadoImageLoader = {
	external?: {
		cornerstone?: unknown;
		dicomParser?: unknown;
	};
	configure?: (options: Record<string, unknown>) => void;
	webWorkerManager?: {
		initialize?: (config: Record<string, unknown>) => void;
		terminate?: () => void;
	};
	wadouri?: {
		fileManager?: {
			add: (file: Blob) => string;
			remove?: (index: number) => void;
			purge?: () => void;
		};
		dataSetCacheManager?: {
			unload?: (uri: string) => void;
			purge?: () => void;
		};
	};
};

// OSD (OpenSeadragon)の型
export type OSDViewer = {
	addHandler: (event: string, handler: (event?: unknown) => void) => void;
	removeHandler: (event: string, handler: (event?: unknown) => void) => void;
	removeAllHandlers: (event: string) => void;
	world: { needsDraw: () => boolean };
	viewport: {
		getZoom: () => number;
		zoomTo: (
			zoom: number,
			refPoint?: { x: number; y: number } | null,
			immediately?: boolean,
		) => void;
		zoomBy: (factor: number) => void;
		panTo: (point: { x: number; y: number }, immediately?: boolean) => void;
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
let _cornerstoneWadoModule: CornerstoneWadoImageLoader | null = null;

// 全ペインで共有するimageDataMap（rawDataのキャッシュ）
const _sharedImageDataMap = new Map<string, ArrayBuffer>();
const _sharedWadoImageIdMap = new Map<string, string>();

const CORNERSTONE_CODEC_PUBLIC_PATH = `${import.meta.env.BASE_URL}cornerstone-wado/`;

// 初期化は1回のみ実行する
let _initPromise: Promise<void> | null = null;
const _initDoneCallbacks: Array<{
	resolve: () => void;
	reject: (error: unknown) => void;
}> = [];
let _isInitDone = false;

const drainInitCallbacks = (error?: unknown) => {
	const callbacks = _initDoneCallbacks.splice(0);
	for (const cb of callbacks) {
		if (error) {
			cb.reject(error);
		} else {
			cb.resolve();
		}
	}
};

export const disposeCornerstoneHmrState = (): void => {
	_sharedImageDataMap.clear();
	_sharedWadoImageIdMap.clear();
	_cornerstoneWadoModule?.webWorkerManager?.terminate?.();
	_cornerstoneWadoModule?.wadouri?.fileManager?.purge?.();
	_cornerstoneWadoModule?.wadouri?.dataSetCacheManager?.purge?.();
	_cornerstoneWadoModule = null;
	_cornerstoneModule = null;
	_initPromise = null;
	_isInitDone = false;
	drainInitCallbacks(new Error("cornerstone state disposed by Vite HMR"));
};

if (import.meta.hot) {
	import.meta.hot.dispose(disposeCornerstoneHmrState);
}

const parseRoentgenImageId = (
	imageId: string,
): { filePath: string; frameIndex: number } => {
	const roentgenPath = imageId.startsWith("roentgen:")
		? imageId.slice("roentgen:".length)
		: imageId;
	const fragmentMatch = /#frame=(\d+)$/.exec(roentgenPath);
	if (fragmentMatch?.index !== undefined) {
		return {
			filePath: roentgenPath.slice(0, fragmentMatch.index),
			frameIndex: Number.parseInt(fragmentMatch[1] ?? "0", 10),
		};
	}
	const queryMatch = /[?&]frame=(\d+)$/.exec(roentgenPath);
	if (queryMatch?.index !== undefined) {
		return {
			filePath: roentgenPath.slice(0, queryMatch.index),
			frameIndex: Number.parseInt(queryMatch[1] ?? "0", 10),
		};
	}
	return { filePath: roentgenPath, frameIndex: 0 };
};

const getSharedImageDataKey = (imageId: string): string => {
	return imageId.startsWith("roentgen:")
		? parseRoentgenImageId(imageId).filePath
		: imageId;
};

const parsePixelSpacingValue = (
	value: string | undefined,
): [number, number] | null => {
	if (!value) return null;
	const parts = value.split("\\").map(Number);
	if (parts.length !== 2 || parts.some(Number.isNaN)) return null;
	return [parts[0] ?? 1, parts[1] ?? 1];
};

export const getSharedImageDataMapSize = (): number => {
	return _sharedImageDataMap.size;
};

export const releaseImage = (imageId: string): void => {
	const sharedKey = getSharedImageDataKey(imageId);
	_sharedImageDataMap.delete(sharedKey);

	const wadoImageId = _sharedWadoImageIdMap.get(sharedKey);
	if (wadoImageId) {
		_sharedWadoImageIdMap.delete(sharedKey);
		const fileIndex = Number.parseInt(
			wadoImageId.replace("dicomfile:", ""),
			10,
		);
		if (Number.isFinite(fileIndex)) {
			_cornerstoneWadoModule?.wadouri?.fileManager?.remove?.(fileIndex);
		}
		_cornerstoneWadoModule?.wadouri?.dataSetCacheManager?.unload?.(wadoImageId);
		_cornerstoneModule?.imageLoader?.purge?.(wadoImageId);
		const loadObject =
			_cornerstoneModule?.imageCache?.getImageLoadObject?.(wadoImageId);
		if (loadObject) {
			_cornerstoneModule?.imageCache?.removeImageLoadObject?.(wadoImageId);
		}
	}

	const cs = _cornerstoneModule;
	if (!cs) return;
	cs.imageLoader?.purge?.(imageId);
	const loadObject = cs.imageCache?.getImageLoadObject?.(imageId);
	if (loadObject) {
		cs.imageCache?.removeImageLoadObject?.(imageId);
	}
};

export const initializeCornerstone = (): Promise<void> => {
	if (_isInitDone) return Promise.resolve();
	if (_initPromise) return _initPromise;
	_initPromise = (async () => {
		try {
			try {
				const cornerstone = await import("cornerstone-core");
				_cornerstoneModule = cornerstone.default ?? cornerstone;
			} catch (err) {
				console.error("[useCornerstone] cornerstone-core import失敗:", err);
				throw err;
			}

			try {
				const cornerstoneWADO = await import("cornerstone-wado-image-loader");
				const wado: CornerstoneWadoImageLoader =
					cornerstoneWADO.default ?? cornerstoneWADO;
				_cornerstoneWadoModule = wado;
				if (wado.external) {
					wado.external.cornerstone = _cornerstoneModule;
					const dicomParser = await import("dicom-parser");
					wado.external.dicomParser = dicomParser.default ?? dicomParser;
				}
				if (wado.configure) {
					wado.configure({
						decodeConfig: {
							convertFloatPixelDataToInt: true,
							use16BitDataType: false,
						},
					});
				}
				wado.webWorkerManager?.initialize?.({
					maxWebWorkers:
						typeof navigator === "undefined"
							? 1
							: navigator.hardwareConcurrency || 1,
					startWebWorkersOnDemand: true,
					webWorkerTaskPaths: [],
					taskConfiguration: {
						decodeTask: {
							codecsPath: CORNERSTONE_CODEC_PUBLIC_PATH,
							initializeCodecsOnStartup: false,
						},
					},
				});
			} catch (err) {
				console.error(
					"[useCornerstone] cornerstone-wado-image-loader import失敗:",
					err,
				);
				throw err;
			}

			// ローカルファイル用カスタムimageLoader登録（1回のみ）
			const dicomParserMod = await import("dicom-parser");
			const dp = dicomParserMod.default ?? dicomParserMod;

			_cornerstoneModule.registerImageLoader("roentgen", (imageId: string) => {
				const promise = (async () => {
					const { filePath, frameIndex } = parseRoentgenImageId(imageId);
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

					const bytesPerSample = Math.max(1, bitsAllocated / 8);
					const calculatedFrameByteSize =
						rows * columns * bytesPerSample * Math.max(1, samplesPerPixel);
					const frameByteSize =
						calculatedFrameByteSize > 0
							? calculatedFrameByteSize
							: pixelDataElement.length;
					const frameOffset =
						pixelDataElement.dataOffset + frameIndex * frameByteSize;
					const pixelDataEnd =
						pixelDataElement.dataOffset + pixelDataElement.length;
					if (frameOffset + frameByteSize > pixelDataEnd) {
						throw new Error(`フレーム範囲外です: frame=${frameIndex}`);
					}

					let pixelData: Int16Array | Uint16Array | Uint8Array;
					if (bitsAllocated === 16) {
						if (pixelRepresentation === 1) {
							pixelData = new Int16Array(
								arrayBuffer,
								frameOffset,
								frameByteSize / 2,
							);
						} else {
							pixelData = new Uint16Array(
								arrayBuffer,
								frameOffset,
								frameByteSize / 2,
							);
						}
					} else {
						pixelData = new Uint8Array(arrayBuffer, frameOffset, frameByteSize);
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
					const intercept = Number.parseFloat(
						dataSet.string("x00281052") ?? "0",
					);
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
					const pixelSpacing =
						parsePixelSpacingValue(dataSet.string("x00280030")) ??
						parsePixelSpacingValue(dataSet.string("x00181164")) ??
						([1, 1] satisfies [number, number]);
					extended.color = isColor;
					extended.columnPixelSpacing = pixelSpacing[1];
					extended.rowPixelSpacing = pixelSpacing[0];
					extended.sizeInBytes = pixelData.byteLength;
					extended.rgba = false;
					extended.photometricInterpretation = photometricInterpretation;
					extended.bitsStored = bitsStored;

					return image;
				})();

				return { promise };
			});

			_isInitDone = true;
			drainInitCallbacks();
		} catch (err) {
			_initPromise = null;
			drainInitCallbacks(err);
			throw err;
		}
	})();
	return _initPromise;
};

const ensureWadoImageId = (fileInfo: DicomFileInfo): string => {
	const sharedKey = getSharedImageDataKey(fileInfo.imageId);
	const existing = _sharedWadoImageIdMap.get(sharedKey);
	if (existing) return existing;

	const arrayBuffer = _sharedImageDataMap.get(sharedKey);
	const fileManager = _cornerstoneWadoModule?.wadouri?.fileManager;
	if (!arrayBuffer || !fileManager) return fileInfo.imageId;

	const wadoImageId = fileManager.add(
		new Blob([arrayBuffer], { type: "application/dicom" }),
	);
	_sharedWadoImageIdMap.set(sharedKey, wadoImageId);
	return wadoImageId;
};

const getLoadImageId = (fileInfo: DicomFileInfo): string => {
	if (isEncapsulatedTransferSyntax(fileInfo.tags.TransferSyntaxUID)) {
		return ensureWadoImageId(fileInfo);
	}
	if (
		fileInfo.imageId.startsWith("roentgen:") &&
		fileInfo.frameIndex > 0 &&
		parseRoentgenImageId(fileInfo.imageId).frameIndex === 0
	) {
		return `${fileInfo.imageId}#frame=${fileInfo.frameIndex}`;
	}
	return fileInfo.imageId;
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
	const photometricInterpretationRef = useRef("MONOCHROME2");

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
		let isMounted = true;
		const onDone = {
			resolve: () => {
				if (isMounted) setCornerstoneReady(true);
			},
			reject: (err: unknown) => {
				if (isMounted) {
					console.error("[useCornerstone] 初期化失敗:", err);
				}
			},
		};
		_initDoneCallbacks.push(onDone);
		initializeCornerstone().catch(() => {
			// rejectは上のcallback drainで各paneに通知済み
		});
		return () => {
			isMounted = false;
			const idx = _initDoneCallbacks.indexOf(onDone);
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
		releaseImage(filePath);
	}, []);

	const clearAllImageData = useCallback(() => {
		for (const filePath of [..._sharedImageDataMap.keys()]) {
			releaseImage(filePath);
		}
		_sharedImageDataMap.clear();
	}, []);

	// 画像読み込み・表示
	const loadAndDisplayImage = useCallback(
		async (
			fileInfo: DicomFileInfo,
			options?: { signal?: AbortSignal },
		): Promise<boolean> => {
			const cs = _cornerstoneModule;
			if (!cs || options?.signal?.aborted) return false;

			try {
				const image = await cs.loadImage(getLoadImageId(fileInfo));
				if (options?.signal?.aborted) return false;
				currentImageRef.current = image;
				setCurrentImage(image);
				overlayDataRef.current = fileInfo.overlayData;
				photometricInterpretationRef.current =
					fileInfo.photometricInterpretation;

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
				return true;
			} catch (err) {
				if (!options?.signal?.aborted) {
					console.error("[useCornerstone] loadImage失敗:", err);
				}
				return false;
			}
		},
		[],
	);

	// OSD tileDrawingブリッジ設定
	const setupTileDrawingBridge = useCallback((osdViewer: OSDViewer) => {
		if (osdViewerRef.current) {
			osdViewerRef.current.removeAllHandlers("tile-drawing");
		}
		osdViewerRef.current = osdViewer;

		osdViewer.addHandler("tile-drawing", (rawEvent) => {
			const event = rawEvent as OSDTileEvent;
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
						const overlayColor =
							photometricInterpretationRef.current === "MONOCHROME1"
								? [0, 0, 0]
								: [255, 255, 255];
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
										imgData.data[pixelIdx] = overlayColor[0] ?? 255;
										imgData.data[pixelIdx + 1] = overlayColor[1] ?? 255;
										imgData.data[pixelIdx + 2] = overlayColor[2] ?? 255;
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
			await cs.loadImage(getLoadImageId(fileInfo));
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
