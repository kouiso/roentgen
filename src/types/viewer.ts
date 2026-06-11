// ビューア操作モード
export const VIEWER_CONTROL_TYPE = {
	WW_WC: "WW_WC",
	ZOOM: "ZOOM",
	PAN: "PAN",
	MEASURE_DISTANCE: "MEASURE_DISTANCE",
	MEASURE_ANGLE: "MEASURE_ANGLE",
} as const;

export type ViewerControlType =
	(typeof VIEWER_CONTROL_TYPE)[keyof typeof VIEWER_CONTROL_TYPE];

// ビューアのワールド情報
export type ViewerWorldInfo = {
	windowWidth: number;
	windowCenter: number;
	zoom: number;
	panX: number;
	panY: number;
	invert: boolean;
	rotation: number;
	flipHorizontal: boolean;
	flipVertical: boolean;
};

// スライダー状態
export type ViewerSliderAction =
	| { type: "ENTER"; frameIndex: number }
	| { type: "CHANGING"; frameIndex: number }
	| { type: "MAX"; max: number }
	| { type: "NEXT" }
	| { type: "PREV" };

export type ViewerSliderState = {
	currentFrame: number;
	maxFrame: number;
};

// ビューア初期値
export const INITIAL_WORLD_INFO: ViewerWorldInfo = {
	windowWidth: 0,
	windowCenter: 0,
	zoom: 1,
	panX: 0,
	panY: 0,
	invert: false,
	rotation: 0,
	flipHorizontal: false,
	flipVertical: false,
};
