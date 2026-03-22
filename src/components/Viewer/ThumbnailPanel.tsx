// サムネイルパネル — DICOM画像プレビュー付き（renkeibox ViewerThumbnailPanel/View/Image 参考）
import type { DicomFileInfo } from "@/types/dicom";
import { useEffect, useRef } from "react";

type ThumbnailPanelProps = {
	files: DicomFileInfo[];
	currentIndex: number;
	onSelect: (index: number) => void;
};

// cornerstoneを使ってDICOM画像をサムネイルCanvasに描画
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

		// rawDataからピクセルデータを抽出してサムネイル描画
		const renderThumbnail = async () => {
			const arrayBuffer = file.rawData;
			const dicomParserMod = await import("dicom-parser");
			const dp = dicomParserMod.default ?? dicomParserMod;
			const byteArray = new Uint8Array(arrayBuffer);
			const dataSet = dp.parseDicom(byteArray);

			const rows = dataSet.uint16("x00280010") ?? 0;
			const columns = dataSet.uint16("x00280011") ?? 0;
			const bitsAllocated = dataSet.uint16("x00280100") ?? 16;
			const pixelRepresentation = dataSet.uint16("x00280103") ?? 0;

			const pixelDataElement = dataSet.elements.x7fe00010;
			if (!pixelDataElement || rows === 0 || columns === 0) return;

			// ピクセルデータ取得
			let pixelData: Int16Array | Uint16Array | Uint8Array;
			if (bitsAllocated === 16) {
				if (pixelRepresentation === 1) {
					pixelData = new Int16Array(arrayBuffer, pixelDataElement.dataOffset, pixelDataElement.length / 2);
				} else {
					pixelData = new Uint16Array(arrayBuffer, pixelDataElement.dataOffset, pixelDataElement.length / 2);
				}
			} else {
				pixelData = new Uint8Array(arrayBuffer, pixelDataElement.dataOffset, pixelDataElement.length);
			}

			// WW/WCでピクセル値をRGBに変換
			const wc = file.windowCenter || 0;
			const ww = file.windowWidth || 1;
			const lower = wc - ww / 2;
			const upper = wc + ww / 2;

			// サムネイルサイズにダウンサンプリング
			const thumbW = canvas.width;
			const thumbH = canvas.height;
			const imageData = ctx.createImageData(thumbW, thumbH);

			const scaleX = columns / thumbW;
			const scaleY = rows / thumbH;

			for (let ty = 0; ty < thumbH; ty++) {
				for (let tx = 0; tx < thumbW; tx++) {
					const sx = Math.floor(tx * scaleX);
					const sy = Math.floor(ty * scaleY);
					const srcIdx = sy * columns + sx;
					const rawVal = pixelData[srcIdx] ?? 0;

					// WW/WCリニアマッピング
					let gray: number;
					if (rawVal <= lower) {
						gray = 0;
					} else if (rawVal >= upper) {
						gray = 255;
					} else {
						gray = ((rawVal - lower) / (upper - lower)) * 255;
					}

					const dstIdx = (ty * thumbW + tx) * 4;
					imageData.data[dstIdx] = gray;
					imageData.data[dstIdx + 1] = gray;
					imageData.data[dstIdx + 2] = gray;
					imageData.data[dstIdx + 3] = 255;
				}
			}

			ctx.putImageData(imageData, 0, 0);
		};

		renderThumbnail().catch(() => {
			// パース失敗時は番号表示にフォールバック
			const fallbackCtx = canvasRef.current?.getContext("2d");
			if (!fallbackCtx) return;
			fallbackCtx.fillStyle = "#262626";
			fallbackCtx.fillRect(0, 0, 100, 80);
			fallbackCtx.fillStyle = "#737373";
			fallbackCtx.font = "12px sans-serif";
			fallbackCtx.textAlign = "center";
			fallbackCtx.textBaseline = "middle";
			fallbackCtx.fillText(String(file.instanceNumber ?? "?"), 50, 40);
		});
	}, [file]);

	return (
		<button
			type="button"
			onClick={onClick}
			className={`group relative shrink-0 overflow-hidden rounded-md border-2 transition-all ${
				isActive
					? "border-blue-500 shadow-md shadow-blue-500/20"
					: "border-transparent hover:border-neutral-600"
			}`}
		>
			<canvas
				ref={canvasRef}
				width={100}
				height={80}
				className="block bg-neutral-800"
			/>
			{/* フレーム番号バッジ */}
			<span className={`absolute right-0.5 bottom-0.5 rounded px-1 text-[10px] leading-tight ${
				isActive ? "bg-blue-600 text-white" : "bg-neutral-900/80 text-neutral-400"
			}`}>
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
		<div className="flex w-28 shrink-0 flex-col gap-1.5 overflow-y-auto border-l border-neutral-800/80 bg-neutral-900/95 p-1.5">
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
