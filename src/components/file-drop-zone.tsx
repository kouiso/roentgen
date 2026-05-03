import { UploadCloud } from "lucide-react";
import { type DragEvent, useCallback, useState } from "react";

type FileDropZoneProps = {
	onFilesLoaded: (files: { path: string; data: ArrayBuffer }[]) => void;
};

// ファイル読込エラーのユーザー向けメッセージ生成
const toReadErrorMessage = (filePath: string, err: unknown): string => {
	const msg = err instanceof Error ? err.message : String(err);
	const fileName = filePath.split("/").pop() ?? filePath;

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

export const FileDropZone = ({ onFilesLoaded }: FileDropZoneProps) => {
	const [isDragging, setIsDragging] = useState(false);
	const [isLoading, setIsLoading] = useState(false);
	const [readErrors, setReadErrors] = useState<string[]>([]);

	const loadFiles = useCallback(
		async (filePaths: string[]) => {
			setIsLoading(true);
			setReadErrors([]);
			try {
				const loaded: { path: string; data: ArrayBuffer }[] = [];
				const errors: string[] = [];
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

	const handleDrop = useCallback(
		(e: DragEvent<HTMLDivElement>) => {
			e.preventDefault();
			setIsDragging(false);

			const files = Array.from(e.dataTransfer.files);
			const paths = files.map((f) => f.path).filter(Boolean);
			if (paths.length > 0) {
				loadFiles(paths);
			}
		},
		[loadFiles],
	);

	const handleDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
		e.preventDefault();
		setIsDragging(true);
	}, []);

	const handleDragLeave = useCallback((e: DragEvent<HTMLDivElement>) => {
		e.preventDefault();
		setIsDragging(false);
	}, []);

	const handleClick = useCallback(async () => {
		const api = window.electronAPI;
		if (!api) return;
		const paths = await api.selectDicomFiles();
		if (paths.length > 0) {
			loadFiles(paths);
		}
	}, [loadFiles]);

	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: ドロップ対象は視覚的な余白を持つコンテナで、フォーカス可能なボタンは内側のカード
		<div
			className="flex flex-1 items-center justify-center p-10"
			onDrop={handleDrop}
			onDragOver={handleDragOver}
			onDragLeave={handleDragLeave}
		>
			{/* biome-ignore lint/a11y/useSemanticElements: ドロップゾーンはdivが必要（buttonではDnDが動作しない） */}
			<div
				role="button"
				tabIndex={0}
				onClick={handleClick}
				onKeyDown={(e) => {
					if (e.key === "Enter" || e.key === " ") handleClick();
				}}
				className={`group relative flex w-full max-w-md cursor-pointer flex-col items-center gap-5 rounded-2xl panel-surface px-10 py-14 text-center transition-all duration-200 ${
					isDragging
						? "ring-2 ring-sky-400/70 ring-offset-0"
						: "hover:-translate-y-[1px]"
				}`}
			>
				<div
					className={`flex h-14 w-14 items-center justify-center rounded-full border border-white/[0.08] bg-white/[0.03] transition-colors ${
						isDragging
							? "text-sky-300"
							: "text-zinc-400 group-hover:text-zinc-200"
					}`}
				>
					<UploadCloud size={26} strokeWidth={1.5} />
				</div>
				{isLoading ? (
					<p className="font-sans text-[13px] text-zinc-400">読込中...</p>
				) : (
					<div className="flex flex-col gap-1.5">
						<p className="font-sans text-[15px] font-medium text-zinc-100">
							DICOMファイルをドロップ
						</p>
						<p className="font-sans text-[12px] text-zinc-400">
							またはクリックして選択
						</p>
					</div>
				)}
			</div>

			{readErrors.length > 0 && (
				<div className="absolute bottom-6 left-1/2 w-full max-w-md -translate-x-1/2 rounded-lg border border-rose-500/20 bg-rose-950/80 px-4 py-3 backdrop-blur">
					<p className="mb-1 font-sans text-[12px] font-medium text-rose-300">
						ファイル読込エラー
					</p>
					<ul className="space-y-0.5">
						{readErrors.map((err) => (
							<li key={err} className="font-sans text-[11px] text-rose-200/80">
								{err}
							</li>
						))}
					</ul>
				</div>
			)}
		</div>
	);
};
