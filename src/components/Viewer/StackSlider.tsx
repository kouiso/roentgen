// スタック切替スライダー（renkeibox StackView内のslider 参考）
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
		<div className="flex shrink-0 items-center gap-2 border-t border-neutral-800 bg-neutral-900 px-3 py-1">
			<button
				type="button"
				onClick={onPrev}
				disabled={currentFrame <= 0}
				className="text-xs text-neutral-400 hover:text-white disabled:text-neutral-700"
			>
				◀
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
				className="text-xs text-neutral-400 hover:text-white disabled:text-neutral-700"
			>
				▶
			</button>
			<span className="min-w-[4rem] text-right text-xs text-neutral-500">
				{currentFrame + 1} / {maxFrame + 1}
			</span>
		</div>
	);
};
