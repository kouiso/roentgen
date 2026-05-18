// サムネイルパネル — プリレンダリング済みRGBAデータから描画
// rawDataからの二重パースを排除（dicom-parser.tsで事前生成済み）

import { useEffect, useRef } from "react";
import type { DicomFileInfo } from "@/types/dicom";

const THUMB_W = 100;
const THUMB_H = 80;

type ThumbnailPanelProps = {
	files: DicomFileInfo[];
	currentIndex: number;
	onSelect: (index: number) => void;
};

const ThumbnailImage = ({
	file,
	isActive,
	onClick,
}: {
	file: DicomFileInfo;
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
			// プリレンダリング済みRGBAデータを描画
			const imageData = new ImageData(
				new Uint8ClampedArray(file.thumbnailData),
				THUMB_W,
				THUMB_H,
			);
			ctx.putImageData(imageData, 0, 0);
		} else {
			// サムネイル生成失敗時はフォールバック表示
			ctx.fillStyle = "#262626";
			ctx.fillRect(0, 0, THUMB_W, THUMB_H);
			ctx.fillStyle = "#737373";
			ctx.font = "12px sans-serif";
			ctx.textAlign = "center";
			ctx.textBaseline = "middle";
			ctx.fillText(
				String(file.instanceNumber ?? "?"),
				THUMB_W / 2,
				THUMB_H / 2,
			);
		}
	}, [file]);

	return (
		<button
			type="button"
			aria-label={`フレーム ${file.instanceNumber ?? "?"} を表示`}
			aria-current={isActive ? "true" : undefined}
			onClick={onClick}
			className={`group relative shrink-0 overflow-hidden rounded-md border-2 transition-all duration-150 ease-out ${
				isActive
					? "border-sky-400 shadow-md shadow-sky-400/20"
					: "border-transparent hover:border-white/20"
			}`}
		>
			<canvas
				ref={canvasRef}
				width={THUMB_W}
				height={THUMB_H}
				className="block bg-neutral-800"
			/>
			{/* フレーム番号バッジ */}
			<span
				className={`absolute right-0.5 bottom-0.5 rounded px-1 font-mono text-[10px] leading-tight ${
					isActive
						? "bg-sky-400 text-zinc-950"
						: "bg-black/70 text-zinc-300 backdrop-blur-sm"
				}`}
			>
				{file.instanceNumber ?? "?"}
			</span>
		</button>
	);
};

export const ThumbnailPanel = ({
	files,
	currentIndex,
	onSelect,
}: ThumbnailPanelProps) => {
	if (files.length <= 1) return null;

	return (
		<div className="flex w-28 shrink-0 flex-col gap-1.5 overflow-y-auto p-1.5 panel-surface">
			{files.map((file, index) => (
				<ThumbnailImage
					key={file.imageId}
					file={file}
					isActive={index === currentIndex}
					onClick={() => onSelect(index)}
				/>
			))}
		</div>
	);
};
