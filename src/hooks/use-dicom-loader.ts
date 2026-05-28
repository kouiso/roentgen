// DICOMファイル読込フック（renkeibox useDicomLoader.ts 参考）
// ローカルファイル専用に簡略化（サーバー依存コード不要）
import { useCallback, useEffect, useRef, useState } from "react";
import { releaseImage } from "@/hooks/use-cornerstone";
import type {
	DicomFileError,
	DicomFileInfo,
	DicomLoadState,
} from "@/types/dicom";
import {
	buildDicomFileInfo,
	UnsupportedTransferSyntaxError,
} from "@/utils/dicom-parser";
import { parseDicomdir } from "@/utils/dicomdir-parser";

// dicom-parserライブラリの動的インポート型
type DicomDataSetLike = Parameters<typeof buildDicomFileInfo>[0];
type DicomParser = typeof import("dicom-parser");

let dicomParserModule: DicomParser | null = null;

const getDicomParser = async (): Promise<DicomParser> => {
	if (!dicomParserModule) {
		dicomParserModule = await import("dicom-parser");
	}
	if (!dicomParserModule) {
		throw new Error("dicom-parser読込失敗");
	}
	return dicomParserModule;
};

// rawDataの登録コールバック型
type ImageDataRegistrar = (filePath: string, data: ArrayBuffer) => void;

type DicomParseInput = { path: string; data: ArrayBuffer };

type DicomParseResult = {
	fileInfo: DicomFileInfo;
	rawData: ArrayBuffer;
};

type DicomParseWorkerRequest = {
	id: number;
	type: "parse";
	payload: {
		path: string;
		fileName: string;
		imageId: string;
		data: ArrayBuffer;
	};
};

type DicomParseWorkerSuccess = {
	id: number;
	type: "success";
	fileInfo: DicomFileInfo;
	rawData: ArrayBuffer;
};

type DicomParseWorkerError = {
	id: number;
	type: "error";
	error: {
		name: string;
		message: string;
		transferSyntaxUid?: string;
	};
};

type DicomParseWorkerResponse = DicomParseWorkerSuccess | DicomParseWorkerError;

type DicomParseWorker = {
	addEventListener: (
		...args:
			| ["message", (event: MessageEvent<DicomParseWorkerResponse>) => void]
			| ["error", (event: ErrorEvent) => void]
	) => void;
	removeEventListener: (
		eventName: "message",
		listener: (event: MessageEvent<DicomParseWorkerResponse>) => void,
	) => void;
	postMessage: (
		message: DicomParseWorkerRequest,
		transferList: Transferable[],
	) => void;
	terminate: () => void;
};

type DicomParseWorkerFactory = () => DicomParseWorker;

type DicomParseWorkerPool = {
	parse: (input: DicomParseInput) => Promise<DicomParseResult>;
	terminate: () => void;
};

type PendingWorkerTask = {
	input: DicomParseInput;
	resolve: (result: DicomParseResult) => void;
	reject: (error: Error) => void;
};

type WorkerSlot = {
	worker: DicomParseWorker;
	busy: boolean;
	currentTaskId: number | null;
};

// DICOM MAGIC BYTES: "DICM" at offset 128
const DICOM_MAGIC_OFFSET = 128;
const DICOM_MAGIC = [0x44, 0x49, 0x43, 0x4d]; // "DICM"

// DICOMファイルか事前検証（マジックバイトチェック）
const isDicomFile = (data: ArrayBuffer): boolean => {
	if (data.byteLength < DICOM_MAGIC_OFFSET + 4) return false;
	const view = new Uint8Array(data, DICOM_MAGIC_OFFSET, 4);
	return (
		view[0] === DICOM_MAGIC[0] &&
		view[1] === DICOM_MAGIC[1] &&
		view[2] === DICOM_MAGIC[2] &&
		view[3] === DICOM_MAGIC[3]
	);
};

// エラー分類: パースエラーの原因を判定
const classifyParseError = (
	filePath: string,
	error: unknown,
	data: ArrayBuffer,
	dicomMagicVerified = false,
): DicomFileError => {
	const detail = error instanceof Error ? error.message : "不明なエラー";

	if (!dicomMagicVerified && !isDicomFile(data)) {
		return {
			filePath,
			reason: "not-dicom",
			detail: "レントゲン画像ではありません",
		};
	}

	if (error instanceof UnsupportedTransferSyntaxError) {
		return {
			filePath,
			reason: "corrupt",
			detail: `対応していない圧縮形式です: ${error.transferSyntaxUid}`,
		};
	}

	return {
		filePath,
		reason: "corrupt",
		detail: `ファイルが破損しています: ${detail}`,
	};
};

export const getPrimaryLoadErrorMessage = (
	skipped: DicomFileError[],
): string => {
	if (skipped.length === 0)
		return "読み込める画像ファイルが見つかりませんでした";
	if (skipped.some((s) => s.reason === "read-error")) {
		return "参照ファイルが見つからないため読込できませんでした";
	}
	if (skipped.some((s) => s.reason === "not-dicom")) {
		return "レントゲン画像ではありません";
	}
	if (skipped.some((s) => s.detail.includes("対応していない圧縮形式"))) {
		return "対応していない圧縮形式です";
	}
	return "ファイルが破損しているか、対応する画像データを含んでいません";
};

const getPathSegments = (path: string): string[] => path.split(/[\\/]+/);

const getFileName = (path: string): string => {
	const segments = getPathSegments(path);
	return segments[segments.length - 1] ?? path;
};

const getBaseDirectory = (path: string): string => {
	const lastSlash = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
	if (lastSlash === -1) return "";
	return path.slice(0, lastSlash);
};

const normalizePathForLookup = (path: string): string =>
	path
		.replace(/\\/g, "/")
		.replace(/\/+/g, "/")
		.replace(/\/$/g, "")
		.toLowerCase();

const isDicomdirPath = (path: string): boolean => {
	const segments = getPathSegments(path);
	const fileName = segments[segments.length - 1] ?? path;
	return fileName.toUpperCase() === "DICOMDIR";
};

const resolveDicomdirReference = (
	dicomdirPath: string,
	referencedFileId: string,
): string => {
	const baseDirectory = getBaseDirectory(dicomdirPath).replace(/\\/g, "/");
	const relativePath = referencedFileId
		.split(/[\\/]+/)
		.filter((segment) => segment.length > 0)
		.join("/");
	return baseDirectory ? `${baseDirectory}/${relativePath}` : relativePath;
};

const selectDicomdirReferencedFiles = (
	fileDataList: DicomParseInput[],
	skipped: DicomFileError[],
): DicomParseInput[] => {
	const dicomdirFile = fileDataList.find((fileData) =>
		isDicomdirPath(fileData.path),
	);
	if (!dicomdirFile) return fileDataList;

	let entries: ReturnType<typeof parseDicomdir>;
	try {
		entries = parseDicomdir(dicomdirFile.data);
	} catch (error) {
		const fileError = classifyParseError(
			dicomdirFile.path,
			error,
			dicomdirFile.data,
		);
		skipped.push(fileError);
		console.error(
			`[useDicomLoader] DICOMDIR解析失敗: ${dicomdirFile.path}`,
			error,
		);
		return fileDataList.filter((fileData) => fileData !== dicomdirFile);
	}

	const fileByPath = new Map<string, DicomParseInput>();
	for (const fileData of fileDataList) {
		fileByPath.set(normalizePathForLookup(fileData.path), fileData);
	}

	const selected: DicomParseInput[] = [];
	const selectedPaths = new Set<string>();
	for (const entry of entries) {
		if (entry.type !== "IMAGE" || !entry.referencedFileId) continue;

		const resolvedPath = resolveDicomdirReference(
			dicomdirFile.path,
			entry.referencedFileId,
		);
		const lookupPath = normalizePathForLookup(resolvedPath);
		const fileData = fileByPath.get(lookupPath);

		if (!fileData) {
			skipped.push({
				filePath: resolvedPath,
				reason: "read-error",
				detail:
					"目次ファイル(DICOMDIR)は見つかりましたが、画像ファイルが同じフォルダに揃っていません",
			});
			continue;
		}
		if (selectedPaths.has(lookupPath)) continue;

		selectedPaths.add(lookupPath);
		selected.push(fileData);
	}

	return selected;
};

const parseDicomFileDirectly = async ({
	path,
	data,
}: DicomParseInput): Promise<DicomParseResult> => {
	const parser = await getDicomParser();
	const dataSet = parser.parseDicom(new Uint8Array(data)) as DicomDataSetLike;
	const fileName = getFileName(path);
	const imageId = `roentgen:${path}`;
	return {
		fileInfo: buildDicomFileInfo(dataSet, imageId, path, fileName, data),
		rawData: data,
	};
};

const createDicomParseWorker = (): DicomParseWorker =>
	new Worker(new URL("../workers/dicom-parse-worker.ts", import.meta.url), {
		type: "module",
	});

const getWorkerCount = (): number => {
	if (typeof Worker === "undefined") return 0;
	return Math.max(1, Math.min(navigator.hardwareConcurrency || 1, 4));
};

const restoreWorkerError = (error: DicomParseWorkerError["error"]): Error => {
	if (
		error.name === "UnsupportedTransferSyntaxError" &&
		error.transferSyntaxUid
	) {
		return new UnsupportedTransferSyntaxError(error.transferSyntaxUid);
	}
	return new Error(error.message);
};

const restoreWorkerCrashError = (event: ErrorEvent): Error => {
	return new Error(event.message || "DICOM parse worker failed");
};

export const createDicomParseWorkerPool = (
	workerCount = getWorkerCount(),
	workerFactory: DicomParseWorkerFactory | null = workerCount > 0
		? createDicomParseWorker
		: null,
): DicomParseWorkerPool => {
	if (workerCount <= 0 || !workerFactory) {
		return {
			parse: parseDicomFileDirectly,
			terminate: () => undefined,
		};
	}

	let nextId = 1;
	let terminated = false;
	const queue: PendingWorkerTask[] = [];
	const pending = new Map<number, PendingWorkerTask>();
	const slots: WorkerSlot[] = [];

	const attachWorkerHandlers = (slot: WorkerSlot) => {
		slot.worker.addEventListener(
			"message",
			(event: MessageEvent<DicomParseWorkerResponse>) => {
				const message = event.data;
				const task = pending.get(message.id);
				if (!task) return;

				pending.delete(message.id);
				slot.currentTaskId = null;
				slot.busy = false;

				if (message.type === "success") {
					task.resolve({
						fileInfo: message.fileInfo,
						rawData: message.rawData,
					});
				} else {
					task.reject(restoreWorkerError(message.error));
				}
				runNext();
			},
		);
		slot.worker.addEventListener("error", (event: ErrorEvent) => {
			const currentTaskId = slot.currentTaskId;
			if (currentTaskId !== null) {
				const task = pending.get(currentTaskId);
				pending.delete(currentTaskId);
				task?.reject(restoreWorkerCrashError(event));
			}

			slot.currentTaskId = null;
			slot.busy = false;
			slot.worker.terminate();

			if (terminated) return;
			slot.worker = workerFactory();
			attachWorkerHandlers(slot);
			runNext();
		});
	};

	const runNext = () => {
		if (terminated) return;
		const slot = slots.find((candidate) => !candidate.busy);
		const task = queue.shift();
		if (!slot || !task) return;

		slot.busy = true;
		const id = nextId++;
		slot.currentTaskId = id;
		pending.set(id, task);
		const fileName = getFileName(task.input.path);
		slot.worker.postMessage(
			{
				id,
				type: "parse",
				payload: {
					path: task.input.path,
					fileName,
					imageId: `roentgen:${task.input.path}`,
					data: task.input.data,
				},
			},
			[task.input.data],
		);
	};

	for (let i = 0; i < workerCount; i++) {
		const worker = workerFactory();
		const slot: WorkerSlot = { worker, busy: false, currentTaskId: null };
		attachWorkerHandlers(slot);
		slots.push(slot);
	}

	return {
		parse: (input) =>
			new Promise((resolve, reject) => {
				if (terminated) {
					reject(new Error("DICOM parse worker pool is terminated"));
					return;
				}
				queue.push({ input, resolve, reject });
				runNext();
			}),
		terminate: () => {
			terminated = true;
			for (const slot of slots) {
				slot.worker.terminate();
			}
			for (const task of queue) {
				task.reject(new Error("DICOM parse worker pool is terminated"));
			}
			for (const task of pending.values()) {
				task.reject(new Error("DICOM parse worker pool is terminated"));
			}
			queue.length = 0;
			pending.clear();
		},
	};
};

const SINGLE_FILE_WARNING_BYTES = 1.5 * 1024 ** 3;
const CUMULATIVE_WARNING_BYTES = 3 * 1024 ** 3;

const estimatePixelBytes = (fileInfo: DicomFileInfo): number => {
	const bytesPerSample = Math.max(1, Math.ceil(fileInfo.bitsAllocated / 8));
	return (
		fileInfo.columns *
		fileInfo.rows *
		Math.max(1, fileInfo.totalFrames) *
		Math.max(1, fileInfo.samplesPerPixel) *
		bytesPerSample
	);
};

const warnIfOversizedDicom = (
	fileInfo: DicomFileInfo,
	cumulativeBytes: number,
): number => {
	const fileBytes = estimatePixelBytes(fileInfo);
	const nextCumulativeBytes = cumulativeBytes + fileBytes;
	if (
		fileBytes > SINGLE_FILE_WARNING_BYTES ||
		nextCumulativeBytes > CUMULATIVE_WARNING_BYTES
	) {
		console.warn(
			`[useDicomLoader] 大容量DICOMの可能性があります: ${fileInfo.fileName} ` +
				`(${(fileBytes / 1024 ** 3).toFixed(2)} GB, cumulative ${(nextCumulativeBytes / 1024 ** 3).toFixed(2)} GB)`,
		);
	}
	return nextCumulativeBytes;
};

export const useDicomLoader = () => {
	const [loadState, setLoadState] = useState<DicomLoadState>({
		status: "idle",
	});
	const [dicomFiles, setDicomFiles] = useState<DicomFileInfo[]>([]);

	// cornerstoneのimageDataMap登録関数への参照
	// DicomFileInfoにrawDataを保持せず、ロード時にcornerstone側に直接登録する
	const registrarRef = useRef<ImageDataRegistrar | null>(null);
	// registrar未接続時のバッファ（dev自動読込時に発生）
	const pendingDataRef = useRef<Map<string, ArrayBuffer>>(new Map());
	// キャンセルフラグ
	const cancelRef = useRef(false);
	const workerPoolRef = useRef<DicomParseWorkerPool | null>(null);

	useEffect(() => {
		return () => {
			workerPoolRef.current?.terminate();
			workerPoolRef.current = null;
		};
	}, []);

	const setImageDataRegistrar = useCallback((fn: ImageDataRegistrar) => {
		registrarRef.current = fn;
		// バッファ内のデータをフラッシュ
		for (const [path, data] of pendingDataRef.current) {
			fn(path, data);
		}
		pendingDataRef.current.clear();
	}, []);

	const cancelLoad = useCallback(() => {
		cancelRef.current = true;
		setLoadState((prev) => {
			if (prev.status === "loading") {
				return { ...prev, cancelRequested: true };
			}
			return prev;
		});
	}, []);

	const loadFiles = useCallback(
		async (fileDataList: { path: string; data: ArrayBuffer }[]) => {
			cancelRef.current = false;
			setLoadState({ status: "loading", progress: 0 });
			workerPoolRef.current ??= createDicomParseWorkerPool();

			const loaded: DicomFileInfo[] = [];
			const skipped: DicomFileError[] = [];
			const filesToLoad = selectDicomdirReferencedFiles(fileDataList, skipped);
			let cumulativePixelBytes = 0;

			for (let i = 0; i < filesToLoad.length; i++) {
				// キャンセルチェック
				if (cancelRef.current) {
					setLoadState({ status: "cancelled" });
					return;
				}

				const fileData = filesToLoad[i];
				if (!fileData) continue;

				try {
					// 事前DICOM検証（非DICOMファイルの早期検出）
					if (!isDicomFile(fileData.data)) {
						skipped.push({
							filePath: fileData.path,
							reason: "not-dicom",
							detail: "レントゲン画像ではありません",
						});
						setLoadState({
							status: "loading",
							progress: ((i + 1) / filesToLoad.length) * 100,
						});
						continue;
					}

					const parsed = await workerPoolRef.current.parse(fileData);
					cumulativePixelBytes = warnIfOversizedDicom(
						parsed.fileInfo,
						cumulativePixelBytes,
					);

					// rawDataをcornerstoneのimageDataMapに直接登録
					// DicomFileInfoにはrawDataを保持しない（メモリ節約）
					if (registrarRef.current) {
						registrarRef.current(fileData.path, parsed.rawData);
					} else {
						// registrar未接続時はバッファに保持
						pendingDataRef.current.set(fileData.path, parsed.rawData);
					}

					loaded.push(parsed.fileInfo);
				} catch (error) {
					const fileError = classifyParseError(
						fileData.path,
						error,
						fileData.data,
						true,
					);
					skipped.push(fileError);
					console.error(
						`[useDicomLoader] ${fileError.detail}: ${fileData.path}`,
						error,
					);
				}

				setLoadState({
					status: "loading",
					progress: ((i + 1) / filesToLoad.length) * 100,
				});
			}

			if (loaded.length === 0) {
				setLoadState({
					status: "error",
					message: getPrimaryLoadErrorMessage(skipped),
					skipped,
				});
				return;
			}

			// instanceNumber順にソート
			loaded.sort((a, b) => {
				const aNum = a.instanceNumber ?? 0;
				const bNum = b.instanceNumber ?? 0;
				return aNum - bNum;
			});

			setDicomFiles(loaded);
			setLoadState({ status: "loaded", files: loaded, skipped });
		},
		[],
	);

	const clearFiles = useCallback(() => {
		setDicomFiles((prev) => {
			for (const file of prev) {
				releaseImage(file.imageId);
			}
			return [];
		});
		setLoadState({ status: "idle" });
		pendingDataRef.current.clear();
	}, []);

	// 指定インデックスのファイルを除去（選択クリア用）
	const removeFile = useCallback((index: number) => {
		setDicomFiles((prev) => {
			const removed = prev[index];
			if (removed) {
				releaseImage(removed.imageId);
			}
			const next = prev.filter((_, i) => i !== index);
			if (next.length === 0) {
				setLoadState({ status: "idle" });
			}
			return next;
		});
	}, []);

	return {
		loadState,
		dicomFiles,
		loadFiles,
		clearFiles,
		removeFile,
		cancelLoad,
		setImageDataRegistrar,
	};
};
