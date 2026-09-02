// 計測ツール型定義
// 全ての座標は画像ピクセル座標で保存する。表示時は imageToContainerCoord() で
// OSDビューポート（ズーム・パン・回転・フリップ）に合わせてコンテナ座標へ再投影する。
export type MeasurementPoint = { x: number; y: number };
export type MeasurementUnit = "mm" | "px";

type MeasurementMetadata = {
	sopInstanceUid?: string;
	color?: string;
};

export type DistanceMeasurement = MeasurementMetadata & {
	id: string;
	type: "distance";
	points: [MeasurementPoint, MeasurementPoint];
	distanceMm: number;
	distanceUnit?: MeasurementUnit;
	calibrated?: boolean;
};

export type AngleMeasurement = MeasurementMetadata & {
	id: string;
	type: "angle";
	points: [MeasurementPoint, MeasurementPoint, MeasurementPoint];
	angleDeg: number;
};

export type Measurement = DistanceMeasurement | AngleMeasurement;
