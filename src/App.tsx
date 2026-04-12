import { CircleDot } from "lucide-react";
import { useCallback, useEffect } from "react";
import { FileDropZone } from "./components/file-drop-zone";
import { DicomViewer } from "./components/viewer/dicom-viewer";
import { useDicomLoader } from "./hooks/use-dicom-loader";

export const App = () => {
	const {
		loadState,
		dicomFiles,
		loadFiles,
		clearFiles,
		removeFile,
		setImageDataRegistrar,
	} = useDicomLoader();

	// dev環境でのテスト用自動読込（Electron環境のみ）
	// dicom-files/配下の全.dcmファイルを自動で読み込む
	useEffect(() => {
		const api = (
			window as {
				electronAPI?: {
					loadTestDicom?: () => Promise<
						{ path: string; data: ArrayBuffer }[] | null
					>;
				};
			}
		).electronAPI;
		if (
			import.meta.env.DEV &&
			dicomFiles.length === 0 &&
			loadState.status === "idle" &&
			api?.loadTestDicom
		) {
			api
				.loadTestDicom()
				.then((results) => {
					if (!results || results.length === 0) return;
					loadFiles(results);
				})
				.catch((err: unknown) => console.warn("[dev autoload]", err));
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
				return "ファイル待機";
			case "loading":
				return `読込 ${Math.round(loadState.progress)}%`;
			case "loaded":
				return `${dicomFiles.length} ファイル`;
			case "error":
				return `エラー: ${loadState.message}`;
		}
	})();

	const statusDotColor = (() => {
		switch (loadState.status) {
			case "idle":
				return "text-zinc-500";
			case "loading":
				return "text-sky-400 animate-pulse";
			case "loaded":
				return "text-sky-400";
			case "error":
				return "text-rose-400";
		}
	})();

	return (
		<div className="relative flex h-screen w-screen flex-col overflow-hidden">
			<header className="flex h-11 shrink-0 items-center gap-3 border-b border-white/[0.06] px-5 panel-surface">
				<h1 className="text-[13px] font-semibold tracking-wide text-zinc-200">
					Roentgen
				</h1>
				<span className="ml-auto chip">
					<CircleDot size={11} className={statusDotColor} />
					<span className="font-sans">{statusText}</span>
				</span>
				{dicomFiles.length > 0 && (
					<button type="button" onClick={clearFiles} className="chip">
						クリア
					</button>
				)}
			</header>

			<main className="flex min-h-0 flex-1">
				{dicomFiles.length === 0 ? (
					<FileDropZone onFilesLoaded={handleFilesLoaded} />
				) : (
					<DicomViewer
						files={dicomFiles}
						onClearAll={clearFiles}
						onRemoveFile={removeFile}
						setImageDataRegistrar={setImageDataRegistrar}
					/>
				)}
			</main>
		</div>
	);
};
