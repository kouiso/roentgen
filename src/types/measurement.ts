// 計測ツール型定義
export type MeasurementPoint = { x: number; y: number };

export type DistanceMeasurement = {
	id: string;
	type: "distance";
	points: [MeasurementPoint, MeasurementPoint];
	distanceMm: number;
};

export type AngleMeasurement = {
	id: string;
	type: "angle";
	points: [MeasurementPoint, MeasurementPoint, MeasurementPoint];
	angleDeg: number;
};

export type Measurement = DistanceMeasurement | AngleMeasurement;
