// @vitest-environment happy-dom
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DicomFileInfo } from "@/types/dicom";
import {
	disposeCornerstoneHmrState,
	getSharedImageDataMapSize,
	type OSDTileEvent,
	type OSDViewer,
	useCornerstone,
} from "../use-cornerstone";

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

const makeFileInfo = (photometricInterpretation: string): DicomFileInfo => ({
	imageId: `roentgen:/tmp/${photometricInterpretation}.dcm`,
	filePath: `/tmp/${photometricInterpretation}.dcm`,
	fileName: `${photometricInterpretation}.dcm`,
	frameIndex: 0,
	totalFrames: 1,
	rows: 1,
	columns: 1,
	bitsAllocated: 8,
	bitsStored: 8,
	highBit: 7,
	pixelRepresentation: 0,
	samplesPerPixel: 1,
	photometricInterpretation,
	rescaleIntercept: 0,
	rescaleSlope: 1,
	windowCenter: 128,
	windowWidth: 256,
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
	overlayData: [
		{
			groupNumber: 0x6000,
			rows: 1,
			columns: 1,
			originRow: 1,
			originCol: 1,
			bitsAllocated: 1,
			bitPosition: 0,
			data: new Uint8Array([1]),
		},
	],
	tags: {},
	thumbnailData: null,
});

const makeImage = (imageId: string) => ({
	imageId,
	rows: 1,
	columns: 1,
	width: 1,
	height: 1,
	getPixelData: () => new Uint8Array([128]),
	windowCenter: 128,
	windowWidth: 256,
	slope: 1,
	intercept: 0,
	invert: false,
	minPixelValue: 0,
	maxPixelValue: 255,
});

const makeViewer = (handlerRef: {
	current: ((event: OSDTileEvent) => void) | null;
}): OSDViewer => ({
	addHandler: (event, handler) => {
		if (event === "tile-drawing") {
			handlerRef.current = handler;
		}
	},
	removeAllHandlers: vi.fn(),
	world: { needsDraw: () => false },
	viewport: {
		getZoom: () => 1,
		zoomTo: vi.fn(),
		zoomBy: vi.fn(),
		panTo: vi.fn(),
		panBy: vi.fn(),
		fitBounds: vi.fn(),
		getHomeBounds: () => ({ x: 0, y: 0, width: 1, height: 1 }),
		getCenter: () => ({ x: 0, y: 0 }),
	},
	addTiledImage: vi.fn(),
	forceRedraw: vi.fn(),
	imageLoader: { clear: vi.fn() },
	destroy: vi.fn(),
});

const renderOverlayPixel = async (photometricInterpretation: string) => {
	const fileInfo = makeFileInfo(photometricInterpretation);
	cornerstoneMock.loadImage.mockResolvedValue(makeImage(fileInfo.imageId));
	const imageData = { data: new Uint8ClampedArray(4) };
	const context = {
		getImageData: vi.fn(() => imageData),
		putImageData: vi.fn(),
	};
	const canvas = document.createElement("canvas");
	Object.defineProperty(canvas, "getContext", {
		configurable: true,
		value: (contextId: string) => (contextId === "2d" ? context : null),
	});
	const handlerRef: { current: ((event: OSDTileEvent) => void) | null } = {
		current: null,
	};
	const viewer = makeViewer(handlerRef);
	const { result } = renderHook(() => useCornerstone());

	await waitFor(() => {
		expect(result.current.cornerstoneReady).toBe(true);
	});

	await act(async () => {
		await result.current.loadAndDisplayImage(fileInfo);
	});

	act(() => {
		result.current.setupTileDrawingBridge(viewer);
	});

	const handler = handlerRef.current;
	if (!handler) {
		throw new Error("tile-drawing handler was not registered");
	}

	act(() => {
		handler({ rendered: { canvas } });
	});

	return imageData.data;
};

describe("useCornerstone Wave 4 polish", () => {
	beforeEach(() => {
		cornerstoneMock.loadImage.mockReset();
		cornerstoneMock.renderToCanvas.mockReset();
		cornerstoneMock.registerImageLoader.mockReset();
		disposeCornerstoneHmrState();
	});

	it("M6: draws MONOCHROME1 overlays with a dark visible color", async () => {
		const data = await renderOverlayPixel("MONOCHROME1");

		expect([data[0], data[1], data[2], data[3]]).toEqual([0, 0, 0, 180]);
	});

	it("M6: draws MONOCHROME2 overlays with a light visible color", async () => {
		const data = await renderOverlayPixel("MONOCHROME2");

		expect([data[0], data[1], data[2], data[3]]).toEqual([255, 255, 255, 180]);
	});

	it("S3: clears shared image data when the HMR dispose handler runs", () => {
		const { result } = renderHook(() => useCornerstone());

		act(() => {
			result.current.registerImageData("/tmp/hmr.dcm", new ArrayBuffer(1));
		});

		expect(getSharedImageDataMapSize()).toBe(1);

		disposeCornerstoneHmrState();

		expect(getSharedImageDataMapSize()).toBe(0);
	});
});
