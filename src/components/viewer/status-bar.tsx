import type { LayoutType } from "@/types/layout";
import { VIEWER_CONTROL_TYPE, type ViewerControlType } from "@/types/viewer";

type StatusBarProps = {
	activeMode: ViewerControlType;
	currentWW?: number;
	currentWC?: number;
	isInverted?: boolean;
	layout: LayoutType;
	activePaneIndex: number;
	paneCount: number;
	viewerReady?: boolean;
};

const MODE_LABEL: Record<ViewerControlType, string> = {
	[VIEWER_CONTROL_TYPE.WW_WC]: "ウィンドウ調整",
	[VIEWER_CONTROL_TYPE.ZOOM]: "ズーム",
	[VIEWER_CONTROL_TYPE.PAN]: "移動",
	[VIEWER_CONTROL_TYPE.MEASURE_DISTANCE]: "距離計測",
	[VIEWER_CONTROL_TYPE.MEASURE_ANGLE]: "角度計測",
};

const MODE_DOT_CLASS: Record<ViewerControlType, string> = {
	[VIEWER_CONTROL_TYPE.WW_WC]: "bg-accent",
	[VIEWER_CONTROL_TYPE.ZOOM]: "bg-sky-400",
	[VIEWER_CONTROL_TYPE.PAN]: "bg-amber-400",
	[VIEWER_CONTROL_TYPE.MEASURE_DISTANCE]: "bg-emerald-400",
	[VIEWER_CONTROL_TYPE.MEASURE_ANGLE]: "bg-violet-400",
};

export const StatusBar = ({
	activeMode,
	currentWW,
	currentWC,
	isInverted,
	layout,
	activePaneIndex,
	paneCount,
	viewerReady,
}: StatusBarProps) => {
	return (
		<div className="flex h-[30px] shrink-0 items-center gap-3 border-t border-white/[0.075] bg-chrome-2 px-3 text-[11px]">
			<div className="flex items-center gap-1.5">
				<span
					className={`h-1.5 w-1.5 rounded-full ${MODE_DOT_CLASS[activeMode]}`}
				/>
				<span className="text-ink-3">{MODE_LABEL[activeMode]}</span>
			</div>

			{viewerReady &&
				currentWW != null &&
				!Number.isNaN(currentWW) &&
				currentWC != null &&
				!Number.isNaN(currentWC) && (
					<>
						<div className="h-3 w-px bg-white/[0.075]" />
						<span className="font-mono text-ink-2">
							{"WW "}
							<span className="text-ink">{Math.round(currentWW)}</span>
							<span className="mx-1 text-ink-3">·</span>
							{"WC "}
							<span className="text-ink">{Math.round(currentWC)}</span>
						</span>
						{isInverted && (
							<span className="rounded bg-white/[0.06] px-1.5 py-0.5 text-[9px] font-medium text-ink-3">
								反転
							</span>
						)}
					</>
				)}

			<div className="flex-1" />

			<span className="font-mono text-ink-3">
				{layout}
				{paneCount > 1 && (
					<span className="ml-1 text-ink-2">· P{activePaneIndex + 1}</span>
				)}
			</span>
		</div>
	);
};
