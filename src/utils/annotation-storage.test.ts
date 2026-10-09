import { describe, expect, it } from "vitest";
import type { Annotation } from "@/types/annotation";
import type { DicomFileInfo } from "@/types/dicom";
import type { Measurement } from "@/types/measurement";
import {
	createAnnotationStoragePayload,
	DEFAULT_ANGLE_COLOR,
	DEFAULT_ANNOTATION_COLOR,
	DEFAULT_DISTANCE_COLOR,
	deserializeAnnotationStorage,
	getDicomFileSopInstanceUid,
} from "./annotation-storage";

describe("getDicomFileSopInstanceUid", () => {
	const makeFile = (
		frameIndex: number,
		tags: Record<string, string>,
	): DicomFileInfo => ({
		imageId:
			frameIndex === 0
				? "roentgen:/ct.dcm"
				: `roentgen:/ct.dcm#frame=${frameIndex}`,
		filePath: "/ct.dcm",
		fileName: "ct.dcm",
		frameIndex,
		totalFrames: 3,
		rows: 2,
		columns: 2,
		bitsAllocated: 16,
		bitsStored: 12,
		highBit: 11,
		pixelRepresentation: 0,
		samplesPerPixel: 1,
		photometricInterpretation: "MONOCHROME2",
		rescaleIntercept: -1024,
		rescaleSlope: 1,
		windowCenter: 40,
		windowWidth: 400,
		pixelSpacing: null,
		imageOrientationPatient: null,
		imagePositionPatient: null,
		sliceThickness: null,
		sliceLocation: null,
		instanceNumber: 1,
		modalityLutSequence: null,
		voiLutSequence: null,
		studyInstanceUID: null,
		seriesInstanceUID: null,
		overlayData: [],
		tags,
		thumbnailData: null,
	});

	it("keeps the plain SOP UID for the first frame so saved annotations still match", () => {
		expect(
			getDicomFileSopInstanceUid(makeFile(0, { SOPInstanceUID: "1.2.3" })),
		).toBe("1.2.3");
	});

	it("separates later frames of one multi-frame instance", () => {
		expect(
			getDicomFileSopInstanceUid(makeFile(2, { SOPInstanceUID: "1.2.3" })),
		).toBe("1.2.3#frame=2");
	});

	it("falls back to the frame-specific imageId without a SOP UID", () => {
		expect(getDicomFileSopInstanceUid(makeFile(2, {}))).toBe(
			"roentgen:/ct.dcm#frame=2",
		);
	});
});

describe("annotation-storage", () => {
	it("注釈と計測をJSON保存形式へ変換し、アプリ状態へ復元する", () => {
		const studyInstanceUid = "1.2.840.113619.1";
		const sopInstanceUid = "1.2.840.113619.1.10";
		const annotations: Annotation[] = [
			{
				id: "text-1",
				type: "text",
				sopInstanceUid,
				color: DEFAULT_ANNOTATION_COLOR,
				label: "腫脹",
				position: { x: 12, y: 34 },
				text: "腫脹",
			},
			{
				id: "arrow-1",
				type: "arrow",
				sopInstanceUid,
				color: "#ffcc00",
				label: "",
				start: { x: 1, y: 2 },
				end: { x: 30, y: 40 },
			},
			{
				id: "rect-1",
				type: "rect",
				sopInstanceUid,
				color: "#abcdef",
				label: "ROI",
				topLeft: { x: 10, y: 20 },
				bottomRight: { x: 50, y: 60 },
			},
			{
				id: "ellipse-1",
				type: "ellipse",
				sopInstanceUid,
				color: "#fedcba",
				label: "",
				center: { x: 70, y: 80 },
				radiusX: 12,
				radiusY: 18,
			},
			{
				id: "freehand-1",
				type: "freehand",
				sopInstanceUid,
				color: "#00aaff",
				label: "輪郭",
				points: [
					{ x: 5, y: 6 },
					{ x: 10, y: 12 },
					{ x: 20, y: 24 },
				],
				strokeWidth: 3,
			},
		];
		const measurements: Measurement[] = [
			{
				id: "distance-1",
				type: "distance",
				sopInstanceUid,
				color: DEFAULT_DISTANCE_COLOR,
				points: [
					{ x: 0, y: 0 },
					{ x: 3, y: 4 },
				],
				distanceMm: 5,
			},
			{
				id: "angle-1",
				type: "angle",
				sopInstanceUid,
				color: DEFAULT_ANGLE_COLOR,
				points: [
					{ x: 1, y: 0 },
					{ x: 0, y: 0 },
					{ x: 0, y: 1 },
				],
				angleDeg: 90,
			},
		];

		const payload = createAnnotationStoragePayload({
			studyInstanceUid,
			annotations,
			measurements,
			savedAt: "2026-01-02T03:04:05.000Z",
		});
		const parsedJson: unknown = JSON.parse(JSON.stringify(payload));
		const restored = deserializeAnnotationStorage(studyInstanceUid, parsedJson);

		expect(payload).toMatchObject({
			version: 1,
			studyInstanceUid,
			savedAt: "2026-01-02T03:04:05.000Z",
		});
		expect(payload.annotations).toHaveLength(5);
		expect(payload.measurements).toHaveLength(2);
		expect(payload.annotations[0]).toMatchObject({
			type: "text",
			sopInstanceUid,
			text: "腫脹",
			label: "腫脹",
			color: DEFAULT_ANNOTATION_COLOR,
		});
		expect(payload.measurements[0]).toMatchObject({
			type: "distance",
			sopInstanceUid,
			distanceMm: 5,
			color: DEFAULT_DISTANCE_COLOR,
		});
		expect(payload.annotations[4]).toMatchObject({
			type: "freehand",
			sopInstanceUid,
			points: [
				{ x: 5, y: 6 },
				{ x: 10, y: 12 },
				{ x: 20, y: 24 },
			],
			strokeWidth: 3,
		});
		expect(restored).toEqual({
			studyInstanceUid,
			annotations,
			measurements: [
				{
					...measurements[0],
					distanceUnit: "mm",
					calibrated: true,
				},
				measurements[1],
			],
		});
	});

	it("SOP UIDがない項目にはfallbackを適用し、重複IDは1件にまとめる", () => {
		const payload = createAnnotationStoragePayload({
			studyInstanceUid: "1.2.3",
			fallbackSopInstanceUid: "1.2.3.4",
			annotations: [
				{
					id: "a-1",
					type: "text",
					position: { x: 1, y: 2 },
					text: "memo",
				},
				{
					id: "a-1",
					type: "text",
					position: { x: 3, y: 4 },
					text: "duplicate",
				},
			],
			measurements: [],
			savedAt: "2026-01-02T03:04:05.000Z",
		});

		expect(payload.annotations).toHaveLength(1);
		expect(payload.annotations[0]).toMatchObject({
			id: "a-1",
			sopInstanceUid: "1.2.3.4",
			color: DEFAULT_ANNOTATION_COLOR,
			label: "memo",
		});
	});

	it("点が2つ未満のフリーハンド注釈は保存・復元しない", () => {
		const payload = createAnnotationStoragePayload({
			studyInstanceUid: "1.2.3",
			fallbackSopInstanceUid: "1.2.3.4",
			annotations: [
				{
					id: "freehand-short",
					type: "freehand",
					points: [{ x: 1, y: 2 }],
				},
			],
			measurements: [],
			savedAt: "2026-01-02T03:04:05.000Z",
		});

		expect(payload.annotations).toEqual([]);

		expect(
			deserializeAnnotationStorage("1.2.3", {
				version: 1,
				studyInstanceUid: "1.2.3",
				annotations: [
					{
						id: "freehand-short",
						type: "freehand",
						sopInstanceUid: "1.2.3.4",
						color: DEFAULT_ANNOTATION_COLOR,
						label: "",
						points: [{ x: 1, y: 2 }],
					},
				],
				measurements: [],
			}),
		).toEqual({
			studyInstanceUid: "1.2.3",
			annotations: [],
			measurements: [],
		});
	});

	it("不正なJSON形状と異なるStudy UIDは空の状態として扱う", () => {
		const malformed = {
			version: 1,
			studyInstanceUid: "1.2.3",
			annotations: [
				{
					id: "valid",
					type: "arrow",
					sopInstanceUid: "1.2.3.4",
					color: "#fff",
					label: "",
					start: { x: 1, y: 2 },
					end: { x: 3, y: 4 },
				},
				{
					id: "invalid",
					type: "distance",
					sopInstanceUid: "1.2.3.4",
					color: "#fff",
					label: "",
				},
			],
			measurements: [{ id: "broken", type: "distance" }],
		};

		expect(deserializeAnnotationStorage("9.9.9", malformed)).toEqual({
			studyInstanceUid: "9.9.9",
			annotations: [],
			measurements: [],
		});
		expect(deserializeAnnotationStorage("1.2.3", malformed)).toEqual({
			studyInstanceUid: "1.2.3",
			annotations: [
				{
					id: "valid",
					type: "arrow",
					sopInstanceUid: "1.2.3.4",
					color: "#fff",
					label: "",
					start: { x: 1, y: 2 },
					end: { x: 3, y: 4 },
				},
			],
			measurements: [],
		});
	});

	it("v1保存データはマイグレーション経路を通って読み込める", () => {
		const payload = {
			version: 1,
			studyInstanceUid: "1.2.3",
			savedAt: "2026-01-02T03:04:05.000Z",
			annotations: [],
			measurements: [
				{
					id: "distance-1",
					type: "distance",
					sopInstanceUid: "1.2.3.4",
					color: DEFAULT_DISTANCE_COLOR,
					points: [
						{ x: 0, y: 0 },
						{ x: 3, y: 4 },
					],
					distanceMm: 5,
				},
			],
		};

		const restored = deserializeAnnotationStorage("1.2.3", payload);

		expect(restored.measurements).toEqual([
			{
				id: "distance-1",
				type: "distance",
				sopInstanceUid: "1.2.3.4",
				color: DEFAULT_DISTANCE_COLOR,
				points: [
					{ x: 0, y: 0 },
					{ x: 3, y: 4 },
				],
				distanceMm: 5,
				distanceUnit: "mm",
				calibrated: true,
			},
		]);
	});
});
