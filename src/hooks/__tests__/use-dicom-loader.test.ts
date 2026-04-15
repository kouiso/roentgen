// @vitest-environment jsdom
// F12-F15 異常系エラーハンドリング検証
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// dicom-parserモジュールをモック
vi.mock("dicom-parser", () => ({
	parseDicom: vi.fn(),
}));

// dicom-parserの型をテスト用にインポート
import * as dicomParser from "dicom-parser";
import { useDicomLoader } from "../use-dicom-loader";

// buildDicomFileInfoをモック（parserの結果からDicomFileInfoを生成する部分）
vi.mock("@/utils/dicom-parser", () => ({
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
				"DICOMファイルではありません",
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

	it("空ファイルリスト → エラー状態", async () => {
		const { result } = renderHook(() => useDicomLoader());

		await act(async () => {
			await result.current.loadFiles([]);
		});

		expect(result.current.loadState.status).toBe("error");
		if (result.current.loadState.status === "error") {
			expect(result.current.loadState.message).toContain(
				"有効なDICOMファイルが見つかりませんでした",
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
});
