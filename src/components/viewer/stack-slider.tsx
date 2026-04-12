// スタック切替スライダー — lucide-react アイコン版
import { ChevronLeft, ChevronRight } from "lucide-react";

type StackSliderProps = {
	currentFrame: number;
	maxFrame: number;
	onFrameChange: (frame: number) => void;
	onNext: () => void;
	onPrev: () => void;
};

export const StackSlider = ({
	currentFrame,
	maxFrame,
	onFrameChange,
	onNext,
	onPrev,
}: StackSliderProps) => {
	if (maxFrame <= 0) return null;

	return (
		<div className="flex shrink-0 items-center gap-1.5 border-t border-white/5 px-3 py-1 panel-surface">
			<button
				type="button"
				onClick={onPrev}
				disabled={currentFrame <= 0}
				className="rounded p-0.5 text-zinc-400 transition-colors hover:bg-white/[0.06] hover:text-zinc-100 disabled:text-zinc-700"
			>
				<ChevronLeft size={14} />
			</button>
			<input
				type="range"
				min={0}
				max={maxFrame}
				value={currentFrame}
				onChange={(e) => onFrameChange(Number(e.target.value))}
				className="h-1 flex-1 cursor-pointer appearance-none rounded-full bg-white/10 accent-sky-400"
			/>
			<button
				type="button"
				onClick={onNext}
				disabled={currentFrame >= maxFrame}
				className="rounded p-0.5 text-zinc-400 transition-colors hover:bg-white/[0.06] hover:text-zinc-100 disabled:text-zinc-700"
			>
				<ChevronRight size={14} />
			</button>
			<span className="min-w-[3.5rem] text-right font-mono tabular-nums text-[11px] text-zinc-400">
				{currentFrame + 1} / {maxFrame + 1}
			</span>
		</div>
	);
};
