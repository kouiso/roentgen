import { UploadCloud } from "lucide-react";
import { type DragEvent, useCallback, useState } from "react";

type FileDropZoneProps = {
	onFilesLoaded: (files: { path: string; data: ArrayBuffer }[]) => void;
};

export const FileDropZone = ({ onFilesLoaded }: FileDropZoneProps) => {
	const [isDragging, setIsDragging] = useState(false);
	const [isLoading, setIsLoading] = useState(false);

	const loadFiles = useCallback(
		async (filePaths: string[]) => {
			setIsLoading(true);
			try {
				const loaded: { path: string; data: ArrayBuffer }[] = [];
				for (const filePath of filePaths) {
					try {
						const data = await window.electronAPI.readFile(filePath);
						loaded.push({ path: filePath, data });
					} catch (err) {
						console.error(`[FileDropZone] ファイル読込失敗: ${filePath}`, err);
					}
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
		const paths = await window.electronAPI.selectDicomFiles();
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
		</div>
	);
};
