// 注釈・計測のJSON永続化フォーマット
import type { Annotation, AnnotationPoint } from "@/types/annotation";
import type { DicomFileInfo } from "@/types/dicom";
import type { Measurement, MeasurementPoint } from "@/types/measurement";

export const ANNOTATION_STORAGE_VERSION = 1;
export const DEFAULT_ANNOTATION_COLOR = "#FFD700";
export const DEFAULT_DISTANCE_COLOR = "#00ff88";
export const DEFAULT_ANGLE_COLOR = "#ffaa00";

export type SerializablePoint = { x: number; y: number };

type SerializableAnnotationBase = {
	id: string;
	sopInstanceUid: string;
	color: string;
	label: string;
};

export type SerializableTextAnnotation = SerializableAnnotationBase & {
	type: "text";
	position: SerializablePoint;
	text: string;
};

export type SerializableArrowAnnotation = SerializableAnnotationBase & {
	type: "arrow";
	start: SerializablePoint;
	end: SerializablePoint;
};

export type SerializableRectAnnotation = SerializableAnnotationBase & {
	type: "rect";
	topLeft: SerializablePoint;
	bottomRight: SerializablePoint;
};

export type SerializableEllipseAnnotation = SerializableAnnotationBase & {
	type: "ellipse";
	center: SerializablePoint;
	radiusX: number;
	radiusY: number;
};

export type SerializableFreehandAnnotation = SerializableAnnotationBase & {
	type: "freehand";
	points: SerializablePoint[];
	strokeWidth?: number;
};

export type SerializableAnnotation =
	| SerializableTextAnnotation
	| SerializableArrowAnnotation
	| SerializableRectAnnotation
	| SerializableEllipseAnnotation
	| SerializableFreehandAnnotation;

type SerializableMeasurementBase = {
	id: string;
	sopInstanceUid: string;
	color: string;
};

export type SerializableDistanceMeasurement = SerializableMeasurementBase & {
	type: "distance";
	points: [SerializablePoint, SerializablePoint];
	distanceMm: number;
};

export type SerializableAngleMeasurement = SerializableMeasurementBase & {
	type: "angle";
	points: [SerializablePoint, SerializablePoint, SerializablePoint];
	angleDeg: number;
};

export type SerializableMeasurement =
	| SerializableDistanceMeasurement
	| SerializableAngleMeasurement;

export type AnnotationStoragePayload = {
	version: 1;
	studyInstanceUid: string;
	savedAt: string;
	annotations: SerializableAnnotation[];
	measurements: SerializableMeasurement[];
};

export type AnnotationStorageState = {
	studyInstanceUid: string;
	annotations: Annotation[];
	measurements: Measurement[];
};

type CreateAnnotationStoragePayloadInput = {
	studyInstanceUid: string;
	annotations: Annotation[];
	measurements: Measurement[];
	savedAt?: string;
	fallbackSopInstanceUid?: string | null;
};

const copyAnnotationPoint = (point: AnnotationPoint): SerializablePoint => ({
	x: point.x,
	y: point.y,
});

const copyMeasurementPoint = (point: MeasurementPoint): SerializablePoint => ({
	x: point.x,
	y: point.y,
});

const getAnnotationSopInstanceUid = (
	annotation: Annotation,
	fallbackSopInstanceUid?: string | null,
): string | null => annotation.sopInstanceUid ?? fallbackSopInstanceUid ?? null;

const getMeasurementSopInstanceUid = (
	measurement: Measurement,
	fallbackSopInstanceUid?: string | null,
): string | null =>
	measurement.sopInstanceUid ?? fallbackSopInstanceUid ?? null;

const serializeAnnotation = (
	annotation: Annotation,
	fallbackSopInstanceUid?: string | null,
): SerializableAnnotation | null => {
	const sopInstanceUid = getAnnotationSopInstanceUid(
		annotation,
		fallbackSopInstanceUid,
	);
	if (!sopInstanceUid) return null;
	const color = annotation.color ?? DEFAULT_ANNOTATION_COLOR;
	const label =
		annotation.label ?? (annotation.type === "text" ? annotation.text : "");

	switch (annotation.type) {
		case "text":
			return {
				id: annotation.id,
				type: "text",
				sopInstanceUid,
				color,
				label,
				position: copyAnnotationPoint(annotation.position),
				text: annotation.text,
			};
		case "arrow":
			return {
				id: annotation.id,
				type: "arrow",
				sopInstanceUid,
				color,
				label,
				start: copyAnnotationPoint(annotation.start),
				end: copyAnnotationPoint(annotation.end),
			};
		case "rect":
			return {
				id: annotation.id,
				type: "rect",
				sopInstanceUid,
				color,
				label,
				topLeft: copyAnnotationPoint(annotation.topLeft),
				bottomRight: copyAnnotationPoint(annotation.bottomRight),
			};
		case "ellipse":
			return {
				id: annotation.id,
				type: "ellipse",
				sopInstanceUid,
				color,
				label,
				center: copyAnnotationPoint(annotation.center),
				radiusX: annotation.radiusX,
				radiusY: annotation.radiusY,
			};
		case "freehand":
			if (annotation.points.length < 2) return null;
			return {
				id: annotation.id,
				type: "freehand",
				sopInstanceUid,
				color,
				label,
				points: annotation.points.map(copyAnnotationPoint),
				...(annotation.strokeWidth
					? { strokeWidth: annotation.strokeWidth }
					: {}),
			};
	}
};

const serializeMeasurement = (
	measurement: Measurement,
	fallbackSopInstanceUid?: string | null,
): SerializableMeasurement | null => {
	const sopInstanceUid = getMeasurementSopInstanceUid(
		measurement,
		fallbackSopInstanceUid,
	);
	if (!sopInstanceUid) return null;
	const color =
		measurement.color ??
		(measurement.type === "distance"
			? DEFAULT_DISTANCE_COLOR
			: DEFAULT_ANGLE_COLOR);

	switch (measurement.type) {
		case "distance":
			return {
				id: measurement.id,
				type: "distance",
				sopInstanceUid,
				color,
				points: [
					copyMeasurementPoint(measurement.points[0]),
					copyMeasurementPoint(measurement.points[1]),
				],
				distanceMm: measurement.distanceMm,
			};
		case "angle":
			return {
				id: measurement.id,
				type: "angle",
				sopInstanceUid,
				color,
				points: [
					copyMeasurementPoint(measurement.points[0]),
					copyMeasurementPoint(measurement.points[1]),
					copyMeasurementPoint(measurement.points[2]),
				],
				angleDeg: measurement.angleDeg,
			};
	}
};

export const createEmptyAnnotationStorageState = (
	studyInstanceUid: string,
): AnnotationStorageState => ({
	studyInstanceUid,
	annotations: [],
	measurements: [],
});

export const createAnnotationStoragePayload = ({
	studyInstanceUid,
	annotations,
	measurements,
	savedAt = new Date().toISOString(),
	fallbackSopInstanceUid = null,
}: CreateAnnotationStoragePayloadInput): AnnotationStoragePayload => {
	const annotationIds = new Set<string>();
	const serializedAnnotations: SerializableAnnotation[] = [];
	for (const annotation of annotations) {
		if (annotationIds.has(annotation.id)) continue;
		const serialized = serializeAnnotation(annotation, fallbackSopInstanceUid);
		if (!serialized) continue;
		annotationIds.add(annotation.id);
		serializedAnnotations.push(serialized);
	}

	const measurementIds = new Set<string>();
	const serializedMeasurements: SerializableMeasurement[] = [];
	for (const measurement of measurements) {
		if (measurementIds.has(measurement.id)) continue;
		const serialized = serializeMeasurement(
			measurement,
			fallbackSopInstanceUid,
		);
		if (!serialized) continue;
		measurementIds.add(measurement.id);
		serializedMeasurements.push(serialized);
	}

	return {
		version: ANNOTATION_STORAGE_VERSION,
		studyInstanceUid,
		savedAt,
		annotations: serializedAnnotations,
		measurements: serializedMeasurements,
	};
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null && !Array.isArray(value);

const isFiniteNumber = (value: unknown): value is number =>
	typeof value === "number" && Number.isFinite(value);

const isString = (value: unknown): value is string => typeof value === "string";

const parsePoint = (value: unknown): SerializablePoint | null => {
	if (!isRecord(value)) return null;
	if (!isFiniteNumber(value.x) || !isFiniteNumber(value.y)) return null;
	return { x: value.x, y: value.y };
};

const parseTwoPoints = (
	value: unknown,
): [SerializablePoint, SerializablePoint] | null => {
	if (!Array.isArray(value) || value.length !== 2) return null;
	const p0 = parsePoint(value[0]);
	const p1 = parsePoint(value[1]);
	if (!p0 || !p1) return null;
	return [p0, p1];
};

const parseThreePoints = (
	value: unknown,
): [SerializablePoint, SerializablePoint, SerializablePoint] | null => {
	if (!Array.isArray(value) || value.length !== 3) return null;
	const p0 = parsePoint(value[0]);
	const p1 = parsePoint(value[1]);
	const p2 = parsePoint(value[2]);
	if (!p0 || !p1 || !p2) return null;
	return [p0, p1, p2];
};

const parsePointArray = (value: unknown): SerializablePoint[] | null => {
	if (!Array.isArray(value)) return null;
	const points = value.map(parsePoint);
	if (points.some((point) => point === null)) return null;
	return points as SerializablePoint[];
};

const parseAnnotationBase = (
	value: Record<string, unknown>,
): {
	id: string;
	sopInstanceUid: string;
	color: string;
	label: string;
} | null => {
	if (
		!isString(value.id) ||
		!isString(value.sopInstanceUid) ||
		!isString(value.color) ||
		!isString(value.label)
	) {
		return null;
	}
	return {
		id: value.id,
		sopInstanceUid: value.sopInstanceUid,
		color: value.color,
		label: value.label,
	};
};

const parseStoredAnnotation = (value: unknown): Annotation | null => {
	if (!isRecord(value) || !isString(value.type)) return null;
	const base = parseAnnotationBase(value);
	if (!base) return null;

	switch (value.type) {
		case "text": {
			const position = parsePoint(value.position);
			if (!position || !isString(value.text)) return null;
			return {
				...base,
				type: "text",
				position,
				text: value.text,
			};
		}
		case "arrow": {
			const start = parsePoint(value.start);
			const end = parsePoint(value.end);
			if (!start || !end) return null;
			return {
				...base,
				type: "arrow",
				start,
				end,
			};
		}
		case "rect": {
			const topLeft = parsePoint(value.topLeft);
			const bottomRight = parsePoint(value.bottomRight);
			if (!topLeft || !bottomRight) return null;
			return {
				...base,
				type: "rect",
				topLeft,
				bottomRight,
			};
		}
		case "ellipse": {
			const center = parsePoint(value.center);
			if (
				!center ||
				!isFiniteNumber(value.radiusX) ||
				!isFiniteNumber(value.radiusY)
			) {
				return null;
			}
			return {
				...base,
				type: "ellipse",
				center,
				radiusX: value.radiusX,
				radiusY: value.radiusY,
			};
		}
		case "freehand": {
			const points = parsePointArray(value.points);
			if (!points || points.length < 2) return null;
			return {
				...base,
				type: "freehand",
				points,
				...(isFiniteNumber(value.strokeWidth)
					? { strokeWidth: value.strokeWidth }
					: {}),
			};
		}
	}
	return null;
};

const parseMeasurementBase = (
	value: Record<string, unknown>,
): {
	id: string;
	sopInstanceUid: string;
	color: string;
} | null => {
	if (
		!isString(value.id) ||
		!isString(value.sopInstanceUid) ||
		!isString(value.color)
	) {
		return null;
	}
	return {
		id: value.id,
		sopInstanceUid: value.sopInstanceUid,
		color: value.color,
	};
};

const parseStoredMeasurement = (value: unknown): Measurement | null => {
	if (!isRecord(value) || !isString(value.type)) return null;
	const base = parseMeasurementBase(value);
	if (!base) return null;

	switch (value.type) {
		case "distance": {
			const points = parseTwoPoints(value.points);
			if (!points || !isFiniteNumber(value.distanceMm)) return null;
			return {
				...base,
				type: "distance",
				points,
				distanceMm: value.distanceMm,
			};
		}
		case "angle": {
			const points = parseThreePoints(value.points);
			if (!points || !isFiniteNumber(value.angleDeg)) return null;
			return {
				...base,
				type: "angle",
				points,
				angleDeg: value.angleDeg,
			};
		}
	}
	return null;
};

export const deserializeAnnotationStorage = (
	studyInstanceUid: string,
	value: unknown,
): AnnotationStorageState => {
	if (!isRecord(value))
		return createEmptyAnnotationStorageState(studyInstanceUid);
	if (
		value.version !== ANNOTATION_STORAGE_VERSION ||
		value.studyInstanceUid !== studyInstanceUid ||
		!Array.isArray(value.annotations) ||
		!Array.isArray(value.measurements)
	) {
		return createEmptyAnnotationStorageState(studyInstanceUid);
	}

	const annotations: Annotation[] = [];
	for (const annotationValue of value.annotations) {
		const annotation = parseStoredAnnotation(annotationValue);
		if (annotation) annotations.push(annotation);
	}

	const measurements: Measurement[] = [];
	for (const measurementValue of value.measurements) {
		const measurement = parseStoredMeasurement(measurementValue);
		if (measurement) measurements.push(measurement);
	}

	return {
		studyInstanceUid,
		annotations,
		measurements,
	};
};

export const getDicomFileSopInstanceUid = (
	file: DicomFileInfo | null,
): string | null => {
	if (!file) return null;
	return file.tags.SOPInstanceUID ?? file.imageId;
};

export const matchesSopInstanceUid = (
	itemSopInstanceUid: string | undefined,
	sopInstanceUid: string | null,
): boolean => {
	if (!sopInstanceUid) return false;
	if (!itemSopInstanceUid) return true;
	return itemSopInstanceUid === sopInstanceUid;
};
