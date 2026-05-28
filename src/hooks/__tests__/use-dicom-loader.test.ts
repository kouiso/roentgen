// @vitest-environment jsdom
// F12-F15 異常系エラーハンドリング検証
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const cornerstoneMock = vi.hoisted(() => ({
	loadImage: vi.fn(),
	registerImageLoader: vi.fn(),
	renderToCanvas: vi.fn(),
	imageLoader: {
		purge: vi.fn(),
	},
	imageCache: {
		removeImageLoadObject: vi.fn(),
	},
}));

// dicom-parserモジュールをモック
vi.mock("dicom-parser", () => ({
	parseDicom: vi.fn(),
	default: {
		parseDicom: vi.fn(),
	},
}));

vi.mock("cornerstone-core", () => ({
	default: cornerstoneMock,
}));

vi.mock("cornerstone-wado-image-loader", () => ({
	default: {
		external: {},
		configure: vi.fn(),
	},
}));

// dicom-parserの型をテスト用にインポート
import * as dicomParser from "dicom-parser";
import {
	buildDicomFileInfo,
	UnsupportedTransferSyntaxError,
} from "@/utils/dicom-parser";
import { getSharedImageDataMapSize, useCornerstone } from "../use-cornerstone";
import {
	createDicomParseWorkerPool,
	useDicomLoader,
} from "../use-dicom-loader";

// buildDicomFileInfoをモック（parserの結果からDicomFileInfoを生成する部分）
vi.mock("@/utils/dicom-parser", () => ({
	UnsupportedTransferSyntaxError: class UnsupportedTransferSyntaxError extends Error {
		transferSyntaxUid: string;

		constructor(transferSyntaxUid: string) {
			super(`Unsupported Transfer Syntax UID: ${transferSyntaxUid}`);
			this.name = "UnsupportedTransferSyntaxError";
			this.transferSyntaxUid = transferSyntaxUid;
		}
	},
	buildDicomFileInfo: vi.fn(
		(
			_dataSet: unknown,
			imageId: string,
			filePath: string,
			fileName: string,
		) => ({
			imageId,
			filePath,
			fileName,
			frameIndex: 0,
			totalFrames: 1,
			rows: 512,
			columns: 512,
			bitsAllocated: 16,
			bitsStored: 12,
			highBit: 11,
			pixelRepresentation: 0,
			samplesPerPixel: 1,
			photometricInterpretation: "MONOCHROME2",
			rescaleIntercept: 0,
			rescaleSlope: 1,
			windowCenter: 400,
			windowWidth: 1500,
			pixelSpacing: null,
			imageOrientationPatient: null,
			imagePositionPatient: null,
			sliceThickness: null,
			sliceLocation: null,
			instanceNumber: null,
			studyInstanceUID: null,
			seriesInstanceUID: null,
			modalityLutSequence: null,
			voiLutSequence: null,
			overlayData: [],
			tags: {},
			thumbnailData: null,
		}),
	),
}));

// DICOMマジックバイト付きのArrayBufferを生成
const makeDicomBuffer = (): ArrayBuffer => {
	const buf = new ArrayBuffer(256);
	const view = new Uint8Array(buf);
	// offset 128: "DICM"
	view[128] = 0x44; // D
	view[129] = 0x49; // I
	view[130] = 0x43; // C
	view[131] = 0x4d; // M
	return buf;
};

// 非DICOMファイル用のArrayBuffer（マジックバイトなし）
const makeNonDicomBuffer = (): ArrayBuffer => {
	return new ArrayBuffer(256);
};

const makeFakeFileData = (
	path: string,
): { path: string; data: ArrayBuffer } => ({
	path,
	data: makeDicomBuffer(),
});

const makeFakeNonDicomFileData = (
	path: string,
): { path: string; data: ArrayBuffer } => ({
	path,
	data: makeNonDicomBuffer(),
});

describe("useDicomLoader — F12-F15 異常系", () => {
	it("F12: 破損DICOMファイル — parseDicom例外 → エラーステートで継続", async () => {
		const mockParseDicom = vi.mocked(dicomParser.parseDicom);
		mockParseDicom.mockImplementation(() => {
			throw new Error("dicom parsing error - invalid header");
		});

		const { result } = renderHook(() => useDicomLoader());

		await act(async () => {
			await result.current.loadFiles([makeFakeFileData("/test/corrupt.dcm")]);
		});

		expect(result.current.loadState.status).toBe("error");
		if (result.current.loadState.status === "error") {
			expect(result.current.loadState.message).toContain("破損");
			expect(result.current.loadState.skipped).toHaveLength(1);
			expect(result.current.loadState.skipped?.[0]?.reason).toBe("corrupt");
		}
		expect(result.current.dicomFiles).toHaveLength(0);
	});

	it("F12: 一部破損 — 正常ファイルは読込成功、破損ファイルはスキップ", async () => {
		const mockParseDicom = vi.mocked(dicomParser.parseDicom);
		let callCount = 0;
		mockParseDicom.mockImplementation(() => {
			callCount++;
			if (callCount === 1) {
				throw new Error("corrupt file");
			}
			return { string: () => undefined, uint16: () => undefined, elements: {} };
		});

		const { result } = renderHook(() => useDicomLoader());

		await act(async () => {
			await result.current.loadFiles([
				makeFakeFileData("/test/corrupt.dcm"),
				makeFakeFileData("/test/valid.dcm"),
			]);
		});

		expect(result.current.loadState.status).toBe("loaded");
		expect(result.current.dicomFiles).toHaveLength(1);
		if (result.current.loadState.status === "loaded") {
			expect(result.current.loadState.skipped).toHaveLength(1);
			expect(result.current.loadState.skipped[0]?.reason).toBe("corrupt");
		}
	});

	it("C5: 非対応Transfer Syntaxをユーザー向けエラーとして返す", async () => {
		const mockParseDicom = vi.mocked(dicomParser.parseDicom);
		mockParseDicom.mockReturnValue({
			string: () => undefined,
			uint16: () => undefined,
			elements: {},
		});
		const mockBuildDicomFileInfo = vi.mocked(buildDicomFileInfo);
		mockBuildDicomFileInfo.mockImplementationOnce(() => {
			throw new UnsupportedTransferSyntaxError("1.2.840.10008.1.2.4.90");
		});

		const { result } = renderHook(() => useDicomLoader());

		await act(async () => {
			await result.current.loadFiles([makeFakeFileData("/test/jpeg2000.dcm")]);
		});

		expect(result.current.loadState.status).toBe("error");
		if (result.current.loadState.status === "error") {
			expect(result.current.loadState.message).toContain(
				"対応していない圧縮形式",
			);
			expect(result.current.loadState.skipped).toHaveLength(1);
			expect(result.current.loadState.skipped?.[0]?.detail).toContain(
				"1.2.840.10008.1.2.4.90",
			);
		}
	});

	it("F13: 非DICOMファイル(.jpg) — マジックバイト検証で早期検出", async () => {
		const { result } = renderHook(() => useDicomLoader());

		await act(async () => {
			await result.current.loadFiles([
				makeFakeNonDicomFileData("/test/photo.jpg"),
			]);
		});

		expect(result.current.loadState.status).toBe("error");
		if (result.current.loadState.status === "error") {
			expect(result.current.loadState.message).toBe(
				"レントゲン画像ではありません",
			);
			expect(result.current.loadState.skipped).toHaveLength(1);
			expect(result.current.loadState.skipped?.[0]?.reason).toBe("not-dicom");
		}
	});

	it("F13: 非DICOMとDICOMの混在 — 非DICOMはスキップ、DICOMは読込", async () => {
		const mockParseDicom = vi.mocked(dicomParser.parseDicom);
		mockParseDicom.mockReturnValue({
			string: () => undefined,
			uint16: () => undefined,
			elements: {},
		});

		const { result } = renderHook(() => useDicomLoader());

		await act(async () => {
			await result.current.loadFiles([
				makeFakeNonDicomFileData("/test/photo.jpg"),
				makeFakeFileData("/test/valid.dcm"),
			]);
		});

		expect(result.current.loadState.status).toBe("loaded");
		expect(result.current.dicomFiles).toHaveLength(1);
		if (result.current.loadState.status === "loaded") {
			expect(result.current.loadState.skipped).toHaveLength(1);
			expect(result.current.loadState.skipped[0]?.reason).toBe("not-dicom");
		}
	});

	it("F14: 複数ファイル読込でプログレス更新される", async () => {
		const mockParseDicom = vi.mocked(dicomParser.parseDicom);
		mockParseDicom.mockReturnValue({
			string: () => undefined,
			uint16: () => undefined,
			elements: {},
		});

		const { result } = renderHook(() => useDicomLoader());

		const files = Array.from({ length: 5 }, (_, i) =>
			makeFakeFileData(`/test/file${i}.dcm`),
		);

		await act(async () => {
			await result.current.loadFiles(files);
		});

		expect(result.current.loadState.status).toBe("loaded");
		expect(result.current.dicomFiles).toHaveLength(5);
	});

	it("F14: cancelLoadでキャンセル状態になる", async () => {
		const mockParseDicom = vi.mocked(dicomParser.parseDicom);
		// parseDicomが呼ばれるたびにcancelを発火させるため遅延シミュレーション
		let loadCallCount = 0;
		let cancelFn: (() => void) | null = null;
		mockParseDicom.mockImplementation(() => {
			loadCallCount++;
			// 2番目のファイル処理時にキャンセル
			if (loadCallCount === 2 && cancelFn) {
				cancelFn();
			}
			return { string: () => undefined, uint16: () => undefined, elements: {} };
		});

		const { result } = renderHook(() => useDicomLoader());
		cancelFn = result.current.cancelLoad;

		const files = Array.from({ length: 5 }, (_, i) =>
			makeFakeFileData(`/test/file${i}.dcm`),
		);

		await act(async () => {
			await result.current.loadFiles(files);
		});

		expect(result.current.loadState.status).toBe("cancelled");
	});

	it("初期状態はidle", () => {
		const { result } = renderHook(() => useDicomLoader());
		expect(result.current.loadState.status).toBe("idle");
		expect(result.current.dicomFiles).toHaveLength(0);
	});

	it("clearFilesでidle状態に戻る", async () => {
		const mockParseDicom = vi.mocked(dicomParser.parseDicom);
		mockParseDicom.mockReturnValue({
			string: () => undefined,
			uint16: () => undefined,
			elements: {},
		});

		const { result } = renderHook(() => useDicomLoader());

		await act(async () => {
			await result.current.loadFiles([makeFakeFileData("/test/valid.dcm")]);
		});
		expect(result.current.dicomFiles).toHaveLength(1);

		act(() => {
			result.current.clearFiles();
		});

		expect(result.current.loadState.status).toBe("idle");
		expect(result.current.dicomFiles).toHaveLength(0);
	});

	it("C4: removeFileとclearFilesでcornerstone共有画像データを解放する", async () => {
		const mockParseDicom = vi.mocked(dicomParser.parseDicom);
		mockParseDicom.mockReturnValue({
			string: () => undefined,
			uint16: () => undefined,
			elements: {},
		});

		const loader = renderHook(() => useDicomLoader());
		const cornerstone = renderHook(() => useCornerstone());

		act(() => {
			cornerstone.result.current.clearAllImageData();
			loader.result.current.setImageDataRegistrar(
				cornerstone.result.current.registerImageData,
			);
		});

		await act(async () => {
			await loader.result.current.loadFiles([
				makeFakeFileData("/test/a.dcm"),
				makeFakeFileData("/test/b.dcm"),
			]);
		});
		expect(getSharedImageDataMapSize()).toBe(2);

		act(() => {
			loader.result.current.removeFile(0);
		});
		expect(getSharedImageDataMapSize()).toBe(1);

		act(() => {
			loader.result.current.clearFiles();
		});
		expect(getSharedImageDataMapSize()).toBe(0);
	});

	it("空ファイルリスト → エラー状態", async () => {
		const { result } = renderHook(() => useDicomLoader());

		await act(async () => {
			await result.current.loadFiles([]);
		});

		expect(result.current.loadState.status).toBe("error");
		if (result.current.loadState.status === "error") {
			expect(result.current.loadState.message).toContain(
				"読み込める画像ファイルが見つかりませんでした",
			);
		}
	});

	it("removeFileでファイルを除去できる", async () => {
		const mockParseDicom = vi.mocked(dicomParser.parseDicom);
		mockParseDicom.mockReturnValue({
			string: () => undefined,
			uint16: () => undefined,
			elements: {},
		});

		const { result } = renderHook(() => useDicomLoader());

		await act(async () => {
			await result.current.loadFiles([
				makeFakeFileData("/test/a.dcm"),
				makeFakeFileData("/test/b.dcm"),
			]);
		});
		expect(result.current.dicomFiles).toHaveLength(2);

		act(() => {
			result.current.removeFile(0);
		});

		expect(result.current.dicomFiles).toHaveLength(1);
	});

	it("全ファイルremoveでidle状態に戻る", async () => {
		const mockParseDicom = vi.mocked(dicomParser.parseDicom);
		mockParseDicom.mockReturnValue({
			string: () => undefined,
			uint16: () => undefined,
			elements: {},
		});

		const { result } = renderHook(() => useDicomLoader());

		await act(async () => {
			await result.current.loadFiles([makeFakeFileData("/test/a.dcm")]);
		});

		act(() => {
			result.current.removeFile(0);
		});

		expect(result.current.loadState.status).toBe("idle");
		expect(result.current.dicomFiles).toHaveLength(0);
	});

	it("setImageDataRegistrar — registrar未設定時にロードしたデータはバッファに保持され、registrar設定時にフラッシュ", async () => {
		const mockParseDicom = vi.mocked(dicomParser.parseDicom);
		mockParseDicom.mockReturnValue({
			string: () => undefined,
			uint16: () => undefined,
			elements: {},
		});

		const { result } = renderHook(() => useDicomLoader());

		// Load without registrar → data goes to pending buffer
		await act(async () => {
			await result.current.loadFiles([makeFakeFileData("/test/pending.dcm")]);
		});

		// Set registrar → should flush pending
		const registrar = vi.fn();
		act(() => {
			result.current.setImageDataRegistrar(registrar);
		});

		expect(registrar).toHaveBeenCalledTimes(1);
		expect(registrar).toHaveBeenCalledWith(
			"/test/pending.dcm",
			expect.any(ArrayBuffer),
		);
	});

	it("setImageDataRegistrar — 既にregistrar設定済みの場合、loadFilesで直接registrarを呼ぶ", async () => {
		const mockParseDicom = vi.mocked(dicomParser.parseDicom);
		mockParseDicom.mockReturnValue({
			string: () => undefined,
			uint16: () => undefined,
			elements: {},
		});

		const registrar = vi.fn();
		const { result } = renderHook(() => useDicomLoader());

		act(() => {
			result.current.setImageDataRegistrar(registrar);
		});

		await act(async () => {
			await result.current.loadFiles([makeFakeFileData("/test/direct.dcm")]);
		});

		expect(registrar).toHaveBeenCalledWith(
			"/test/direct.dcm",
			expect.any(ArrayBuffer),
		);
	});

	it("F15: 小さすぎるファイル（132バイト未満）は非DICOMとして扱う", async () => {
		const { result } = renderHook(() => useDicomLoader());

		const tinyBuffer = new ArrayBuffer(50);
		await act(async () => {
			await result.current.loadFiles([
				{ path: "/test/tiny.dcm", data: tinyBuffer },
			]);
		});

		expect(result.current.loadState.status).toBe("error");
		if (result.current.loadState.status === "error") {
			expect(result.current.loadState.skipped?.[0]?.reason).toBe("not-dicom");
		}
	});

	it("DICOMDIRがある場合はIMAGEレコードで参照されたファイルだけを読み込む", async () => {
		const dicomdirDataSet = {
			string: () => undefined,
			uint16: () => undefined,
			elements: {
				x00041220: {
					items: [
						{
							dataSet: {
								string: (tag: string) =>
									tag === "x00041430" ? "PATIENT" : undefined,
								elements: {},
							},
						},
						{
							dataSet: {
								string: (tag: string) => {
									if (tag === "x00041430") return "IMAGE";
									if (tag === "x00041500") return "IMAGE\\IM00001";
									return undefined;
								},
								elements: {},
							},
						},
						{
							dataSet: {
								string: (tag: string) => {
									if (tag === "x00041430") return "IMAGE";
									if (tag === "x00041500") return "IMAGE\\IM00002";
									return undefined;
								},
								elements: {},
							},
						},
					],
				},
			},
		};
		const imageDataSet = {
			string: () => undefined,
			uint16: () => undefined,
			elements: {},
		};
		const mockParseDicom = vi.mocked(dicomParser.parseDicom);
		mockParseDicom.mockReset();
		mockParseDicom
			.mockReturnValueOnce(dicomdirDataSet)
			.mockReturnValue(imageDataSet);

		const { result } = renderHook(() => useDicomLoader());

		await act(async () => {
			await result.current.loadFiles([
				{ path: "/cd/DICOMDIR", data: makeDicomBuffer() },
				makeFakeFileData("/cd/IMAGE/IM00001"),
				makeFakeFileData("/cd/IMAGE/IM00002"),
				makeFakeFileData("/cd/IMAGE/UNREFERENCED"),
			]);
		});

		expect(result.current.loadState.status).toBe("loaded");
		expect(result.current.dicomFiles.map((file) => file.filePath)).toEqual([
			"/cd/IMAGE/IM00001",
			"/cd/IMAGE/IM00002",
		]);
		expect(result.current.dicomFiles).toHaveLength(2);
		expect(mockParseDicom).toHaveBeenCalledTimes(3);
	});

	it("M2: worker pool dispatcher returns the same FileInfo as direct parser", async () => {
		const dataSet = {
			string: () => undefined,
			uint16: () => undefined,
			elements: {},
		};
		const mockParseDicom = vi.mocked(dicomParser.parseDicom);
		mockParseDicom.mockReturnValue(dataSet);

		const expected = buildDicomFileInfo(
			dataSet,
			"roentgen:/test/worker.dcm",
			"/test/worker.dcm",
			"worker.dcm",
			makeDicomBuffer(),
		);

		let worker: TestWorker | null = null;
		const pool = createDicomParseWorkerPool(1, () => {
			worker = makeSuccessfulWorker(expected);
			return worker;
		});

		const result = await pool.parse({
			path: "/test/worker.dcm",
			data: makeDicomBuffer(),
		});

		expect(result.fileInfo).toEqual(expected);
		expect(result.rawData.byteLength).toBeGreaterThan(0);
		expect(worker?.getLastTransferList()).toHaveLength(1);

		pool.terminate();
	});

	it("M2: worker pool rethrows UnsupportedTransferSyntaxError from worker", async () => {
		const pool = createDicomParseWorkerPool(1, () =>
			makeFailingWorker(new UnsupportedTransferSyntaxError("1.2.840.bad")),
		);

		await expect(
			pool.parse({
				path: "/test/unsupported.dcm",
				data: makeDicomBuffer(),
			}),
		).rejects.toBeInstanceOf(UnsupportedTransferSyntaxError);

		pool.terminate();
	});

	it("D2: worker pool rejects the active task on worker error and replaces the worker", async () => {
		const dataSet = {
			string: () => undefined,
			uint16: () => undefined,
			elements: {},
		};
		const expected = buildDicomFileInfo(
			dataSet,
			"roentgen:/test/recovered.dcm",
			"/test/recovered.dcm",
			"recovered.dcm",
			makeDicomBuffer(),
		);

		const workers: TestWorker[] = [];
		let createCount = 0;
		const pool = createDicomParseWorkerPool(1, () => {
			createCount++;
			const worker =
				createCount === 1
					? makeCrashingWorker("worker crashed during decode")
					: makeSuccessfulWorker(expected);
			workers.push(worker);
			return worker;
		});

		const firstParse = pool.parse({
			path: "/test/crash.dcm",
			data: makeDicomBuffer(),
		});

		await expect(waitForSettlement(firstParse)).rejects.toThrow(
			"worker crashed during decode",
		);

		const secondParse = await pool.parse({
			path: "/test/recovered.dcm",
			data: makeDicomBuffer(),
		});

		expect(secondParse.fileInfo).toEqual(expected);
		expect(createCount).toBe(2);
		expect(workers[0]?.isTerminated()).toBe(true);

		pool.terminate();
	});

	it("S6: oversized DICOM metadata emits an advisory warning", async () => {
		const warnSpy = vi
			.spyOn(console, "warn")
			.mockImplementation(() => undefined);
		const mockParseDicom = vi.mocked(dicomParser.parseDicom);
		mockParseDicom.mockReturnValue({
			string: () => undefined,
			uint16: () => undefined,
			elements: {},
		});
		const mockBuildDicomFileInfo = vi.mocked(buildDicomFileInfo);
		mockBuildDicomFileInfo.mockReturnValueOnce({
			imageId: "roentgen:/test/huge.dcm",
			filePath: "/test/huge.dcm",
			fileName: "huge.dcm",
			frameIndex: 0,
			totalFrames: 100,
			rows: 4096,
			columns: 4096,
			bitsAllocated: 16,
			bitsStored: 12,
			highBit: 11,
			pixelRepresentation: 0,
			samplesPerPixel: 1,
			photometricInterpretation: "MONOCHROME2",
			rescaleIntercept: 0,
			rescaleSlope: 1,
			windowCenter: 400,
			windowWidth: 1500,
			pixelSpacing: null,
			imageOrientationPatient: null,
			imagePositionPatient: null,
			sliceThickness: null,
			sliceLocation: null,
			instanceNumber: null,
			studyInstanceUID: null,
			seriesInstanceUID: null,
			modalityLutSequence: null,
			voiLutSequence: null,
			overlayData: [],
			tags: {},
			thumbnailData: null,
		});

		const { result } = renderHook(() => useDicomLoader());

		await act(async () => {
			await result.current.loadFiles([makeFakeFileData("/test/huge.dcm")]);
		});

		expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("huge.dcm"));

		warnSpy.mockRestore();
	});
});

type WorkerMessage = {
	id: number;
	type: "parse";
	payload: {
		path: string;
		data: ArrayBuffer;
	};
};

type WorkerSuccessResponse = {
	id: number;
	type: "success";
	fileInfo: ReturnType<typeof buildDicomFileInfo>;
	rawData: ArrayBuffer;
};

type WorkerErrorResponse = {
	id: number;
	type: "error";
	error: {
		name: string;
		message: string;
		transferSyntaxUid?: string;
	};
};

type WorkerResponse = WorkerSuccessResponse | WorkerErrorResponse;

type WorkerListener = (event: MessageEvent<WorkerResponse>) => void;
type WorkerErrorListener = (event: ErrorEvent) => void;

const makeSuccessfulWorker = (
	fileInfo: ReturnType<typeof buildDicomFileInfo>,
) =>
	new TestWorker((message) => ({
		id: message.id,
		type: "success",
		fileInfo,
		rawData: message.payload.data,
	}));

const makeFailingWorker = (error: UnsupportedTransferSyntaxError) =>
	new TestWorker((message) => ({
		id: message.id,
		type: "error",
		error: {
			name: error.name,
			message: error.message,
			transferSyntaxUid: error.transferSyntaxUid,
		},
	}));

const makeCrashingWorker = (message: string) =>
	new TestWorker(() => new Error(message));

const waitForSettlement = <T>(promise: Promise<T>): Promise<T> =>
	Promise.race([
		promise,
		new Promise<T>((_, reject) => {
			setTimeout(() => {
				reject(new Error("worker task did not settle"));
			}, 50);
		}),
	]);

class TestWorker {
	private messageListener: WorkerListener | null = null;
	private errorListener: WorkerErrorListener | null = null;
	private lastTransferList: Transferable[] = [];
	private terminated = false;

	constructor(
		private readonly respond: (
			message: WorkerMessage,
		) => WorkerResponse | Error,
	) {}

	addEventListener(...args: ["message", WorkerListener]): void;
	addEventListener(...args: ["error", WorkerErrorListener]): void;
	addEventListener(
		...args: ["message", WorkerListener] | ["error", WorkerErrorListener]
	): void {
		const [eventName, listener] = args;
		if (eventName === "message") {
			this.messageListener = listener;
		} else {
			this.errorListener = listener;
		}
	}

	removeEventListener(eventName: "message", listener: WorkerListener): void {
		if (eventName === "message" && this.messageListener === listener) {
			this.messageListener = null;
		}
	}

	postMessage(message: WorkerMessage, transferList: Transferable[]): void {
		this.lastTransferList = transferList;
		queueMicrotask(() => {
			const response = this.respond(message);
			if (response instanceof Error) {
				this.errorListener?.(
					new ErrorEvent("error", { message: response.message }),
				);
				return;
			}
			this.messageListener?.(new MessageEvent("message", { data: response }));
		});
	}

	getLastTransferList(): Transferable[] {
		return this.lastTransferList;
	}

	isTerminated(): boolean {
		return this.terminated;
	}

	terminate(): void {
		this.terminated = true;
		this.messageListener = null;
		this.errorListener = null;
	}
}
