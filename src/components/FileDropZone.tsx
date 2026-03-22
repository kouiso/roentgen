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
			const loaded: { path: string; data: ArrayBuffer }[] = [];
			for (const filePath of filePaths) {
				const data = await window.electronAPI.readFile(filePath);
				loaded.push({ path: filePath, data });
			}
			onFilesLoaded(loaded);
			setIsLoading(false);
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
		<div
			className={`flex flex-1 cursor-pointer items-center justify-center transition-colors ${
				isDragging
					? "border-2 border-dashed border-blue-500 bg-blue-500/10"
					: "border-2 border-dashed border-neutral-700 hover:border-neutral-500"
			}`}
			onDrop={handleDrop}
			onDragOver={handleDragOver}
			onDragLeave={handleDragLeave}
			onClick={handleClick}
			onKeyDown={(e) => {
				if (e.key === "Enter" || e.key === " ") handleClick();
			}}
		>
			{isLoading ? (
				<p className="text-neutral-400">読込中...</p>
			) : (
				<div className="text-center">
					<p className="text-lg text-neutral-400">
						DICOMファイルをここにドロップ
					</p>
					<p className="mt-2 text-sm text-neutral-600">
						またはクリックしてファイルを選択
					</p>
				</div>
			)}
		</div>
	);
};
