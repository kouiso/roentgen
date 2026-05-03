import { describe, expect, it } from "vitest";
import type { DicomFileInfo } from "@/types/dicom";
import { getAllSeries, groupByStudySeries } from "./study-grouper";

// ---------------------------------------------------------------------------
// Helper: create a minimal DicomFileInfo for testing
// ---------------------------------------------------------------------------
function makeFile(overrides: Partial<DicomFileInfo> = {}): DicomFileInfo {
	return {
		imageId: "test-image",
		filePath: "/tmp/test.dcm",
		fileName: "test.dcm",
		frameIndex: 0,
		totalFrames: 1,
		rows: 512,
		columns: 512,
		bitsAllocated: 16,
		bitsStored: 12,
		highBit: 11,
		pixelRepresentation: 0,
		samplesPerPixel: 1,
		photometricInterpretation: "MONOCHROME2",
		rescaleIntercept: 0,
		rescaleSlope: 1,
		windowCenter: 40,
		windowWidth: 400,
		pixelSpacing: null,
		imageOrientationPatient: null,
		imagePositionPatient: null,
		sliceThickness: null,
		sliceLocation: null,
		instanceNumber: null,
		modalityLutSequence: null,
		voiLutSequence: null,
		studyInstanceUID: null,
		seriesInstanceUID: null,
		overlayData: [],
		tags: {},
		thumbnailData: null,
		...overrides,
	};
}

// ---------------------------------------------------------------------------
// groupByStudySeries
// ---------------------------------------------------------------------------
describe("groupByStudySeries", () => {
	it("returns empty array for empty input", () => {
		expect(groupByStudySeries([])).toEqual([]);
	});

	it("groups files by studyInstanceUID", () => {
		const files = [
			makeFile({
				studyInstanceUID: "study-1",
				seriesInstanceUID: "series-1",
				tags: { StudyDate: "20240101", PatientName: "Patient1" },
			}),
			makeFile({
				studyInstanceUID: "study-2",
				seriesInstanceUID: "series-2",
				tags: { StudyDate: "20240102", PatientName: "Patient2" },
			}),
		];

		const result = groupByStudySeries(files);
		expect(result).toHaveLength(2);
		expect(result[0].studyInstanceUID).toBe("study-1");
		expect(result[1].studyInstanceUID).toBe("study-2");
	});

	it("groups files by seriesInstanceUID within a study", () => {
		const files = [
			makeFile({
				studyInstanceUID: "study-1",
				seriesInstanceUID: "series-A",
				tags: { SeriesNumber: "1" },
			}),
			makeFile({
				studyInstanceUID: "study-1",
				seriesInstanceUID: "series-B",
				tags: { SeriesNumber: "2" },
			}),
			makeFile({
				studyInstanceUID: "study-1",
				seriesInstanceUID: "series-A",
				tags: { SeriesNumber: "1" },
			}),
		];

		const result = groupByStudySeries(files);
		expect(result).toHaveLength(1);
		expect(result[0].series).toHaveLength(2);

		const seriesA = result[0].series.find(
			(s) => s.seriesInstanceUID === "series-A",
		);
		expect(seriesA).toBeDefined();
		if (!seriesA) return;
		expect(seriesA.files).toHaveLength(2);
	});

	it("assigns __unknown__ for null studyInstanceUID", () => {
		const files = [
			makeFile({ studyInstanceUID: null, seriesInstanceUID: "s1" }),
		];

		const result = groupByStudySeries(files);
		expect(result).toHaveLength(1);
		expect(result[0].studyInstanceUID).toBe("__unknown__");
	});

	it("assigns __unknown__ for null seriesInstanceUID", () => {
		const files = [
			makeFile({ studyInstanceUID: "study-1", seriesInstanceUID: null }),
		];

		const result = groupByStudySeries(files);
		expect(result).toHaveLength(1);
		expect(result[0].series[0].seriesInstanceUID).toBe("__unknown__");
	});

	it("sorts series by SeriesNumber", () => {
		const files = [
			makeFile({
				studyInstanceUID: "study-1",
				seriesInstanceUID: "s3",
				tags: { SeriesNumber: "3" },
			}),
			makeFile({
				studyInstanceUID: "study-1",
				seriesInstanceUID: "s1",
				tags: { SeriesNumber: "1" },
			}),
			makeFile({
				studyInstanceUID: "study-1",
				seriesInstanceUID: "s2",
				tags: { SeriesNumber: "2" },
			}),
		];

		const result = groupByStudySeries(files);
		expect(result[0].series[0].seriesNumber).toBe(1);
		expect(result[0].series[1].seriesNumber).toBe(2);
		expect(result[0].series[2].seriesNumber).toBe(3);
	});

	it("sorts files within series by instanceNumber", () => {
		const files = [
			makeFile({
				studyInstanceUID: "study-1",
				seriesInstanceUID: "s1",
				instanceNumber: 3,
				imageId: "img3",
			}),
			makeFile({
				studyInstanceUID: "study-1",
				seriesInstanceUID: "s1",
				instanceNumber: 1,
				imageId: "img1",
			}),
			makeFile({
				studyInstanceUID: "study-1",
				seriesInstanceUID: "s1",
				instanceNumber: 2,
				imageId: "img2",
			}),
		];

		const result = groupByStudySeries(files);
		const seriesFiles = result[0].series[0].files;
		expect(seriesFiles[0].instanceNumber).toBe(1);
		expect(seriesFiles[1].instanceNumber).toBe(2);
		expect(seriesFiles[2].instanceNumber).toBe(3);
	});

	it("places series with null seriesNumber last (using 999 as default)", () => {
		const files = [
			makeFile({
				studyInstanceUID: "study-1",
				seriesInstanceUID: "s-no-num",
				tags: {},
			}),
			makeFile({
				studyInstanceUID: "study-1",
				seriesInstanceUID: "s-num",
				tags: { SeriesNumber: "1" },
			}),
		];

		const result = groupByStudySeries(files);
		expect(result[0].series[0].seriesNumber).toBe(1);
		expect(result[0].series[1].seriesNumber).toBeNull();
	});

	it("populates study metadata from file tags", () => {
		const files = [
			makeFile({
				studyInstanceUID: "study-1",
				seriesInstanceUID: "s1",
				tags: {
					StudyDate: "20240315",
					StudyDescription: "Chest X-Ray",
					PatientName: "TestHorse",
				},
			}),
		];

		const result = groupByStudySeries(files);
		expect(result[0].studyDate).toBe("20240315");
		expect(result[0].studyDescription).toBe("Chest X-Ray");
		expect(result[0].patientName).toBe("TestHorse");
	});

	it("populates series metadata from file tags", () => {
		const files = [
			makeFile({
				studyInstanceUID: "study-1",
				seriesInstanceUID: "s1",
				tags: {
					SeriesDescription: "AP View",
					Modality: "CR",
					SeriesNumber: "5",
				},
			}),
		];

		const result = groupByStudySeries(files);
		const series = result[0].series[0];
		expect(series.seriesDescription).toBe("AP View");
		expect(series.modality).toBe("CR");
		expect(series.seriesNumber).toBe(5);
	});
});

// ---------------------------------------------------------------------------
// getAllSeries
// ---------------------------------------------------------------------------
describe("getAllSeries", () => {
	it("returns empty array for empty studies", () => {
		expect(getAllSeries([])).toEqual([]);
	});

	it("returns flat list of all series across studies", () => {
		const files = [
			makeFile({
				studyInstanceUID: "study-1",
				seriesInstanceUID: "s1",
				tags: { SeriesNumber: "1" },
			}),
			makeFile({
				studyInstanceUID: "study-1",
				seriesInstanceUID: "s2",
				tags: { SeriesNumber: "2" },
			}),
			makeFile({
				studyInstanceUID: "study-2",
				seriesInstanceUID: "s3",
				tags: { SeriesNumber: "1" },
			}),
		];

		const studies = groupByStudySeries(files);
		const allSeries = getAllSeries(studies);
		expect(allSeries).toHaveLength(3);
	});
});
