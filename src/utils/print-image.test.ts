import { describe, expect, it } from "vitest";
import type { DicomFileInfo } from "@/types/dicom";
import {
	buildPrintImageMetadata,
	createPrintImageHtml,
	formatDicomDateForPrint,
	formatDicomPersonNameForPrint,
} from "./print-image";

const makeFileInfo = (tags: Record<string, string> = {}): DicomFileInfo => ({
	imageId: "test",
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
	tags,
	thumbnailData: null,
});

describe("print-image utilities", () => {
	it("formats DICOM dates for print headers", () => {
		expect(formatDicomDateForPrint("20240315")).toBe("2024/03/15");
		expect(formatDicomDateForPrint("2024-03-15")).toBe("2024-03-15");
		expect(formatDicomDateForPrint(undefined)).toBe("未設定");
	});

	it("formats DICOM person names for print headers", () => {
		expect(formatDicomPersonNameForPrint("Yamada^Taro")).toBe("Yamada Taro");
		expect(formatDicomPersonNameForPrint("  Horse^^A  ")).toBe("Horse A");
		expect(formatDicomPersonNameForPrint("")).toBe("未設定");
	});

	it("builds print metadata from DICOM tags", () => {
		const metadata = buildPrintImageMetadata(
			makeFileInfo({
				PatientName: "Test^Horse",
				PatientID: "HORSE-001",
				StudyDate: "20240315",
				AccessionNumber: "ACC-123",
				Modality: "CR",
				StudyDescription: "LEFT FORELIMB",
				SeriesDescription: "LATERAL",
				InstanceNumber: "7",
			}),
		);

		expect(metadata).toEqual({
			patientName: "Test Horse",
			patientId: "HORSE-001",
			studyDate: "2024/03/15",
			accessionNumber: "ACC-123",
			modality: "CR",
			description: "LEFT FORELIMB / LATERAL",
			instanceNumber: "7",
		});
	});

	it("falls back to DicomFileInfo instance number for print metadata", () => {
		const metadata = buildPrintImageMetadata({
			...makeFileInfo({
				PatientName: "Fallback^Instance",
			}),
			instanceNumber: 12,
		});

		expect(metadata.instanceNumber).toBe("12");
	});

	it("uses fallback values when DICOM tags are missing", () => {
		expect(buildPrintImageMetadata(null)).toEqual({
			patientName: "未設定",
			patientId: "未設定",
			studyDate: "未設定",
			accessionNumber: "未設定",
			modality: "未設定",
			description: "未設定",
			instanceNumber: "未設定",
		});
	});

	it("escapes metadata in generated print HTML", () => {
		const html = createPrintImageHtml("data:image/png;base64,AAAA", {
			patientName: "<script>alert(1)</script>",
			patientId: "ID<&>",
			studyDate: "2024/03/15",
			accessionNumber: "ACC-001",
			modality: "CR",
			description: 'A&B "test"',
			instanceNumber: "1",
		});

		expect(html).toContain("data:image/png;base64,AAAA");
		expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
		expect(html).toContain("ID&lt;&amp;&gt;");
		expect(html).toContain("受付番号");
		expect(html).toContain("インスタンス");
		expect(html).toContain("A&amp;B &quot;test&quot;");
		expect(html).not.toContain("<script>alert(1)</script>");
	});
});
