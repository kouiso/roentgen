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
	index,
	totalCount,
	isActive,
	onClick,
	onNavigate,
}: {
	file: DicomFileInfo;
	index: number;
	totalCount: number;
	isActive: boolean;
	onClick: () => void;
	onNavigate: (index: number) => void;
}) => {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const frameNumber = file.instanceNumber ?? index + 1;
	const frameLabel = `フレーム ${frameNumber} (${index + 1}/${totalCount})`;

	const handleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
		let nextIndex: number | null = null;

		switch (event.key) {
			case "ArrowDown":
			case "ArrowRight":
				nextIndex = Math.min(index + 1, totalCount - 1);
				break;
			case "ArrowUp":
			case "ArrowLeft":
				nextIndex = Math.max(index - 1, 0);
				break;
			case "Home":
				nextIndex = 0;
				break;
			case "End":
				nextIndex = totalCount - 1;
				break;
			default:
				return;
		}

		event.preventDefault();
		if (nextIndex === index) return;

		const options =
			event.currentTarget.parentElement?.querySelectorAll<HTMLElement>(
				'[role="option"]',
			);
		options?.[nextIndex]?.focus();
		onNavigate(nextIndex);
	};

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
			ctx.fillText(String(frameNumber), THUMB_W / 2, THUMB_H / 2);
		}
	}, [file, frameNumber]);

	return (
		<button
			type="button"
			role="option"
			aria-label={frameLabel}
			aria-current={isActive ? "true" : undefined}
			aria-selected={isActive}
			tabIndex={isActive ? 0 : -1}
			onClick={onClick}
			onKeyDown={handleKeyDown}
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
				{frameNumber}
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
		<div
			role="listbox"
			aria-label="フレーム一覧"
			aria-orientation="vertical"
			className="flex w-28 shrink-0 flex-col gap-1.5 overflow-y-auto p-1.5 panel-surface"
		>
			{files.map((file, index) => (
				<ThumbnailImage
					key={file.imageId}
					file={file}
					index={index}
					totalCount={files.length}
					isActive={index === currentIndex}
					onClick={() => onSelect(index)}
					onNavigate={onSelect}
				/>
			))}
		</div>
	);
};
