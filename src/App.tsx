import {
	AlertTriangle,
	CircleDot,
	Cloud,
	CloudOff,
	Loader2,
	LogOut,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { CrashReporterToggle } from "./components/crash-reporter-toggle";
import { ErrorBoundary } from "./components/error-boundary";
import { FileDropZone } from "./components/file-drop-zone";
import { DicomViewer } from "./components/viewer/dicom-viewer";
import { useDicomLoader } from "./hooks/use-dicom-loader";
import { useGoogleDrive } from "./hooks/use-google-drive";
import type { DicomFileError } from "./types/dicom";

const getDisplayFileName = (filePath: string) => {
	const parts = filePath.split(/[\\/]/).filter(Boolean);
	return parts[parts.length - 1] ?? filePath;
};

const LoadFeedbackBanner = ({
	message,
	skipped,
	variant,
}: {
	message: string;
	skipped: DicomFileError[];
	variant: "error" | "warning";
}) => {
	const shownSkipped = skipped.slice(0, 3);
	const hiddenCount = skipped.length - shownSkipped.length;
	const colorClass =
		variant === "error"
			? "border-rose-500/25 bg-rose-950/30 text-rose-100"
			: "border-amber-400/25 bg-amber-950/25 text-amber-100";

	return (
		<section
			className={`shrink-0 border-b px-5 py-2 ${colorClass}`}
			aria-live="polite"
		>
			<div className="flex items-start gap-2 text-xs">
				<AlertTriangle
					size={15}
					className={
						variant === "error"
							? "mt-0.5 text-rose-300"
							: "mt-0.5 text-amber-300"
					}
				/>
				<div className="min-w-0">
					<p className="font-semibold">{message}</p>
					{shownSkipped.length > 0 && (
						<ul className="mt-1 space-y-0.5 text-[11px] text-zinc-300">
							{shownSkipped.map((item) => (
								<li key={`${item.filePath}:${item.reason}`}>
									<span className="font-medium text-zinc-100">
										{getDisplayFileName(item.filePath)}
									</span>
									<span className="text-zinc-500"> — </span>
									{item.detail}
								</li>
							))}
							{hiddenCount > 0 && (
								<li className="text-zinc-400">ほか {hiddenCount} 件</li>
							)}
						</ul>
					)}
				</div>
			</div>
		</section>
	);
};

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
	const [driveSetupOpen, setDriveSetupOpen] = useState(false);
	const devAutoloadStartedRef = useRef(false);

	const handleFilesLoaded = useCallback(
		(files: { path: string; data: ArrayBuffer }[]) => {
			loadFiles(files);
		},
		[loadFiles],
	);

	const loadExternalDicomPaths = useCallback(
		async (filePaths: string[]) => {
			const api = window.electronAPI;
			if (!api?.readFile) return;

			const loaded: { path: string; data: ArrayBuffer }[] = [];
			for (const filePath of filePaths) {
				try {
					const data = await api.readFile(filePath);
					loaded.push({ path: filePath, data });
				} catch (err) {
					console.warn("[open-file]", err);
				}
			}
			if (loaded.length > 0) {
				loadFiles(loaded);
			}
		},
		[loadFiles],
	);

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

	useEffect(() => {
		const unsubscribe = window.electronAPI?.onOpenDicomFiles?.((filePaths) => {
			void loadExternalDicomPaths(filePaths);
		});
		return () => unsubscribe?.();
	}, [loadExternalDicomPaths]);

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

	const statusChipClassName = (() => {
		switch (loadState.status) {
			case "idle":
			case "cancelled":
				return "chip max-w-[min(18rem,45vw)]";
			case "loading":
				return "chip max-w-[min(18rem,45vw)] border-sky-400/20 bg-sky-400/[0.06] text-sky-200";
			case "loaded":
				return skippedCount > 0
					? "chip max-w-[min(18rem,45vw)] border-amber-400/25 bg-amber-400/[0.06] text-amber-200"
					: "chip max-w-[min(18rem,45vw)] border-sky-400/20 bg-sky-400/[0.04] text-sky-200";
			case "error":
				return "chip max-w-[min(18rem,45vw)] border-rose-400/25 bg-rose-400/[0.08] font-medium text-rose-200";
		}
	})();

	const isSyncing = sync.status !== "idle";
	const handleClearFiles = useCallback(() => {
		if (!window.confirm("全 DICOM をクリアします。よろしいですか？")) return;
		clearFiles();
	}, [clearFiles]);

	const loadFeedback =
		loadState.status === "error"
			? {
					message: loadState.message,
					skipped: loadState.skipped ?? [],
					variant: "error" as const,
				}
			: loadState.status === "loaded" && skippedCount > 0
				? {
						message: `${skippedCount}件のファイルをスキップしました`,
						skipped: loadState.skipped,
						variant: "warning" as const,
					}
				: null;

	return (
		<div className="relative flex h-screen w-screen flex-col overflow-hidden">
			<header className="flex h-11 shrink-0 items-center gap-3 border-b border-white/[0.06] px-5 panel-surface">
				<h1 className="text-[13px] font-semibold tracking-wide text-zinc-200">
					Roentgen
				</h1>

				{/* Google Drive 連携 */}
				{available && (
					<div className="relative flex items-center gap-1.5">
						{credentialsAvailable === false ? (
							<button
								type="button"
								className="chip text-amber-400 border-amber-400/20 transition-colors hover:border-amber-400/40 hover:text-amber-300"
								aria-expanded={driveSetupOpen}
								aria-controls="drive-setup-panel"
								onClick={() => setDriveSetupOpen((open) => !open)}
							>
								<CloudOff size={11} className="text-amber-400" />
								<span className="font-sans">Drive未設定</span>
							</button>
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
						{credentialsAvailable === false && driveSetupOpen && (
							<div
								id="drive-setup-panel"
								className="absolute left-0 top-8 z-50 w-[360px] rounded-md border border-amber-400/20 bg-zinc-950 p-3 text-xs text-zinc-300 shadow-xl"
								role="status"
							>
								<p className="font-semibold text-amber-300">
									Google Drive連携の準備が未完了です
								</p>
								<ol className="mt-2 list-decimal space-y-1 pl-4 text-zinc-400">
									<li>GCPコンソールでOAuth2クライアントIDを作成</li>
									<li>JSONをダウンロードしてファイル名を変更</li>
									<li>
										Electronのユーザーデータディレクトリへ配置:
										<code className="ml-1 rounded bg-white/5 px-1 py-0.5 text-amber-200">
											gdrive-credentials.json
										</code>
									</li>
								</ol>
								<p className="mt-2 text-[11px] text-zinc-500">
									配置後にアプリを再起動するとDrive接続ボタンが有効になります。
								</p>
							</div>
						)}
					</div>
				)}

				<CrashReporterToggle />

				{driveError && (
					<span
						className="chip max-w-[min(16rem,32vw)] border-rose-400/25 bg-rose-400/[0.08] font-medium text-rose-200"
						role="alert"
						title={`Google Drive: ${driveError}`}
					>
						<CloudOff size={11} className="shrink-0 text-rose-300" />
						<span className="min-w-0 truncate font-sans">
							Driveエラー: {driveError}
						</span>
					</span>
				)}

				<span className={`ml-auto ${statusChipClassName}`} title={statusText}>
					<CircleDot size={11} className={statusDotColor} />
					<span className="min-w-0 truncate font-sans">{statusText}</span>
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
					<button
						type="button"
						onClick={handleClearFiles}
						className="chip"
						aria-label="全 DICOM をクリア"
					>
						全クリア
					</button>
				)}
			</header>

			{loadFeedback && (
				<LoadFeedbackBanner
					message={loadFeedback.message}
					skipped={loadFeedback.skipped}
					variant={loadFeedback.variant}
				/>
			)}

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
