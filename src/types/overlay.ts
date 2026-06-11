// オーバーレイ情報（renkeibox ImageOverlayInfo 参考）
// 4隅に表示するDICOMタグ情報

export type OverlayPosition =
	| "topLeft"
	| "topRight"
	| "bottomLeft"
	| "bottomRight";

export type OverlayItem = {
	id: string;
	label: string;
	value: string;
	position: OverlayPosition;
	bold?: boolean;
};

export type ImageOverlayInfo = {
	topLeft: OverlayItem[];
	topRight: OverlayItem[];
	bottomLeft: OverlayItem[];
	bottomRight: OverlayItem[];
};

// 画像方向情報（renkeibox ImageDirectionInfo 参考）
// L/R/A/P/H/F の6軸方向マーカー
export type ImageDirectionInfo = {
	top: string;
	bottom: string;
	left: string;
	right: string;
};

// オーバーレイ項目定義（renkeibox ImageOverlay.ts の70+タグ定義 参考）
export type OverlayItemDefinition = {
	id: string;
	tag: string;
	label: string;
	position: OverlayPosition;
	format?: (value: string) => string;
	bold?: boolean;
};
