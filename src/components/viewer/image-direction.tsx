// L/R/A/P/H/F 6軸方向マーカー表示
// equineモード時は Lat/Med/Do/Pa/Pr/Di を表示

import type { ImageDirectionInfo } from "@/types/overlay";
import type { Species } from "@/utils/image-direction";

type ImageDirectionProps = {
	directionInfo: ImageDirectionInfo | null;
	visible: boolean;
	species?: Species;
};

const BASE =
	"pointer-events-none absolute z-10 font-mono text-sm font-semibold text-accent/85 overlay-text-shadow";

export const ImageDirection = ({
	directionInfo,
	visible,
	species: _species = "equine",
}: ImageDirectionProps) => {
	if (!visible || !directionInfo) return null;

	return (
		<>
			{/* 上 */}
			<div className={`${BASE} top-2 left-1/2 -translate-x-1/2`}>
				{directionInfo.top}
			</div>
			{/* 下 */}
			<div className={`${BASE} bottom-2 left-1/2 -translate-x-1/2`}>
				{directionInfo.bottom}
			</div>
			{/* 左 */}
			<div className={`${BASE} top-1/2 left-2 -translate-y-1/2`}>
				{directionInfo.left}
			</div>
			{/* 右 */}
			<div className={`${BASE} top-1/2 right-2 -translate-y-1/2`}>
				{directionInfo.right}
			</div>
		</>
	);
};
