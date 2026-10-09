// 画像の上下左右に、その辺が動物のどちら側かを示す方向マーカー

import type { ImageDirectionInfo } from "@/types/overlay";

type ImageDirectionProps = {
	directionInfo: ImageDirectionInfo | null;
	visible: boolean;
};

const BASE =
	"pointer-events-none absolute z-10 font-mono text-sm font-semibold text-accent/85 overlay-text-shadow";

const POSITIONS: Record<keyof ImageDirectionInfo, string> = {
	top: "top-2 left-1/2 -translate-x-1/2",
	bottom: "bottom-2 left-1/2 -translate-x-1/2",
	left: "top-1/2 left-2 -translate-y-1/2",
	right: "top-1/2 right-2 -translate-y-1/2",
};

const SIDES = ["top", "bottom", "left", "right"] as const;

export const ImageDirection = ({
	directionInfo,
	visible,
}: ImageDirectionProps) => {
	if (!visible || !directionInfo) return null;

	return (
		<>
			{SIDES.map((side) => (
				<div
					key={side}
					data-testid={`direction-marker-${side}`}
					className={`${BASE} ${POSITIONS[side]}`}
				>
					{directionInfo[side]}
				</div>
			))}
		</>
	);
};
