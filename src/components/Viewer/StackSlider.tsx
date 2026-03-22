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
		<div className="flex shrink-0 items-center gap-1 border-t border-neutral-800/80 bg-neutral-900/95 px-2 py-0.5">
			<button
				type="button"
				onClick={onPrev}
				disabled={currentFrame <= 0}
				className="rounded p-0.5 text-neutral-400 hover:bg-neutral-700/60 hover:text-white disabled:text-neutral-700"
			>
				<ChevronLeft size={14} />
			</button>
			<input
				type="range"
				min={0}
				max={maxFrame}
				value={currentFrame}
				onChange={(e) => onFrameChange(Number(e.target.value))}
				className="h-1 flex-1 cursor-pointer appearance-none rounded-full bg-neutral-700 accent-blue-500"
			/>
			<button
				type="button"
				onClick={onNext}
				disabled={currentFrame >= maxFrame}
				className="rounded p-0.5 text-neutral-400 hover:bg-neutral-700/60 hover:text-white disabled:text-neutral-700"
			>
				<ChevronRight size={14} />
			</button>
			<span className="min-w-[3.5rem] text-right font-mono text-[11px] text-neutral-500">
				{currentFrame + 1} / {maxFrame + 1}
			</span>
		</div>
	);
};
