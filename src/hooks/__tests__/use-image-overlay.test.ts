// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { DicomFileInfo } from "@/types/dicom";
import { useImageOverlay } from "../use-image-overlay";

function makeFileInfo(overrides: Partial<DicomFileInfo> = {}): DicomFileInfo {
	return {
		imageId: "test",
		filePath: "/tmp/test.dcm",
		fileName: "test.dcm",
		frameIndex: 0,
		totalFrames: 1,
		rows: 512,
		columns: 256,
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

describe("useImageOverlay", () => {
	it("returns empty overlay when fileInfo is null", () => {
		const { result } = renderHook(() => useImageOverlay(null));
		expect(result.current.topLeft).toEqual([]);
		expect(result.current.topRight).toEqual([]);
		expect(result.current.bottomLeft).toEqual([]);
		expect(result.current.bottomRight).toEqual([]);
	});

	it("populates topLeft with patient info tags", () => {
		const fileInfo = makeFileInfo({
			tags: {
				PatientName: "TestHorse",
				PatientID: "H001",
			},
		});

		const { result } = renderHook(() => useImageOverlay(fileInfo));
		const names = result.current.topLeft.map((i) => i.id);
		expect(names).toContain("patientName");
		expect(names).toContain("patientId");

		const nameItem = result.current.topLeft.find((i) => i.id === "patientName");
		expect(nameItem?.value).toBe("TestHorse");
	});

	it("populates topRight with study info tags", () => {
		const fileInfo = makeFileInfo({
			tags: {
				InstitutionName: "VetClinic",
				Modality: "CR",
				StudyDate: "20240315",
			},
		});

		const { result } = renderHook(() => useImageOverlay(fileInfo));
		const ids = result.current.topRight.map((i) => i.id);
		expect(ids).toContain("institutionName");
		expect(ids).toContain("modality");
		expect(ids).toContain("studyDate");
	});

	it("formats date values using format function", () => {
		const fileInfo = makeFileInfo({
			tags: { StudyDate: "20240315" },
		});

		const { result } = renderHook(() => useImageOverlay(fileInfo));
		const dateItem = result.current.topRight.find((i) => i.id === "studyDate");
		expect(dateItem?.value).toBe("2024/03/15");
	});

	it("formats time values using format function", () => {
		const fileInfo = makeFileInfo({
			tags: { StudyTime: "143022.500" },
		});

		const { result } = renderHook(() => useImageOverlay(fileInfo));
		const timeItem = result.current.topRight.find((i) => i.id === "studyTime");
		expect(timeItem?.value).toBe("14:30:22");
	});

	it("generates computed _imageSize tag", () => {
		const fileInfo = makeFileInfo({
			rows: 512,
			columns: 256,
		});

		const { result } = renderHook(() => useImageOverlay(fileInfo));
		const sizeItem = result.current.bottomRight.find(
			(i) => i.id === "imageSize",
		);
		expect(sizeItem).toBeDefined();
		expect(sizeItem?.value).toBe("512 × 256");
	});

	it("generates computed _bitsInfo tag", () => {
		const fileInfo = makeFileInfo({
			bitsAllocated: 16,
			bitsStored: 12,
		});

		const { result } = renderHook(() => useImageOverlay(fileInfo));
		const bitsItem = result.current.bottomRight.find(
			(i) => i.id === "bitsInfo",
		);
		expect(bitsItem).toBeDefined();
		expect(bitsItem?.value).toBe("16bit (stored: 12)");
	});

	it("uses dynamic WW/WC values when provided", () => {
		const fileInfo = makeFileInfo({
			windowWidth: 400,
			windowCenter: 40,
		});

		const { result } = renderHook(() => useImageOverlay(fileInfo, 800, 200));

		const wwItem = result.current.bottomRight.find(
			(i) => i.id === "windowWidth",
		);
		const wcItem = result.current.bottomRight.find(
			(i) => i.id === "windowCenter",
		);
		expect(wwItem?.value).toBe("800");
		expect(wcItem?.value).toBe("200");
	});

	it("falls back to fileInfo WW/WC when dynamic values not provided", () => {
		const fileInfo = makeFileInfo({
			windowWidth: 400,
			windowCenter: 40,
		});

		const { result } = renderHook(() => useImageOverlay(fileInfo));

		const wwItem = result.current.bottomRight.find(
			(i) => i.id === "windowWidth",
		);
		const wcItem = result.current.bottomRight.find(
			(i) => i.id === "windowCenter",
		);
		expect(wwItem?.value).toBe("400");
		expect(wcItem?.value).toBe("40");
	});

	it("skips tags with no raw value in fileInfo.tags", () => {
		const fileInfo = makeFileInfo({
			tags: { PatientName: "Horse" },
		});

		const { result } = renderHook(() => useImageOverlay(fileInfo));

		// PatientID should not be in topLeft since it's not in tags
		const patientIdItem = result.current.topLeft.find(
			(i) => i.id === "patientId",
		);
		expect(patientIdItem).toBeUndefined();
	});

	it("populates bottomLeft with equipment/technique tags", () => {
		const fileInfo = makeFileInfo({
			tags: {
				Manufacturer: "TestMfg",
				KVP: "60",
			},
		});

		const { result } = renderHook(() => useImageOverlay(fileInfo));
		const ids = result.current.bottomLeft.map((i) => i.id);
		expect(ids).toContain("manufacturer");
		expect(ids).toContain("kvp");
	});
});
