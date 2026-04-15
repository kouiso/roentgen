// DICOMファイル読込フック（renkeibox useDicomLoader.ts 参考）
// ローカルファイル専用に簡略化（サーバー依存コード不要）
import { useCallback, useRef, useState } from "react";
import type {
	DicomFileError,
	DicomFileInfo,
	DicomLoadState,
} from "@/types/dicom";
import { buildDicomFileInfo } from "@/utils/dicom-parser";

// dicom-parserライブラリの動的インポート型
// biome-ignore lint/suspicious/noExplicitAny: dicom-parserに型定義がないため
type DicomParser = { parseDicom: (byteArray: Uint8Array) => any };

let dicomParserModule: DicomParser | null = null;

const getDicomParser = async (): Promise<DicomParser> => {
	if (!dicomParserModule) {
		dicomParserModule = await import("dicom-parser");
	}
	return dicomParserModule;
};

// rawDataの登録コールバック型
type ImageDataRegistrar = (filePath: string, data: ArrayBuffer) => void;

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
): DicomFileError => {
	const detail = error instanceof Error ? error.message : "不明なエラー";

	if (!isDicomFile(data)) {
		return {
			filePath,
			reason: "not-dicom",
			detail: "DICOMファイルではありません",
		};
	}

	return {
		filePath,
		reason: "corrupt",
		detail: `ファイルが破損しています: ${detail}`,
	};
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

			let parser: DicomParser;
			try {
				parser = await getDicomParser();
			} catch (err) {
				setLoadState({
					status: "error",
					message: `dicom-parser読込失敗: ${err}`,
				});
				return;
			}

			const loaded: DicomFileInfo[] = [];
			const skipped: DicomFileError[] = [];

			for (let i = 0; i < fileDataList.length; i++) {
				// キャンセルチェック
				if (cancelRef.current) {
					setLoadState({ status: "cancelled" });
					return;
				}

				const fileData = fileDataList[i];
				if (!fileData) continue;

				try {
					// 事前DICOM検証（非DICOMファイルの早期検出）
					if (!isDicomFile(fileData.data)) {
						skipped.push({
							filePath: fileData.path,
							reason: "not-dicom",
							detail: "DICOMファイルではありません",
						});
						setLoadState({
							status: "loading",
							progress: ((i + 1) / fileDataList.length) * 100,
						});
						continue;
					}

					const byteArray = new Uint8Array(fileData.data);
					const dataSet = parser.parseDicom(byteArray);
					const fileName = fileData.path.split("/").pop() ?? fileData.path;
					const imageId = `roentgen:${fileData.path}`;

					const fileInfo = buildDicomFileInfo(
						dataSet,
						imageId,
						fileData.path,
						fileName,
						fileData.data,
					);

					// rawDataをcornerstoneのimageDataMapに直接登録
					// DicomFileInfoにはrawDataを保持しない（メモリ節約）
					if (registrarRef.current) {
						registrarRef.current(fileData.path, fileData.data);
					} else {
						// registrar未接続時はバッファに保持
						pendingDataRef.current.set(fileData.path, fileData.data);
					}

					loaded.push(fileInfo);
				} catch (error) {
					const fileError = classifyParseError(
						fileData.path,
						error,
						fileData.data,
					);
					skipped.push(fileError);
					console.error(
						`[useDicomLoader] ${fileError.detail}: ${fileData.path}`,
						error,
					);
				}

				setLoadState({
					status: "loading",
					progress: ((i + 1) / fileDataList.length) * 100,
				});
			}

			if (loaded.length === 0) {
				const primaryError =
					skipped.length > 0
						? skipped.some((s) => s.reason === "not-dicom")
							? "DICOMファイルではありません"
							: "ファイルが破損しているか、有効なDICOMデータを含んでいません"
						: "有効なDICOMファイルが見つかりませんでした";

				setLoadState({
					status: "error",
					message: primaryError,
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
		setDicomFiles([]);
		setLoadState({ status: "idle" });
		pendingDataRef.current.clear();
	}, []);

	// 指定インデックスのファイルを除去（選択クリア用）
	const removeFile = useCallback((index: number) => {
		setDicomFiles((prev) => {
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
