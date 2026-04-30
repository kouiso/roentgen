// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { DicomFileInfo } from "@/types/dicom";
import { useCornerstone } from "../use-cornerstone";

const cornerstoneMock = vi.hoisted(() => ({
	loadImage: vi.fn(),
	registerImageLoader: vi.fn(),
	renderToCanvas: vi.fn(),
}));

vi.mock("cornerstone-core", () => ({
	default: cornerstoneMock,
}));

vi.mock("cornerstone-wado-image-loader", () => ({
	default: {
		external: {},
		configure: vi.fn(),
	},
}));

vi.mock("dicom-parser", () => ({
	default: {
		parseDicom: vi.fn(),
	},
	parseDicom: vi.fn(),
}));

const makeFileInfo = (
	windowWidth: number,
	windowCenter: number,
): DicomFileInfo => ({
	imageId: "roentgen:/test/wide-window.dcm",
	filePath: "/test/wide-window.dcm",
	fileName: "wide-window.dcm",
	frameIndex: 0,
	totalFrames: 1,
	rows: 2,
	columns: 2,
	bitsAllocated: 16,
	bitsStored: 12,
	highBit: 11,
	pixelRepresentation: 0,
	samplesPerPixel: 1,
	photometricInterpretation: "MONOCHROME2",
	rescaleIntercept: 0,
	rescaleSlope: 1,
	windowCenter,
	windowWidth,
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
});

describe("useCornerstone", () => {
	it("preserves explicit DICOM WW/WC tags even when they span most of the pixel range", async () => {
		cornerstoneMock.loadImage.mockResolvedValue({
			imageId: "roentgen:/test/wide-window.dcm",
			rows: 2,
			columns: 2,
			width: 2,
			height: 2,
			getPixelData: () => new Uint16Array([100, 100, 100, 100]),
			windowCenter: 2047.5,
			windowWidth: 4095,
			slope: 1,
			intercept: 0,
			invert: false,
			minPixelValue: 0,
			maxPixelValue: 4095,
		});

		const { result } = renderHook(() => useCornerstone());

		await waitFor(() => {
			expect(result.current.cornerstoneReady).toBe(true);
		});

		await act(async () => {
			await result.current.loadAndDisplayImage(makeFileInfo(4095, 2047.5));
		});

		expect(result.current.worldInfo.windowWidth).toBe(4095);
		expect(result.current.worldInfo.windowCenter).toBe(2047.5);
	});
});
