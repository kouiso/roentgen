// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { DicomFileInfo } from "@/types/dicom";
import { ENCAPSULATED_TRANSFER_SYNTAX_UIDS } from "@/utils/dicom-parser";
import { releaseImage, useCornerstone } from "../use-cornerstone";

const cornerstoneMock = vi.hoisted(() => ({
	loadImage: vi.fn(),
	registerImageLoader: vi.fn(),
	renderToCanvas: vi.fn(),
	imageLoader: {
		purge: vi.fn(),
	},
	imageCache: {
		getImageLoadObject: vi.fn(),
		removeImageLoadObject: vi.fn(),
	},
}));
const wadoMock = vi.hoisted(() => ({
	external: {},
	configure: vi.fn(),
	webWorkerManager: {
		initialize: vi.fn(),
		terminate: vi.fn(),
	},
	wadouri: {
		fileManager: {
			add: vi.fn(() => "dicomfile:0"),
			remove: vi.fn(),
			purge: vi.fn(),
		},
		dataSetCacheManager: {
			unload: vi.fn(),
			purge: vi.fn(),
		},
	},
}));

vi.mock("cornerstone-core", () => ({
	default: cornerstoneMock,
}));

vi.mock("cornerstone-wado-image-loader", () => ({
	default: wadoMock,
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

	it.each(
		ENCAPSULATED_TRANSFER_SYNTAX_UIDS,
	)("loads encapsulated transfer syntax %s through WADO dicomfile", async (transferSyntaxUid) => {
		const image = {
			imageId: "dicomfile:0",
			rows: 2,
			columns: 2,
			width: 2,
			height: 2,
			getPixelData: () => new Uint16Array([100, 100, 100, 100]),
			windowCenter: 128,
			windowWidth: 256,
			slope: 1,
			intercept: 0,
			invert: false,
			minPixelValue: 0,
			maxPixelValue: 255,
		};
		cornerstoneMock.loadImage.mockResolvedValue(image);
		wadoMock.wadouri.fileManager.add.mockReturnValue(
			`dicomfile:${ENCAPSULATED_TRANSFER_SYNTAX_UIDS.indexOf(transferSyntaxUid)}`,
		);

		const { result } = renderHook(() => useCornerstone());

		await waitFor(() => {
			expect(result.current.cornerstoneReady).toBe(true);
		});

		const data = new ArrayBuffer(16);
		const fileInfo = makeFileInfo(256, 128);
		fileInfo.filePath = `/test/${transferSyntaxUid}.dcm`;
		fileInfo.imageId = `roentgen:${fileInfo.filePath}`;
		fileInfo.tags.TransferSyntaxUID = transferSyntaxUid;

		act(() => {
			result.current.registerImageData(fileInfo.filePath, data);
		});
		await act(async () => {
			await result.current.loadAndDisplayImage(fileInfo);
		});

		expect(wadoMock.webWorkerManager.initialize).toHaveBeenCalledWith(
			expect.objectContaining({
				startWebWorkersOnDemand: true,
				taskConfiguration: {
					decodeTask: expect.objectContaining({
						codecsPath: "/cornerstone-wado/cornerstoneWADOImageLoader.min.js",
						initializeCodecsOnStartup: false,
					}),
				},
			}),
		);
		expect(wadoMock.wadouri.fileManager.add).toHaveBeenCalledWith(
			expect.any(Blob),
		);
		expect(cornerstoneMock.loadImage).toHaveBeenLastCalledWith(
			`dicomfile:${ENCAPSULATED_TRANSFER_SYNTAX_UIDS.indexOf(transferSyntaxUid)}`,
		);
	});

	it("removes image load objects only when cornerstone cache contains the imageId", async () => {
		cornerstoneMock.imageCache.getImageLoadObject.mockImplementation(
			(imageId: string) =>
				imageId === "roentgen:/test/cached.dcm" ? { imageId } : undefined,
		);
		cornerstoneMock.imageCache.removeImageLoadObject.mockClear();

		const { result } = renderHook(() => useCornerstone());

		await waitFor(() => {
			expect(result.current.cornerstoneReady).toBe(true);
		});

		act(() => {
			result.current.registerImageData(
				"/test/not-cached.dcm",
				new ArrayBuffer(1),
			);
			result.current.registerImageData("/test/cached.dcm", new ArrayBuffer(1));
		});

		expect(() => releaseImage("roentgen:/test/not-cached.dcm")).not.toThrow();
		expect(
			cornerstoneMock.imageCache.removeImageLoadObject,
		).not.toHaveBeenCalledWith("roentgen:/test/not-cached.dcm");

		expect(() => releaseImage("roentgen:/test/cached.dcm")).not.toThrow();
		expect(
			cornerstoneMock.imageCache.removeImageLoadObject,
		).toHaveBeenCalledWith("roentgen:/test/cached.dcm");
	});
});
