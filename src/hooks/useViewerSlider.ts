// スタックスライダー状態管理（renkeibox useViewerSlider.ts 移植）
import { useCallback, useReducer } from "react";
import type { ViewerSliderAction, ViewerSliderState } from "@/types/viewer";

const sliderReducer = (
	state: ViewerSliderState,
	action: ViewerSliderAction,
): ViewerSliderState => {
	switch (action.type) {
		case "ENTER":
			return { ...state, currentFrame: action.frameIndex };
		case "CHANGING":
			return { ...state, currentFrame: action.frameIndex };
		case "MAX":
			return { ...state, maxFrame: action.max };
	}
};

const INITIAL_STATE: ViewerSliderState = {
	currentFrame: 0,
	maxFrame: 0,
};

export const useViewerSlider = () => {
	const [sliderState, dispatch] = useReducer(sliderReducer, INITIAL_STATE);

	const setFrame = useCallback((frameIndex: number) => {
		dispatch({ type: "ENTER", frameIndex });
	}, []);

	const setMaxFrame = useCallback((max: number) => {
		dispatch({ type: "MAX", max });
	}, []);

	const nextFrame = useCallback(() => {
		dispatch({
			type: "CHANGING",
			frameIndex: Math.min(
				sliderState.currentFrame + 1,
				sliderState.maxFrame,
			),
		});
	}, [sliderState.currentFrame, sliderState.maxFrame]);

	const prevFrame = useCallback(() => {
		dispatch({
			type: "CHANGING",
			frameIndex: Math.max(sliderState.currentFrame - 1, 0),
		});
	}, [sliderState.currentFrame]);

	return {
		sliderState,
		setFrame,
		setMaxFrame,
		nextFrame,
		prevFrame,
	};
};
