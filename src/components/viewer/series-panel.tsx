// シリーズ対応サムネイルパネル — Study/Series グルーピング表示
// ThumbnailPanelの拡張版: seriesInstanceUIごとにグループ化して表示

import { useEffect, useRef } from "react";
import type { DicomFileInfo } from "@/types/dicom";

const THUMB_W = 100;
const THUMB_H = 80;

type SeriesPanelProps = {
	files: DicomFileInfo[];
	currentIndex: number;
	onSelect: (index: number) => void;
};

const ThumbnailImage = ({
	file,
	globalIndex,
	isActive,
	onClick,
}: {
	file: DicomFileInfo;
	globalIndex: number;
	isActive: boolean;
	onClick: () => void;
}) => {
	const canvasRef = useRef<HTMLCanvasElement>(null);

	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;
		const ctx = canvas.getContext("2d");
		if (!ctx) return;

		if (file.thumbnailData) {
			const imageData = new ImageData(
				new Uint8ClampedArray(file.thumbnailData),
				THUMB_W,
				THUMB_H,
			);
			ctx.putImageData(imageData, 0, 0);
		} else {
			ctx.fillStyle = "#262626";
			ctx.fillRect(0, 0, THUMB_W, THUMB_H);
			ctx.fillStyle = "#737373";
			ctx.font = "12px sans-serif";
			ctx.textAlign = "center";
			ctx.textBaseline = "middle";
			ctx.fillText(
				String(file.instanceNumber ?? globalIndex + 1),
				THUMB_W / 2,
				THUMB_H / 2,
			);
		}
	}, [file, globalIndex]);

	return (
		<button
			type="button"
			aria-label={`フレーム ${file.instanceNumber ?? globalIndex + 1} を表示`}
			aria-current={isActive ? "true" : undefined}
			onClick={onClick}
			className={`group relative shrink-0 overflow-hidden rounded-md border-2 transition-all duration-150 ease-out ${
				isActive
					? "border-accent shadow-md shadow-accent/20"
					: "border-transparent hover:border-line"
			}`}
		>
			<canvas
				ref={canvasRef}
				width={THUMB_W}
				height={THUMB_H}
				className="block bg-cell"
			/>
			<span
				className={`absolute right-0.5 bottom-0.5 rounded px-1 font-mono text-[10px] leading-tight ${
					isActive ? "bg-accent text-bg" : "bg-bg/80 text-ink-2"
				}`}
			>
				{file.instanceNumber ?? globalIndex + 1}
			</span>
		</button>
	);
};

// ファイルを seriesInstanceUID でグループ化
const groupBySeries = (
	files: DicomFileInfo[],
): {
	seriesUID: string;
	label: string;
	items: { file: DicomFileInfo; globalIndex: number }[];
}[] => {
	const map = new Map<
		string,
		{ label: string; items: { file: DicomFileInfo; globalIndex: number }[] }
	>();

	for (let i = 0; i < files.length; i++) {
		const file = files[i];
		if (!file) continue;
		const uid = file.seriesInstanceUID ?? "__unknown__";
		if (!map.has(uid)) {
			const modality = file.tags.Modality ?? "";
			const seriesDesc = file.tags.SeriesDescription ?? "";
			const seriesNum = file.tags.SeriesNumber;
			const label =
				[modality, seriesNum ? `S${seriesNum}` : "", seriesDesc]
					.filter(Boolean)
					.join(" · ") || "シリーズ";
			map.set(uid, { label, items: [] });
		}
		(
			map.get(uid) as {
				label: string;
				items: { file: DicomFileInfo; globalIndex: number }[];
			}
		).items.push({
			file,
			globalIndex: i,
		});
	}

	return [...map.entries()].map(([seriesUID, v]) => ({
		seriesUID,
		label: v.label,
		items: v.items,
	}));
};

export const SeriesPanel = ({
	files,
	currentIndex,
	onSelect,
}: SeriesPanelProps) => {
	if (!files || files.length <= 1) return null;

	const groups = groupBySeries(files);
	const multiSeries = groups.length > 1;

	return (
		<div className="flex w-[148px] shrink-0 flex-col overflow-y-auto panel-surface">
			<div className="flex shrink-0 items-center justify-between border-b border-line-2 px-2 py-1.5">
				<span className="text-[10px] font-medium uppercase tracking-[0.1em] text-ink-3">
					シリーズ
				</span>
				<span className="rounded bg-accent/10 px-1.5 py-0.5 font-mono text-[9px] text-accent">
					{files.length}
				</span>
			</div>
			<div className="flex flex-col gap-1.5 overflow-y-auto p-1.5">
				{groups.map((group) => (
					<div key={group.seriesUID} className="flex flex-col gap-1">
						{/* シリーズヘッダー（複数シリーズ時のみ表示） */}
						{multiSeries && (
							<div
								className="truncate rounded border border-line-2 bg-line-2/50 px-1.5 py-0.5 font-sans text-[9px] font-medium uppercase tracking-[0.08em] text-ink-3"
								title={group.label}
							>
								{group.label}
							</div>
						)}
						{group.items.map(({ file, globalIndex }) => (
							<ThumbnailImage
								key={file.imageId}
								file={file}
								globalIndex={globalIndex}
								isActive={globalIndex === currentIndex}
								onClick={() => onSelect(globalIndex)}
							/>
						))}
					</div>
				))}
			</div>
		</div>
	);
};
