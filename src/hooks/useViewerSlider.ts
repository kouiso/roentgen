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
		case "NEXT":
			return {
				...state,
				currentFrame: Math.min(state.currentFrame + 1, state.maxFrame),
			};
		case "PREV":
			return {
				...state,
				currentFrame: Math.max(state.currentFrame - 1, 0),
			};
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

	// stale closure回避: reducer内で最新のstateを参照
	const nextFrame = useCallback(() => {
		dispatch({ type: "NEXT" });
	}, []);

	const prevFrame = useCallback(() => {
		dispatch({ type: "PREV" });
	}, []);

	return {
		sliderState,
		setFrame,
		setMaxFrame,
		nextFrame,
		prevFrame,
	};
};
