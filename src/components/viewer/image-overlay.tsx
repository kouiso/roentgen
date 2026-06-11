// 4隅DICOMタグオーバーレイ表示
import type { ImageOverlayInfo, OverlayPosition } from "@/types/overlay";

type ImageOverlayProps = {
	overlayInfo: ImageOverlayInfo;
	visible: boolean;
};

const POSITION_CLASSES: Record<OverlayPosition, string> = {
	topLeft: "top-2 left-2",
	topRight: "top-2 right-2 text-right",
	bottomLeft: "bottom-2 left-2",
	bottomRight: "bottom-2 right-2 text-right",
};

export const ImageOverlay = ({ overlayInfo, visible }: ImageOverlayProps) => {
	if (!visible) return null;

	return (
		<>
			{(
				Object.entries(overlayInfo) as [
					OverlayPosition,
					typeof overlayInfo.topLeft,
				][]
			).map(([position, items]) => (
				<div
					key={position}
					className={`pointer-events-none absolute ${POSITION_CLASSES[position]} z-10 max-w-xs`}
				>
					{items.map((item) => (
						<div
							key={item.id}
							className={
								"overlay-text-shadow-strong text-[11px] leading-[1.35] " +
								(item.bold
									? "font-sans font-bold text-ink"
									: "font-mono text-ink/85")
							}
						>
							{item.value}
						</div>
					))}
				</div>
			))}
		</>
	);
};
