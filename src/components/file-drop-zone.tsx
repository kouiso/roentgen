import {
	Bone,
	Cloud,
	FileUp,
	FolderOpen,
	Ruler,
	UploadCloud,
} from "lucide-react";
import {
	type DragEvent,
	type KeyboardEvent,
	useCallback,
	useState,
} from "react";

type FileDropZoneProps = {
	onFilesLoaded: (files: { path: string; data: ArrayBuffer }[]) => void;
};

const toReadErrorMessage = (filePath: string, err: unknown): string => {
	const msg = err instanceof Error ? err.message : String(err);
	const fileName = filePath.split(/[/\\]/).pop() ?? filePath;

	if (msg.includes("EACCES") || msg.includes("許可されていない")) {
		return `${fileName}: アクセス権限がありません`;
	}
	if (msg.includes("ENOSPC")) {
		return `${fileName}: ディスク容量が不足しています`;
	}
	if (msg.includes("ENOENT")) {
		return `${fileName}: ファイルが見つかりません`;
	}
	return `${fileName}: 読込失敗 — ${msg}`;
};

const toDirectoryReadErrorMessage = (
	directoryPath: string,
	err: unknown,
): string => {
	const msg = err instanceof Error ? err.message : String(err);
	const directoryName = directoryPath.split(/[/\\]/).pop() ?? directoryPath;
	return `${directoryName}: フォルダ読込失敗 — ${msg}`;
};

export const FileDropZone = ({ onFilesLoaded }: FileDropZoneProps) => {
	const [isDragging, setIsDragging] = useState(false);
	const [isLoading, setIsLoading] = useState(false);
	const [readErrors, setReadErrors] = useState<string[]>([]);

	const loadFiles = useCallback(
		async (filePaths: string[], initialErrors: string[] = []) => {
			setIsLoading(true);
			setReadErrors([]);
			try {
				const loaded: { path: string; data: ArrayBuffer }[] = [];
				const errors: string[] = [...initialErrors];
				for (const filePath of filePaths) {
					try {
						const api = window.electronAPI;
						if (!api) throw new Error("Electron API not available");
						const data = await api.readFile(filePath);
						loaded.push({ path: filePath, data });
					} catch (err) {
						errors.push(toReadErrorMessage(filePath, err));
					}
				}
				if (errors.length > 0) {
					setReadErrors(errors);
				}
				if (loaded.length > 0) {
					onFilesLoaded(loaded);
				}
			} finally {
				setIsLoading(false);
			}
		},
		[onFilesLoaded],
	);

	const expandDroppedPaths = useCallback(async (paths: string[]) => {
		const api = window.electronAPI;
		if (!api?.readDirectoryRecursive) {
			return { paths, errors: [] };
		}

		const expandedPaths: string[] = [];
		const errors: string[] = [];
		for (const path of paths) {
			try {
				expandedPaths.push(...(await api.readDirectoryRecursive(path)));
			} catch (err) {
				errors.push(toDirectoryReadErrorMessage(path, err));
			}
		}

		return { paths: Array.from(new Set(expandedPaths)), errors };
	}, []);

	const loadDroppedPaths = useCallback(
		async (paths: string[]) => {
			setIsLoading(true);
			setReadErrors([]);
			try {
				const { paths: expandedPaths, errors } =
					await expandDroppedPaths(paths);
				if (expandedPaths.length > 0) {
					await loadFiles(expandedPaths, errors);
					return;
				}
				setReadErrors(
					errors.length > 0 ? errors : ["読み込める画像が見つかりません"],
				);
			} finally {
				setIsLoading(false);
			}
		},
		[expandDroppedPaths, loadFiles],
	);

	const handleDrop = useCallback(
		(e: DragEvent<HTMLDivElement>) => {
			e.preventDefault();
			setIsDragging(false);

			const files = Array.from(e.dataTransfer.files);
			const paths = files.map((f) => f.path).filter(Boolean);
			if (paths.length > 0) {
				void loadDroppedPaths(paths);
			}
		},
		[loadDroppedPaths],
	);

	const handleDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
		e.preventDefault();
		setIsDragging(true);
	}, []);

	const handleDragLeave = useCallback((e: DragEvent<HTMLDivElement>) => {
		e.preventDefault();
		setIsDragging(false);
	}, []);

	const handleFileClick = useCallback(async () => {
		if (isLoading) return;
		const api = window.electronAPI;
		if (!api) return;
		const paths = await api.selectDicomFiles();
		if (paths.length > 0) {
			loadFiles(paths);
		}
	}, [isLoading, loadFiles]);

	const handleDirectoryClick = useCallback(async () => {
		if (isLoading) return;
		const api = window.electronAPI;
		if (!api) return;
		try {
			const paths = await api.selectDicomDirectory();
			if (paths.length > 0) {
				loadFiles(paths);
			}
		} catch (err) {
			setReadErrors([toDirectoryReadErrorMessage("フォルダ", err)]);
		}
	}, [isLoading, loadFiles]);

	const handleDropZoneKeyDown = useCallback(
		(e: KeyboardEvent<HTMLDivElement>) => {
			if (e.key !== "Enter" && e.key !== " ") return;
			e.preventDefault();
			void handleFileClick();
		},
		[handleFileClick],
	);

	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: ドロップ対象は視覚的な余白を持つコンテナで、フォーカス可能なボタンは内側のカード
		<div
			className="flex flex-1 items-center justify-center p-10"
			onDrop={handleDrop}
			onDragOver={handleDragOver}
			onDragLeave={handleDragLeave}
		>
			<div className="flex w-full max-w-lg flex-col items-center gap-4">
				{/* biome-ignore lint/a11y/useSemanticElements: ドロップゾーンはdivが必要（buttonではDnDが動作しない） */}
				<div
					role="button"
					aria-label="レントゲン画像を選択"
					aria-disabled={isLoading}
					tabIndex={0}
					onClick={handleFileClick}
					onKeyDown={handleDropZoneKeyDown}
					className={`group relative flex w-full cursor-pointer flex-col items-center gap-5 rounded-2xl border-2 border-dashed px-10 py-14 text-center transition-all duration-200 ${
						isDragging
							? "border-accent/60 bg-accent/[0.04]"
							: "border-white/[0.1] hover:border-accent/30 hover:bg-white/[0.02]"
					}`}
				>
					<div
						className={`flex h-14 w-14 items-center justify-center rounded-full border transition-colors ${
							isDragging
								? "border-accent/30 bg-accent/[0.08] text-accent"
								: "border-white/[0.08] bg-white/[0.03] text-ink-3 group-hover:text-ink-2"
						}`}
					>
						<UploadCloud size={26} strokeWidth={1.5} />
					</div>
					{isLoading ? (
						<p className="text-[13px] text-ink-3">読込中...</p>
					) : (
						<div className="flex flex-col gap-1.5">
							<p className="text-[15px] font-medium text-ink">
								レントゲン画像をドロップ
							</p>
							<p className="text-[12px] text-ink-2">
								クリックしてファイルを選択
							</p>
							<p className="text-[11px] text-ink-3">
								病院でもらったレントゲンファイル（.dcm）に対応
							</p>
						</div>
					)}
				</div>

				{/* Feature cards */}
				<div className="grid w-full grid-cols-3 gap-2">
					<div className="flex flex-col items-center gap-2 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-4 text-center">
						<Bone size={18} className="text-ink-3" />
						<div>
							<p className="text-[11px] font-medium text-ink-2">骨格解析</p>
							<p className="mt-0.5 text-[10px] text-ink-3">
								馬用WW/WCプリセット
							</p>
						</div>
					</div>
					<div className="flex flex-col items-center gap-2 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-4 text-center">
						<Ruler size={18} className="text-ink-3" />
						<div>
							<p className="text-[11px] font-medium text-ink-2">精密計測</p>
							<p className="mt-0.5 text-[10px] text-ink-3">距離・角度の計測</p>
						</div>
					</div>
					<div className="flex flex-col items-center gap-2 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-4 text-center">
						<Cloud size={18} className="text-ink-3" />
						<div>
							<p className="text-[11px] font-medium text-ink-2">Drive同期</p>
							<p className="mt-0.5 text-[10px] text-ink-3">
								Google Driveから読込
							</p>
						</div>
					</div>
				</div>

				{/* File / folder buttons */}
				<div className="grid w-full grid-cols-2 gap-2">
					<button
						type="button"
						onClick={handleFileClick}
						disabled={isLoading}
						className="chip justify-center py-2 disabled:cursor-not-allowed disabled:opacity-50"
					>
						<FileUp size={13} />
						<span className="font-sans">ファイルを開く</span>
					</button>
					<button
						type="button"
						onClick={handleDirectoryClick}
						disabled={isLoading}
						className="chip justify-center py-2 disabled:cursor-not-allowed disabled:opacity-50"
					>
						<FolderOpen size={13} />
						<span className="font-sans">フォルダを開く</span>
					</button>
				</div>
			</div>

			{readErrors.length > 0 && (
				<div
					className="absolute bottom-6 left-1/2 w-full max-w-md -translate-x-1/2 rounded-lg border border-rose-500/20 bg-rose-950/80 px-4 py-3 backdrop-blur"
					role="alert"
					aria-live="assertive"
				>
					<p className="mb-1 text-[12px] font-medium text-rose-300">
						ファイル読込エラー
					</p>
					<ul className="space-y-0.5">
						{readErrors.map((err) => (
							<li key={err} className="text-[11px] text-rose-200/80">
								{err}
							</li>
						))}
					</ul>
				</div>
			)}
		</div>
	);
};
