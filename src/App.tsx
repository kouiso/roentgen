import { CircleDot, Cloud, CloudOff, Loader2, LogOut } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { CrashReporterToggle } from "./components/crash-reporter-toggle";
import { ErrorBoundary } from "./components/error-boundary";
import { FileDropZone } from "./components/file-drop-zone";
import { DicomViewer } from "./components/viewer/dicom-viewer";
import { useDicomLoader } from "./hooks/use-dicom-loader";
import { useGoogleDrive } from "./hooks/use-google-drive";

export const App = () => {
	const {
		loadState,
		dicomFiles,
		loadFiles,
		clearFiles,
		removeFile,
		cancelLoad,
		setImageDataRegistrar,
	} = useDicomLoader();
	const [viewerReady, setViewerReady] = useState(false);
	const devAutoloadStartedRef = useRef(false);

	const handleFilesLoaded = useCallback(
		(files: { path: string; data: ArrayBuffer }[]) => {
			loadFiles(files);
		},
		[loadFiles],
	);

	const handleClearFiles = useCallback(() => {
		if (!window.confirm("全 DICOM をクリアします。よろしいですか？")) return;
		clearFiles();
	}, [clearFiles]);

	const {
		auth,
		sync,
		credentialsAvailable,
		login,
		logout,
		syncToSeed,
		available,
	} = useGoogleDrive(handleFilesLoaded);

	useEffect(() => {
		const frameId = requestAnimationFrame(() => setViewerReady(true));
		return () => cancelAnimationFrame(frameId);
	}, []);

	// dev環境でのテスト用自動読込（Electron環境のみ）
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
			viewerReady &&
			!devAutoloadStartedRef.current &&
			dicomFiles.length === 0 &&
			loadState.status === "idle" &&
			api?.loadTestDicom
		) {
			devAutoloadStartedRef.current = true;
			api
				.loadTestDicom()
				.then((results) => {
					if (!results || results.length === 0) return;
					loadFiles(results);
				})
				.catch((err: unknown) => console.warn("[dev autoload]", err));
		}
	}, [dicomFiles.length, loadFiles, loadState.status, viewerReady]);

	const skippedCount =
		(loadState.status === "loaded" || loadState.status === "error") &&
		loadState.skipped
			? loadState.skipped.length
			: 0;

	const statusText = (() => {
		switch (loadState.status) {
			case "idle":
				return "ファイル待機";
			case "loading":
				return loadState.cancelRequested
					? "キャンセル中..."
					: `読込 ${Math.round(loadState.progress)}%`;
			case "loaded":
				return skippedCount > 0
					? `${dicomFiles.length} ファイル（${skippedCount}件スキップ）`
					: `${dicomFiles.length} ファイル`;
			case "error":
				return `エラー: ${loadState.message}`;
			case "cancelled":
				return "読込キャンセル";
		}
	})();

	const statusDotColor = (() => {
		switch (loadState.status) {
			case "idle":
				return "text-zinc-500";
			case "loading":
				return "text-sky-400 animate-pulse";
			case "loaded":
				return skippedCount > 0 ? "text-amber-400" : "text-sky-400";
			case "error":
				return "text-rose-400";
			case "cancelled":
				return "text-zinc-500";
		}
	})();

	const isSyncing = sync.status !== "idle";

	return (
		<div className="relative flex h-screen w-screen flex-col overflow-hidden">
			<header className="flex h-11 shrink-0 items-center gap-3 border-b border-white/[0.06] px-5 panel-surface">
				<h1 className="text-[13px] font-semibold tracking-wide text-zinc-200">
					Roentgen
				</h1>

				{/* Google Drive 連携 */}
				{available && (
					<div className="flex items-center gap-1.5">
						{credentialsAvailable === false ? (
							<span
								className="chip text-amber-400 border-amber-400/20"
								title="GCPコンソールからOAuth2クライアントIDをダウンロードし、Electronのユーザーデータディレクトリに gdrive-credentials.json として配置してください"
							>
								<CloudOff size={11} className="text-amber-400" />
								<span className="font-sans">Drive未設定</span>
							</span>
						) : auth.status === "authenticated" ? (
							<>
								<button
									type="button"
									onClick={syncToSeed}
									disabled={isSyncing}
									className="chip transition-colors hover:border-sky-400/30 hover:text-sky-300"
									title={`${auth.email} — クリックでDICOMをdicom-files/に保存`}
								>
									{isSyncing ? (
										<Loader2 size={11} className="animate-spin text-sky-400" />
									) : (
										<Cloud size={11} className="text-sky-400" />
									)}
									<span className="font-sans">
										{sync.status === "listing"
											? "検索中..."
											: sync.status === "downloading"
												? `DL ${sync.progress?.current ?? 0}/${sync.fileCount ?? 0}`
												: "Drive同期"}
									</span>
								</button>
								<button
									type="button"
									onClick={logout}
									className="rounded p-1 text-zinc-500 transition-colors hover:bg-white/[0.04] hover:text-zinc-300"
									title="Google Driveログアウト"
								>
									<LogOut size={12} />
								</button>
							</>
						) : auth.status === "checking" ? (
							<span className="chip">
								<Loader2 size={11} className="animate-spin text-zinc-400" />
								<span className="font-sans">確認中</span>
							</span>
						) : (
							<button
								type="button"
								onClick={login}
								className="chip transition-colors hover:border-white/10 hover:text-zinc-200"
								title="Google Driveに接続"
							>
								<CloudOff size={11} className="text-zinc-500" />
								<span className="font-sans">Drive接続</span>
							</button>
						)}
					</div>
				)}

				<CrashReporterToggle />

				<span className="ml-auto chip">
					<CircleDot size={11} className={statusDotColor} />
					<span className="font-sans">{statusText}</span>
				</span>
				{loadState.status === "loading" && !loadState.cancelRequested && (
					<button
						type="button"
						onClick={cancelLoad}
						className="chip text-rose-400 border-rose-400/20 hover:border-rose-400/40"
					>
						キャンセル
					</button>
				)}
				{dicomFiles.length > 0 && (
					<button type="button" onClick={handleClearFiles} className="chip">
						クリア
					</button>
				)}
			</header>

			<main className="flex min-h-0 flex-1">
				{dicomFiles.length === 0 ? (
					<FileDropZone onFilesLoaded={handleFilesLoaded} />
				) : (
					<ErrorBoundary>
						<DicomViewer
							files={dicomFiles}
							onClearAll={clearFiles}
							onRemoveFile={removeFile}
							setImageDataRegistrar={setImageDataRegistrar}
						/>
					</ErrorBoundary>
				)}
			</main>
		</div>
	);
};
