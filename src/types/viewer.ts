// ビューア操作モード（renkeibox ViewerControlType 参考）
export const VIEWER_CONTROL_TYPE = {
	WW_WC: "WW_WC",
	ZOOM: "ZOOM",
	PAN: "PAN",
} as const;

export type ViewerControlType =
	(typeof VIEWER_CONTROL_TYPE)[keyof typeof VIEWER_CONTROL_TYPE];

// ビューアのワールド情報（renkeibox ViewerWorldInfo 参考）
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

// マウス状態（renkeibox ViewerMouseState 参考）
export type ViewerMouseState = {
	isDown: boolean;
	startX: number;
	startY: number;
	lastX: number;
	lastY: number;
	button: number;
};

// スライダー状態（renkeibox ViewerSliderState 参考）
export type ViewerSliderAction =
	| { type: "ENTER"; frameIndex: number }
	| { type: "CHANGING"; frameIndex: number }
	| { type: "MAX"; max: number };

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

export const INITIAL_MOUSE_STATE: ViewerMouseState = {
	isDown: false,
	startX: 0,
	startY: 0,
	lastX: 0,
	lastY: 0,
	button: 0,
};
