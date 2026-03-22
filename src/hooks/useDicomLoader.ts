// DICOMファイル読込フック（renkeibox useDicomLoader.ts 参考）
// ローカルファイル専用に簡略化（サーバー依存コード不要）
import { useCallback, useState } from "react";
import type { DicomFileInfo, DicomLoadState } from "@/types/dicom";
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

export const useDicomLoader = () => {
	const [loadState, setLoadState] = useState<DicomLoadState>({
		status: "idle",
	});
	const [dicomFiles, setDicomFiles] = useState<DicomFileInfo[]>([]);

	const loadFiles = useCallback(
		async (fileDataList: { path: string; data: ArrayBuffer }[]) => {
			setLoadState({ status: "loading", progress: 0 });

			let parser: DicomParser;
			try {
				parser = await getDicomParser();
			} catch (err) {
				setLoadState({ status: "error", message: `dicom-parser読込失敗: ${err}` });
				return;
			}

			const loaded: DicomFileInfo[] = [];

			for (let i = 0; i < fileDataList.length; i++) {
				const fileData = fileDataList[i];
				if (!fileData) continue;

				try {
					const byteArray = new Uint8Array(fileData.data);
					const dataSet = parser.parseDicom(byteArray);
					const fileName =
						fileData.path.split("/").pop() ?? fileData.path;
					const imageId = `roentgen:${fileData.path}`;

					const fileInfo = buildDicomFileInfo(
						dataSet,
						imageId,
						fileData.path,
						fileName,
						fileData.data,
					);

					loaded.push(fileInfo);
				} catch (error) {
					console.error(
						`[useDicomLoader] DICOMパースエラー: ${fileData.path}`,
						error,
					);
				}

				setLoadState({
					status: "loading",
					progress: ((i + 1) / fileDataList.length) * 100,
				});
			}

			if (loaded.length === 0) {
				setLoadState({
					status: "error",
					message: "有効なDICOMファイルが見つかりませんでした",
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
			setLoadState({ status: "loaded", files: loaded });
		},
		[],
	);

	const clearFiles = useCallback(() => {
		setDicomFiles([]);
		setLoadState({ status: "idle" });
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
	};
};
