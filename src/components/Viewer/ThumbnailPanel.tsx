// サムネイルパネル（renkeibox ViewerThumbnailPanel/View/Image 参考）
import type { DicomFileInfo } from "@/types/dicom";

type ThumbnailPanelProps = {
	files: DicomFileInfo[];
	currentIndex: number;
	onSelect: (index: number) => void;
};

export const ThumbnailPanel = ({
	files,
	currentIndex,
	onSelect,
}: ThumbnailPanelProps) => {
	if (files.length <= 1) return null;

	return (
		<div className="flex w-24 shrink-0 flex-col gap-1 overflow-y-auto border-l border-neutral-800 bg-neutral-900 p-1">
			{files.map((file, index) => (
				<button
					type="button"
					key={file.imageId}
					onClick={() => onSelect(index)}
					className={`flex h-16 items-center justify-center rounded border text-xs transition-colors ${
						index === currentIndex
							? "border-blue-500 bg-blue-500/20 text-blue-400"
							: "border-neutral-700 bg-neutral-800 text-neutral-500 hover:border-neutral-600"
					}`}
				>
					<span>{file.instanceNumber ?? index + 1}</span>
				</button>
			))}
		</div>
	);
};
