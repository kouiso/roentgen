// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import * as dicomParser from "dicom-parser";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WW_WC_PRESETS } from "@/constants/ww-wc-presets";
import { disposeCornerstoneHmrState } from "@/hooks/use-cornerstone";
import {
	createDicomParseWorkerPool,
	useDicomLoader,
} from "@/hooks/use-dicom-loader";
import { useKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts";
import { useViewerControls } from "@/hooks/use-viewer-controls";
import { useViewerSlider } from "@/hooks/use-viewer-slider";
import type { DicomFileInfo } from "@/types/dicom";
import {
	buildDicomFileInfo,
	UnsupportedTransferSyntaxError,
} from "@/utils/dicom-parser";
import {
	applyViewportTransform,
	calculateDistanceMm,
} from "@/utils/measurement-math";

const padEven = (bytes: Uint8Array, pad = 0x20): Uint8Array => {
	if (bytes.length % 2 === 0) return bytes;
	const out = new Uint8Array(bytes.length + 1);
	out.set(bytes);
	out[out.length - 1] = pad;
	return out;
};

const encodeString = (value: string, pad = 0x20): Uint8Array =>
	padEven(new TextEncoder().encode(value), pad);

const makeUs = (value: number): Uint8Array => {
	const out = new Uint8Array(2);
	new DataView(out.buffer).setUint16(0, value, true);
	return out;
};

const makeElement = (
	group: number,
	element: number,
	vr: string,
	data: Uint8Array,
): Uint8Array => {
	const isLongVr = ["OB", "OW", "OF", "SQ", "UT", "UN"].includes(vr);
	const headerLength = isLongVr ? 12 : 8;
	const out = new Uint8Array(headerLength + data.length);
	const view = new DataView(out.buffer);
	let offset = 0;
	view.setUint16(offset, group, true);
	offset += 2;
	view.setUint16(offset, element, true);
	offset += 2;
	out[offset] = vr.charCodeAt(0);
	out[offset + 1] = vr.charCodeAt(1);
	offset += 2;
	if (isLongVr) {
		offset += 2;
		view.setUint32(offset, data.length, true);
		offset += 4;
	} else {
		view.setUint16(offset, data.length, true);
		offset += 2;
	}
	out.set(data, offset);
	return out;
};

const concatBytes = (parts: Uint8Array[]): ArrayBuffer => {
	const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
	let offset = 0;
	for (const part of parts) {
		out.set(part, offset);
		offset += part.length;
	}
	return out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength);
};

const makeDicomBuffer = (
	options: { frames?: number; instance?: number } = {},
) => {
	const rows = 16;
	const columns = 16;
	const preamble = new Uint8Array(132);
	preamble[128] = 0x44;
	preamble[129] = 0x49;
	preamble[130] = 0x43;
	preamble[131] = 0x4d;
	return concatBytes([
		preamble,
		makeElement(0x0002, 0x0010, "UI", encodeString("1.2.840.10008.1.2.1", 0)),
		makeElement(0x0020, 0x000d, "UI", encodeString("1.2.horse.study", 0)),
		makeElement(0x0020, 0x000e, "UI", encodeString("1.2.horse.series", 0)),
		makeElement(
			0x0020,
			0x0013,
			"IS",
			encodeString(String(options.instance ?? 1)),
		),
		makeElement(
			0x0028,
			0x0008,
			"IS",
			encodeString(String(options.frames ?? 1)),
		),
		makeElement(0x0028, 0x0010, "US", makeUs(rows)),
		makeElement(0x0028, 0x0011, "US", makeUs(columns)),
		makeElement(0x0028, 0x0002, "US", makeUs(1)),
		makeElement(0x0028, 0x0004, "CS", encodeString("MONOCHROME2")),
		makeElement(0x0028, 0x0030, "DS", encodeString("0.2\\0.2")),
		makeElement(0x0028, 0x0100, "US", makeUs(16)),
		makeElement(0x0028, 0x0101, "US", makeUs(12)),
		makeElement(0x0028, 0x0102, "US", makeUs(11)),
		makeElement(0x0028, 0x0103, "US", makeUs(0)),
		makeElement(0x0028, 0x1050, "DS", encodeString("2048")),
		makeElement(0x0028, 0x1051, "DS", encodeString("4096")),
		makeElement(0x7fe0, 0x0010, "OW", new Uint8Array(rows * columns * 2)),
	]);
};

const parseInfo = (buffer: ArrayBuffer, name: string): DicomFileInfo => {
	const dataSet = dicomParser.parseDicom(new Uint8Array(buffer)) as Parameters<
		typeof buildDicomFileInfo
	>[0];
	return buildDicomFileInfo(
		dataSet,
		`roentgen:/scenario/${name}`,
		`/scenario/${name}`,
		name,
		buffer,
	);
};

const makeFileInfo = (path: string): DicomFileInfo => ({
	imageId: `roentgen:${path}`,
	filePath: path,
	fileName: path.split("/").pop() ?? path,
	frameIndex: 0,
	totalFrames: 1,
	rows: 16,
	columns: 16,
	bitsAllocated: 16,
	bitsStored: 12,
	highBit: 11,
	pixelRepresentation: 0,
	samplesPerPixel: 1,
	photometricInterpretation: "MONOCHROME2",
	rescaleIntercept: 0,
	rescaleSlope: 1,
	windowCenter: 2048,
	windowWidth: 4096,
	pixelSpacing: [0.2, 0.2],
	imageOrientationPatient: null,
	imagePositionPatient: null,
	sliceThickness: null,
	sliceLocation: null,
	instanceNumber: null,
	studyInstanceUID: "1.2.horse.study",
	seriesInstanceUID: "1.2.horse.series",
	modalityLutSequence: null,
	voiLutSequence: null,
	overlayData: [],
	tags: {},
	thumbnailData: null,
});

const fireKey = (key: string) => {
	window.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
};

afterEach(() => {
	vi.restoreAllMocks();
	disposeCornerstoneHmrState();
});

describe("Daily workflow scenarios", () => {
	it("opens a folder with mixed DICOM and non-DICOM files", async () => {
		const loader = renderHook(() => useDicomLoader());
		const jpg = new ArrayBuffer(256);

		await act(async () => {
			await loader.result.current.loadFiles([
				{ path: "/horse/photo.jpg", data: jpg },
				{
					path: "/horse/lateromedial.dcm",
					data: makeDicomBuffer({ instance: 2 }),
				},
				{
					path: "/horse/dorsopalmar.dcm",
					data: makeDicomBuffer({ instance: 1 }),
				},
			]);
		});

		expect(loader.result.current.loadState.status).toBe("loaded");
		expect(
			loader.result.current.dicomFiles.map((file) => file.fileName),
		).toEqual(["dorsopalmar.dcm", "lateromedial.dcm"]);
		if (loader.result.current.loadState.status === "loaded") {
			expect(loader.result.current.loadState.skipped[0]?.reason).toBe(
				"not-dicom",
			);
		}
	});

	it("opens a multi-frame DICOM and navigates to the last frame and back", () => {
		const info = parseInfo(makeDicomBuffer({ frames: 5 }), "multiframe.dcm");
		const slider = renderHook(() => useViewerSlider());

		act(() => slider.result.current.setMaxFrame(info.totalFrames - 1));
		act(() => slider.result.current.setFrame(info.totalFrames - 1));
		expect(slider.result.current.sliderState.currentFrame).toBe(4);

		act(() => slider.result.current.prevFrame());
		expect(slider.result.current.sliderState.currentFrame).toBe(3);
	});

	it("adjusts WW/WC and resets to the original DICOM values", () => {
		const initial = {
			windowWidth: 4096,
			windowCenter: 2048,
			zoom: 1,
			panX: 0,
			panY: 0,
			invert: false,
			rotation: 0,
			flipHorizontal: false,
			flipVertical: false,
		};
		let state = initial;
		const setWorldInfo = vi.fn((updater) => {
			state = typeof updater === "function" ? updater(state) : updater;
		});
		const controls = renderHook(() =>
			useViewerControls({ setWorldInfo, getViewport: () => null }),
		);

		act(() => controls.result.current.adjustWwWc(-500, 250));
		expect(state.windowWidth).toBe(3596);
		expect(state.windowCenter).toBe(2298);

		act(() =>
			controls.result.current.resetImage(
				initial.windowWidth,
				initial.windowCenter,
			),
		);
		expect(state.windowWidth).toBe(4096);
		expect(state.windowCenter).toBe(2048);
	});

	it("rotating 90 degrees preserves measured injury distance", () => {
		const p1 = { x: 10, y: 20 };
		const p2 = { x: 40, y: 80 };
		const center = { x: 50, y: 50 };
		const before = calculateDistanceMm(p1, p2, [0.2, 0.2]);
		const after = calculateDistanceMm(
			applyViewportTransform(p1, center, 90, false),
			applyViewportTransform(p2, center, 90, false),
			[0.2, 0.2],
		);

		expect(after).toBeCloseTo(before);
	});

	it("flipping horizontally preserves measured injury distance", () => {
		const p1 = { x: 10, y: 20 };
		const p2 = { x: 40, y: 80 };
		const center = { x: 50, y: 50 };
		const before = calculateDistanceMm(p1, p2, [0.2, 0.2]);
		const after = calculateDistanceMm(
			applyViewportTransform(p1, center, 0, true),
			applyViewportTransform(p2, center, 0, true),
			[0.2, 0.2],
		);

		expect(after).toBeCloseTo(before);
	});
});

describe("Error recovery scenarios", () => {
	it("keeps a valid DICOM viewable after a corrupt file load attempt", async () => {
		vi.spyOn(console, "error").mockImplementation(() => undefined);
		const loader = renderHook(() => useDicomLoader());

		await act(async () => {
			await loader.result.current.loadFiles([
				{ path: "/horse/valid.dcm", data: makeDicomBuffer() },
			]);
		});
		expect(loader.result.current.dicomFiles).toHaveLength(1);

		await act(async () => {
			await loader.result.current.loadFiles([
				{ path: "/horse/corrupt.dcm", data: makeDicomBuffer().slice(0, 140) },
			]);
		});

		expect(loader.result.current.loadState.status).toBe("error");
		expect(loader.result.current.dicomFiles[0]?.fileName).toBe("valid.dcm");
	});

	it("recovers the worker pool after a parse worker crash", async () => {
		const workers: TestWorker[] = [];
		let createCount = 0;
		const pool = createDicomParseWorkerPool(1, () => {
			createCount++;
			const worker =
				createCount === 1
					? TestWorker.crashing("worker crashed during parse")
					: TestWorker.success(makeFileInfo("/horse/recovered.dcm"));
			workers.push(worker);
			return worker;
		});

		await expect(
			pool.parse({ path: "/horse/crash.dcm", data: makeDicomBuffer() }),
		).rejects.toThrow("worker crashed during parse");

		const result = await pool.parse({
			path: "/horse/recovered.dcm",
			data: makeDicomBuffer(),
		});

		expect(result.fileInfo.fileName).toBe("recovered.dcm");
		expect(workers[0]?.isTerminated()).toBe(true);
		expect(createCount).toBe(2);
		pool.terminate();
	});

	it("unsupported transfer syntax from worker is reported as a typed error", async () => {
		const pool = createDicomParseWorkerPool(1, () =>
			TestWorker.unsupported("1.2.840.10008.1.2.4.100"),
		);

		await expect(
			pool.parse({ path: "/horse/mpeg.dcm", data: makeDicomBuffer() }),
		).rejects.toBeInstanceOf(UnsupportedTransferSyntaxError);

		pool.terminate();
	});
});

describe("Keyboard shortcut scenarios", () => {
	it.each([
		1, 2, 3, 4, 5, 6, 7,
	])("pressing %i applies the matching WW/WC preset", (keyNumber) => {
		let ww = 0;
		let wc = 0;
		const actions = makeActions({
			setWwWcPreset: (index) => {
				const preset = WW_WC_PRESETS[index];
				if (!preset) return;
				ww = preset.ww;
				wc = preset.wc;
			},
		});
		renderHook(() => useKeyboardShortcuts(actions, true));

		fireKey(String(keyNumber));

		const preset = WW_WC_PRESETS[keyNumber - 1];
		expect(ww).toBe(preset?.ww);
		expect(wc).toBe(preset?.wc);
	});

	it("pressing d activates the distance tool", () => {
		const actions = makeActions();
		renderHook(() => useKeyboardShortcuts(actions, true));
		fireKey("d");
		expect(actions.setModeMeasureDistance).toHaveBeenCalledOnce();
	});

	it("pressing a activates the angle tool", () => {
		const actions = makeActions();
		renderHook(() => useKeyboardShortcuts(actions, true));
		fireKey("a");
		expect(actions.setModeMeasureAngle).toHaveBeenCalledOnce();
	});

	it("pressing r applies reset", () => {
		const actions = makeActions();
		renderHook(() => useKeyboardShortcuts(actions, true));
		fireKey("r");
		expect(actions.resetImage).toHaveBeenCalledOnce();
	});

	it("pressing i toggles invert", () => {
		const actions = makeActions();
		renderHook(() => useKeyboardShortcuts(actions, true));
		fireKey("i");
		expect(actions.toggleInvert).toHaveBeenCalledOnce();
	});
});

const makeActions = (
	overrides: Partial<ReturnType<typeof baseActions>> = {},
): ReturnType<typeof baseActions> => ({ ...baseActions(), ...overrides });

const baseActions = () => ({
	nextFrame: vi.fn(),
	prevFrame: vi.fn(),
	setModeWwWc: vi.fn(),
	setModeZoom: vi.fn(),
	setModePan: vi.fn(),
	fitSize: vi.fn(),
	toggleInvert: vi.fn(),
	resetImage: vi.fn(),
	toggleCinePlay: vi.fn(),
	setWwWcPreset: vi.fn(),
	toggleFullscreen: vi.fn(),
	setModeMeasureDistance: vi.fn(),
	setModeMeasureAngle: vi.fn(),
	clearMeasurements: vi.fn(),
});

type WorkerRequest = {
	id: number;
	payload: {
		data: ArrayBuffer;
	};
};

type WorkerSuccessResponse = {
	id: number;
	type: "success";
	fileInfo: DicomFileInfo;
	rawData: ArrayBuffer;
};

type WorkerErrorResponse = {
	id: number;
	type: "error";
	error: {
		name: string;
		message: string;
		transferSyntaxUid?: string;
	};
};

type WorkerResponse = WorkerSuccessResponse | WorkerErrorResponse;
type WorkerListener = (event: MessageEvent<WorkerResponse>) => void;
type WorkerErrorListener = (event: ErrorEvent) => void;

class TestWorker {
	private messageListener: WorkerListener | null = null;
	private errorListener: WorkerErrorListener | null = null;
	private terminated = false;

	private constructor(
		private readonly respond: (
			message: WorkerRequest,
		) => WorkerResponse | Error,
	) {}

	static success(fileInfo: DicomFileInfo): TestWorker {
		return new TestWorker((message) => ({
			id: message.id,
			type: "success",
			fileInfo,
			rawData: message.payload.data,
		}));
	}

	static crashing(message: string): TestWorker {
		return new TestWorker(() => new Error(message));
	}

	static unsupported(uid: string): TestWorker {
		const error = new UnsupportedTransferSyntaxError(uid);
		return new TestWorker((message) => ({
			id: message.id,
			type: "error",
			error: {
				name: error.name,
				message: error.message,
				transferSyntaxUid: error.transferSyntaxUid,
			},
		}));
	}

	addEventListener(...args: ["message", WorkerListener]): void;
	addEventListener(...args: ["error", WorkerErrorListener]): void;
	addEventListener(
		...args: ["message", WorkerListener] | ["error", WorkerErrorListener]
	): void {
		const [eventName, listener] = args;
		if (eventName === "message") {
			this.messageListener = listener;
		} else {
			this.errorListener = listener;
		}
	}

	removeEventListener(eventName: "message", listener: WorkerListener): void {
		if (eventName === "message" && this.messageListener === listener) {
			this.messageListener = null;
		}
	}

	postMessage(message: WorkerRequest): void {
		queueMicrotask(() => {
			if (this.terminated) return;
			const response = this.respond(message);
			if (response instanceof Error) {
				this.errorListener?.(
					new ErrorEvent("error", { message: response.message }),
				);
				return;
			}
			this.messageListener?.(new MessageEvent("message", { data: response }));
		});
	}

	isTerminated(): boolean {
		return this.terminated;
	}

	terminate(): void {
		this.terminated = true;
		this.messageListener = null;
		this.errorListener = null;
	}
}
