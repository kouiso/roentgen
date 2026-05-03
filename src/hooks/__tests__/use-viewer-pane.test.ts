// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { useEffect, useMemo, useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DicomFileInfo } from "@/types/dicom";
import { useViewerPane } from "../use-viewer-pane";

const loadAndDisplayImageMock = vi.hoisted(() => vi.fn());
const setupTileDrawingBridgeMock = vi.hoisted(() => vi.fn());

vi.mock("../use-cornerstone", () => ({
	useCornerstone: () => ({
		cornerstoneReady: true,
		currentImage: null,
		worldInfo: {
			windowWidth: 400,
			windowCenter: 40,
			invert: false,
			rotation: 0,
			flipHorizontal: false,
			flipVertical: false,
		},
		setWorldInfo: vi.fn(),
		triggerRedraw: vi.fn(),
		loadAndDisplayImage: loadAndDisplayImageMock,
		setupTileDrawingBridge: setupTileDrawingBridgeMock,
		registerImageData: vi.fn(),
		unregisterImageData: vi.fn(),
		clearAllImageData: vi.fn(),
		preloadImage: vi.fn(),
	}),
}));

vi.mock("../use-open-sea-dragon", async () => {
	return {
		useOpenSeaDragon: ({
			onViewerCreated,
			onViewerDestroyed,
		}: {
			onViewerCreated?: (viewer: {
				removeAllHandlers: (event: string) => void;
				addHandler: (event: string, handler: () => void) => void;
				world: { needsDraw: () => boolean };
				viewport: {
					getZoom: () => number;
					zoomTo: (zoom: number) => void;
					zoomBy: (factor: number) => void;
					panTo: (point: { x: number; y: number }) => void;
					panBy: (delta: { x: number; y: number }) => void;
					fitBounds: (rect: {
						x: number;
						y: number;
						width: number;
						height: number;
					}) => void;
					getHomeBounds: () => {
						x: number;
						y: number;
						width: number;
						height: number;
					};
					getCenter: () => { x: number; y: number };
				};
				addTiledImage: (options: { tileSource: unknown }) => void;
				forceRedraw: () => void;
				imageLoader: { clear: () => void };
				destroy: () => void;
			}) => void;
			onViewerDestroyed?: () => void;
		}) => {
			const viewport = useMemo(
				() => ({
					getZoom: () => 1,
					zoomTo: vi.fn(),
					zoomBy: vi.fn(),
					panTo: vi.fn(),
					panBy: vi.fn(),
					fitBounds: vi.fn(),
					getHomeBounds: () => ({ x: 0, y: 0, width: 1, height: 1 }),
					getCenter: () => ({ x: 0, y: 0 }),
				}),
				[],
			);
			useEffect(() => {
				onViewerCreated?.({
					removeAllHandlers: vi.fn(),
					addHandler: vi.fn(),
					world: { needsDraw: () => false },
					viewport,
					addTiledImage: vi.fn(),
					forceRedraw: vi.fn(),
					imageLoader: { clear: vi.fn() },
					destroy: vi.fn(),
				});
				return () => onViewerDestroyed?.();
			}, [onViewerCreated, onViewerDestroyed, viewport]);

			return {
				initViewer: vi.fn(),
				getViewport: () => viewport,
				tileReady: true,
				tileCanvasRef: { current: null },
			};
		},
	};
});

vi.mock("../use-viewer-slider", () => ({
	useViewerSlider: () => {
		const [currentFrame, setFrame] = useState(0);
		return {
			sliderState: { currentFrame, maxFrame: 0 },
			setFrame,
			setMaxFrame: vi.fn(),
			nextFrame: vi.fn(),
			prevFrame: vi.fn(),
		};
	},
}));

vi.mock("../use-image-overlay", () => ({
	useImageOverlay: () => [],
}));

vi.mock("../use-viewer-controls", () => ({
	useViewerControls: () => ({
		adjustWwWc: vi.fn(),
		zoomBy: vi.fn(),
		panBy: vi.fn(),
		resetImage: vi.fn(),
		fitSize: vi.fn(),
		oneToOneSize: vi.fn(),
		toggleInvert: vi.fn(),
		rotate: vi.fn(),
		toggleFlipHorizontal: vi.fn(),
		toggleFlipVertical: vi.fn(),
		setWwWc: vi.fn(),
	}),
}));

vi.mock("../use-cine-mode", () => ({
	useCineMode: () => ({
		isPlaying: false,
		fps: 10,
		togglePlay: vi.fn(),
		increaseFps: vi.fn(),
		decreaseFps: vi.fn(),
	}),
}));

vi.mock("../use-measurement", () => ({
	useMeasurement: () => ({
		activeTool: null,
		startDistanceTool: vi.fn(),
		startAngleTool: vi.fn(),
		cancelTool: vi.fn(),
		addPoint: vi.fn(),
		clearAll: vi.fn(),
		measurements: [],
		activePoints: [],
		removeMeasurement: vi.fn(),
	}),
}));

vi.mock("../use-mouse-interaction", () => ({
	useMouseInteraction: vi.fn(),
}));

vi.mock("@/utils/image-direction", () => ({
	calculateImageDirection: () => null,
}));

const makeFileInfo = (imageId: string): DicomFileInfo => ({
	imageId,
	filePath: imageId.replace("roentgen:", ""),
	fileName: imageId.split("/").pop() ?? imageId,
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
});

describe("useViewerPane", () => {
	beforeEach(() => {
		loadAndDisplayImageMock.mockClear();
		setupTileDrawingBridgeMock.mockClear();
	});

	it("H2: aborts stale image loads when the current file changes", async () => {
		loadAndDisplayImageMock.mockResolvedValue(undefined);
		const firstFile = makeFileInfo("roentgen:/test/old.dcm");
		const secondFile = makeFileInfo("roentgen:/test/new.dcm");

		const { rerender } = renderHook(
			({ files }) => useViewerPane("pane-0", files),
			{ initialProps: { files: [firstFile] } },
		);

		await waitFor(() => {
			expect(loadAndDisplayImageMock).toHaveBeenCalledTimes(1);
		});
		const firstOptions = loadAndDisplayImageMock.mock.calls[0]?.[1];
		expect(firstOptions?.signal).toBeInstanceOf(AbortSignal);
		expect(firstOptions.signal.aborted).toBe(false);

		act(() => {
			rerender({ files: [secondFile] });
		});

		await waitFor(() => {
			expect(loadAndDisplayImageMock).toHaveBeenCalledTimes(2);
		});

		const secondOptions = loadAndDisplayImageMock.mock.calls[1]?.[1];
		expect(firstOptions.signal.aborted).toBe(true);
		expect(secondOptions?.signal).toBeInstanceOf(AbortSignal);
		expect(secondOptions.signal.aborted).toBe(false);
		expect(loadAndDisplayImageMock.mock.calls[1]?.[0]).toBe(secondFile);
	});

	it("R7: aborts the active load when the pane unmounts", async () => {
		loadAndDisplayImageMock.mockResolvedValue(undefined);
		const file = makeFileInfo("roentgen:/test/unmount.dcm");

		const { unmount } = renderHook(() => useViewerPane("pane-0", [file]));

		await waitFor(() => {
			expect(loadAndDisplayImageMock).toHaveBeenCalledTimes(1);
		});
		const options = loadAndDisplayImageMock.mock.calls[0]?.[1];
		expect(options?.signal).toBeInstanceOf(AbortSignal);
		expect(options.signal.aborted).toBe(false);

		act(() => {
			unmount();
		});

		expect(options.signal.aborted).toBe(true);
	});
});
