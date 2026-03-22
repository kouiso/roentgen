import { useCallback, useEffect } from "react";
import { FileDropZone } from "./components/FileDropZone";
import { DicomViewer } from "./components/Viewer/DicomViewer";
import { useDicomLoader } from "./hooks/useDicomLoader";

export const App = () => {
	const { loadState, dicomFiles, loadFiles, clearFiles } = useDicomLoader();

	// dev環境でのテスト用自動読込（Electron環境のみ）
	// dicom-files/配下の全.dcmファイルを自動で読み込む
	useEffect(() => {
		const api = (window as { electronAPI?: {
			loadTestDicom?: () => Promise<{ path: string; data: ArrayBuffer }[] | null>;
		} }).electronAPI;
		if (import.meta.env.DEV && dicomFiles.length === 0 && loadState.status === "idle" && api?.loadTestDicom) {
			api.loadTestDicom()
				.then((results) => {
					if (!results || results.length === 0) return;
					loadFiles(results);
				})
				.catch(() => {});
		}
	}, [dicomFiles.length, loadFiles, loadState.status]);

	const handleFilesLoaded = useCallback(
		(files: { path: string; data: ArrayBuffer }[]) => {
			loadFiles(files);
		},
		[loadFiles],
	);

	const statusText = (() => {
		switch (loadState.status) {
			case "idle":
				return "DICOMファイルをドロップまたは選択";
			case "loading":
				return `読込中... ${Math.round(loadState.progress)}%`;
			case "loaded":
				return `${dicomFiles.length} ファイル読込済`;
			case "error":
				return `エラー: ${loadState.message}`;
		}
	})();

	return (
		<div className="flex h-screen w-screen flex-col overflow-hidden bg-neutral-950">
			<header className="flex h-10 shrink-0 items-center border-b border-neutral-800 px-4">
				<h1 className="text-sm font-medium text-neutral-300">
					Roentgen — ルバーノのレントゲンビューア
				</h1>
				<span className="ml-auto text-xs text-neutral-500">
					{statusText}
				</span>
				{dicomFiles.length > 0 && (
					<button
						type="button"
						onClick={clearFiles}
						className="ml-3 text-xs text-neutral-600 hover:text-neutral-400"
					>
						クリア
					</button>
				)}
			</header>

			<main className="flex min-h-0 flex-1">
				{dicomFiles.length === 0 ? (
					<FileDropZone onFilesLoaded={handleFilesLoaded} />
				) : (
					<DicomViewer files={dicomFiles} />
				)}
			</main>
		</div>
	);
};
