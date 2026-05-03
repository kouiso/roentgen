// 注釈ツール型定義
export type AnnotationPoint = { x: number; y: number };

export type AnnotationToolType = "text" | "arrow" | "rect" | "ellipse";

export type TextAnnotation = {
	id: string;
	type: "text";
	position: AnnotationPoint; // 画像座標
	text: string;
};

export type ArrowAnnotation = {
	id: string;
	type: "arrow";
	start: AnnotationPoint; // 矢印の尾
	end: AnnotationPoint; // 矢印の先端
};

export type RectAnnotation = {
	id: string;
	type: "rect";
	topLeft: AnnotationPoint;
	bottomRight: AnnotationPoint;
};

export type EllipseAnnotation = {
	id: string;
	type: "ellipse";
	center: AnnotationPoint;
	radiusX: number; // 画像ピクセル単位
	radiusY: number;
};

export type Annotation =
	| TextAnnotation
	| ArrowAnnotation
	| RectAnnotation
	| EllipseAnnotation;
