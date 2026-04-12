// L/R/A/P/H/F 6軸方向マーカー表示（renkeibox ViewerImageDirection.tsx 移植）
import type { ImageDirectionInfo } from "@/types/overlay";

type ImageDirectionProps = {
	directionInfo: ImageDirectionInfo | null;
	visible: boolean;
};

export const ImageDirection = ({
	directionInfo,
	visible,
}: ImageDirectionProps) => {
	if (!visible || !directionInfo) return null;

	return (
		<>
			{/* 上 */}
			<div
				className="pointer-events-none absolute top-2 left-1/2 z-10 -translate-x-1/2 font-mono text-sm font-semibold text-sky-300/85"
				style={{ textShadow: "0 0 3px rgba(0,0,0,0.8)" }}
			>
				{directionInfo.top}
			</div>
			{/* 下 */}
			<div
				className="pointer-events-none absolute bottom-2 left-1/2 z-10 -translate-x-1/2 font-mono text-sm font-semibold text-sky-300/85"
				style={{ textShadow: "0 0 3px rgba(0,0,0,0.8)" }}
			>
				{directionInfo.bottom}
			</div>
			{/* 左 */}
			<div
				className="pointer-events-none absolute top-1/2 left-2 z-10 -translate-y-1/2 font-mono text-sm font-semibold text-sky-300/85"
				style={{ textShadow: "0 0 3px rgba(0,0,0,0.8)" }}
			>
				{directionInfo.left}
			</div>
			{/* 右 */}
			<div
				className="pointer-events-none absolute top-1/2 right-2 z-10 -translate-y-1/2 font-mono text-sm font-semibold text-sky-300/85"
				style={{ textShadow: "0 0 3px rgba(0,0,0,0.8)" }}
			>
				{directionInfo.right}
			</div>
		</>
	);
};
