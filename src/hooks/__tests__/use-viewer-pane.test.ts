// @vitest-environment happy-dom
import { act, fireEvent, renderHook, waitFor } from "@testing-library/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DicomFileInfo } from "@/types/dicom";
import { useViewerPane } from "../use-viewer-pane";

const loadAndDisplayImageMock = vi.hoisted(() => vi.fn());
const setupTileDrawingBridgeMock = vi.hoisted(() => vi.fn());
const useMouseInteractionMock = vi.hoisted(() => vi.fn());
const calculateImageDirectionMock = vi.hoisted(() => vi.fn(() => null));

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
			const getViewport = useCallback(() => viewport, [viewport]);
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
				getViewport,
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
	useMouseInteraction: useMouseInteractionMock,
}));

vi.mock("@/utils/image-direction", () => ({
	calculateImageDirection: calculateImageDirectionMock,
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
		useMouseInteractionMock.mockClear();
		calculateImageDirectionMock.mockClear();
	});

	afterEach(() => {
		document.body.innerHTML = "";
	});

	it("BUG-1: passes current WW to mouse interaction scaling", async () => {
		const file = makeFileInfo("roentgen:/test/ww.dcm");
		renderHook(() => useViewerPane("pane-0", [file]));

		await waitFor(() => {
			expect(useMouseInteractionMock).toHaveBeenCalled();
		});

		expect(useMouseInteractionMock).toHaveBeenLastCalledWith(
			expect.objectContaining({
				currentWindowWidth: 400,
			}),
		);
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

	it("方向マーカーの種別は馬をデフォルトにして切替できる", () => {
		const file = makeFileInfo("roentgen:/test/species.dcm");
		file.imageOrientationPatient = [1, 0, 0, 0, 1, 0];

		const { result } = renderHook(() => useViewerPane("pane-0", [file]));

		expect(result.current.species).toBe("equine");
		expect(calculateImageDirectionMock).toHaveBeenLastCalledWith(
			file.imageOrientationPatient,
			"equine",
		);

		act(() => {
			result.current.controlPanelProps.onToggleSpecies();
		});

		expect(result.current.species).toBe("human");
		expect(calculateImageDirectionMock).toHaveBeenLastCalledWith(
			file.imageOrientationPatient,
			"human",
		);
	});

	it("freehand annotation mode records pointer drag without re-enabling mouse pan/zoom", async () => {
		const file = makeFileInfo("roentgen:/test/freehand.dcm");
		file.rows = 100;
		file.columns = 100;
		const container = document.createElement("div");
		container.id = "osd-pane-0";
		Object.defineProperty(container, "getBoundingClientRect", {
			value: () => DOMRect.fromRect({ x: 0, y: 0, width: 200, height: 200 }),
		});
		container.setPointerCapture = vi.fn();
		container.releasePointerCapture = vi.fn();
		document.body.appendChild(container);

		const { result } = renderHook(() => useViewerPane("pane-0", [file]));

		await waitFor(() => {
			expect(result.current.isOsdReady).toBe(true);
		});

		act(() => {
			result.current.controlPanelProps.onStartFreehandTool();
		});

		await waitFor(() => {
			expect(result.current.activeAnnotationTool).toBe("freehand");
		});
		expect(useMouseInteractionMock).toHaveBeenLastCalledWith(
			expect.objectContaining({ enabled: false }),
		);

		fireEvent.pointerDown(container, {
			button: 0,
			clientX: 100,
			clientY: 100,
			isPrimary: true,
			pointerId: 7,
		});
		await waitFor(() => {
			expect(result.current.activeAnnotationPoints).toEqual([{ x: 0, y: 0 }]);
		});
		fireEvent.pointerMove(container, {
			clientX: 120,
			clientY: 110,
			pointerId: 7,
		});
		await waitFor(() => {
			expect(result.current.activeAnnotationPoints).toHaveLength(2);
		});
		fireEvent.pointerMove(container, {
			clientX: 150,
			clientY: 130,
			pointerId: 7,
		});
		await waitFor(() => {
			expect(result.current.activeAnnotationPoints).toHaveLength(3);
		});
		fireEvent.pointerUp(container, {
			clientX: 170,
			clientY: 140,
			pointerId: 7,
		});

		await waitFor(() => {
			expect(result.current.allAnnotations).toHaveLength(1);
		});
		const annotation = result.current.allAnnotations[0];
		expect(annotation.type).toBe("freehand");
		if (annotation.type === "freehand") {
			expect(annotation.sopInstanceUid).toBe("roentgen:/test/freehand.dcm");
			expect(annotation.points).toHaveLength(4);
			expect(annotation.points[0]).toEqual({ x: 0, y: 0 });
			expect(annotation.points[1]?.x).toBeCloseTo(10);
			expect(annotation.points[1]?.y).toBeCloseTo(5);
			expect(annotation.points[2]?.x).toBeCloseTo(25);
			expect(annotation.points[2]?.y).toBeCloseTo(15);
			expect(annotation.points[3]?.x).toBeCloseTo(35);
			expect(annotation.points[3]?.y).toBeCloseTo(20);
		}
		expect(result.current.activeAnnotationPoints).toEqual([]);
		expect(container.setPointerCapture).toHaveBeenCalledWith(7);
		expect(container.releasePointerCapture).toHaveBeenCalledWith(7);
	});
});
