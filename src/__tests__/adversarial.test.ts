// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import * as dicomParser from "dicom-parser";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useCineMode } from "@/hooks/use-cine-mode";
import {
	disposeCornerstoneHmrState,
	getSharedImageDataMapSize,
	releaseImage,
} from "@/hooks/use-cornerstone";
import {
	createDicomParseWorkerPool,
	getPrimaryLoadErrorMessage,
	useDicomLoader,
} from "@/hooks/use-dicom-loader";
import { useMeasurement } from "@/hooks/use-measurement";
import { useViewerControls } from "@/hooks/use-viewer-controls";
import { useViewerSlider } from "@/hooks/use-viewer-slider";
import {
	buildDicomFileInfo,
	parsePixelSpacing,
	UnsupportedTransferSyntaxError,
} from "@/utils/dicom-parser";
import {
	calculateAngleDeg,
	calculateDistanceMm,
	containerToImageCoord,
} from "@/utils/measurement-math";

type BuildDicomDataSet = Parameters<typeof buildDicomFileInfo>[0];
type DicomElement = BuildDicomDataSet["elements"][string];

type DataSetOptions = {
	strings?: Record<string, string>;
	uint16s?: Record<string, number>;
	floatStrings?: Record<string, number>;
	intStrings?: Record<string, number>;
	elements?: Record<string, DicomElement>;
	byteArray?: Uint8Array;
};

const makeDataSet = (opts: DataSetOptions = {}): BuildDicomDataSet => ({
	string: (tag) => opts.strings?.[tag],
	uint16: (tag) => opts.uint16s?.[tag],
	int16: () => undefined,
	int32: () => undefined,
	float: () => undefined,
	floatString: (tag) => opts.floatStrings?.[tag],
	intString: (tag) => opts.intStrings?.[tag],
	elements: opts.elements ?? {},
	byteArray: opts.byteArray ?? new Uint8Array(0),
});

const makeDicomMagicBuffer = (byteLength = 256): ArrayBuffer => {
	const buffer = new ArrayBuffer(byteLength);
	const view = new Uint8Array(buffer);
	if (byteLength >= 132) {
		view[128] = 0x44;
		view[129] = 0x49;
		view[130] = 0x43;
		view[131] = 0x4d;
	}
	return buffer;
};

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
	declaredLength = data.length,
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
		view.setUint32(offset, declaredLength, true);
		offset += 4;
	} else {
		view.setUint16(offset, declaredLength, true);
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

const makeExplicitDicomBuffer = ({
	rows = 2,
	columns = 2,
	pixelBytes = new Uint8Array(rows * columns * 2),
	declaredPixelLength = pixelBytes.length,
}: {
	rows?: number;
	columns?: number;
	pixelBytes?: Uint8Array;
	declaredPixelLength?: number;
} = {}): ArrayBuffer => {
	const preamble = new Uint8Array(132);
	preamble[128] = 0x44;
	preamble[129] = 0x49;
	preamble[130] = 0x43;
	preamble[131] = 0x4d;
	return concatBytes([
		preamble,
		makeElement(0x0002, 0x0010, "UI", encodeString("1.2.840.10008.1.2.1", 0)),
		makeElement(0x0028, 0x0010, "US", makeUs(rows)),
		makeElement(0x0028, 0x0011, "US", makeUs(columns)),
		makeElement(0x0028, 0x0002, "US", makeUs(1)),
		makeElement(0x0028, 0x0004, "CS", encodeString("MONOCHROME2")),
		makeElement(0x0028, 0x0100, "US", makeUs(16)),
		makeElement(0x0028, 0x0101, "US", makeUs(12)),
		makeElement(0x0028, 0x0102, "US", makeUs(11)),
		makeElement(0x0028, 0x0103, "US", makeUs(0)),
		makeElement(0x0028, 0x1050, "DS", encodeString("2048")),
		makeElement(0x0028, 0x1051, "DS", encodeString("4096")),
		makeElement(0x7fe0, 0x0010, "OW", pixelBytes, declaredPixelLength),
	]);
};

const makePixelBuffer = (
	rows: number,
	columns: number,
	bitsAllocated = 16,
): { buffer: ArrayBuffer; byteArray: Uint8Array; pixelOffset: number } => {
	const bytesPerPixel = bitsAllocated / 8;
	const pixelOffset = 128;
	const buffer = new ArrayBuffer(pixelOffset + rows * columns * bytesPerPixel);
	return { buffer, byteArray: new Uint8Array(buffer), pixelOffset };
};

const buildInfo = (
	ds: BuildDicomDataSet,
	rawData: ArrayBuffer = ds.byteArray.buffer.slice(
		ds.byteArray.byteOffset,
		ds.byteArray.byteOffset + ds.byteArray.byteLength,
	),
) =>
	buildDicomFileInfo(ds, "roentgen:/tmp/a.dcm", "/tmp/a.dcm", "a.dcm", rawData);

const flushMicrotasks = async () => {
	await Promise.resolve();
	await Promise.resolve();
};

beforeEach(() => {
	vi.spyOn(console, "error").mockImplementation(() => undefined);
	vi.spyOn(console, "warn").mockImplementation(() => undefined);
	disposeCornerstoneHmrState();
});

afterEach(() => {
	vi.restoreAllMocks();
	vi.useRealTimers();
	disposeCornerstoneHmrState();
});

describe("DICOM parser adversarial", () => {
	it("missing referenced file is surfaced with a user-facing load message", () => {
		const message = getPrimaryLoadErrorMessage([
			{
				filePath: "/tmp/missing.dcm",
				reason: "read-error",
				detail: "DICOMDIR参照ファイルが見つかりません",
			},
		]);

		expect(message).toBe("参照ファイルが見つからないため読込できませんでした");
	});
	it("zero-byte file is rejected as not-dicom by the loader", async () => {
		const { result } = renderHook(() => useDicomLoader());

		await act(async () => {
			await result.current.loadFiles([
				{ path: "/bad/zero.dcm", data: new ArrayBuffer(0) },
			]);
		});

		expect(result.current.loadState.status).toBe("error");
		if (result.current.loadState.status === "error") {
			expect(result.current.loadState.skipped?.[0]?.reason).toBe("not-dicom");
		}
	});

	it("DICM magic only is rejected as corrupt by the loader", async () => {
		const { result } = renderHook(() => useDicomLoader());

		await act(async () => {
			await result.current.loadFiles([
				{ path: "/bad/magic-only.dcm", data: makeDicomMagicBuffer(132) },
			]);
		});

		expect(result.current.loadState.status).toBe("error");
		if (result.current.loadState.status === "error") {
			expect(result.current.loadState.skipped?.[0]?.reason).toBe("corrupt");
		}
	});

	it("declared pixel data longer than the file is rejected as corrupt", async () => {
		const { result } = renderHook(() => useDicomLoader());
		const data = makeExplicitDicomBuffer({
			rows: 25,
			columns: 20,
			pixelBytes: new Uint8Array(500),
			declaredPixelLength: 1000,
		});

		await act(async () => {
			await result.current.loadFiles([{ path: "/bad/truncated.dcm", data }]);
		});

		expect(result.current.loadState.status).toBe("error");
		if (result.current.loadState.status === "error") {
			expect(result.current.loadState.skipped?.[0]?.reason).toBe("corrupt");
		}
	});

	it("NumberOfFrames=0 is treated as a single frame", () => {
		const ds = makeDataSet({ intStrings: { x00280008: 0 } });
		expect(buildInfo(ds).totalFrames).toBe(1);
	});

	it("huge NumberOfFrames is metadata only and does not allocate thumbnails per frame", () => {
		const { buffer, byteArray } = makePixelBuffer(1, 1);
		const ds = makeDataSet({
			intStrings: { x00280008: 999999 },
			uint16s: { x00280010: 1, x00280011: 1, x00280100: 16 },
			elements: {
				x7fe00010: { tag: "x7fe00010", vr: "OW", dataOffset: 128, length: 2 },
			},
			byteArray,
		});

		const info = buildInfo(ds, buffer);
		expect(info.totalFrames).toBe(999999);
		expect(info.thumbnailData?.length).toBe(100 * 80 * 4);
	});

	it.each([
		["negative WindowWidth", { x00281050: 50, x00281051: -400 }],
		["negative WindowCenter", { x00281050: -50, x00281051: 400 }],
	])("%s does not produce NaN metadata", (_name, floatStrings) => {
		const ds = makeDataSet({ floatStrings });
		const info = buildInfo(ds);
		expect(Number.isNaN(info.windowWidth)).toBe(false);
		expect(Number.isNaN(info.windowCenter)).toBe(false);
	});

	it("PixelSpacing=0\\0 parses to finite spacing and measurement math stays finite", () => {
		const ds = makeDataSet({ strings: { x00280030: "0\\0" } });
		const spacing = parsePixelSpacing(ds);
		expect(spacing).toEqual([0, 0]);
		expect(calculateDistanceMm({ x: 1, y: 1 }, { x: 2, y: 2 }, spacing)).toBe(
			0,
		);
	});

	it.each([
		["BitsAllocated=32", { x00280100: 32, x00280002: 1 }],
		["SamplesPerPixel=4", { x00280100: 8, x00280002: 4 }],
	])("%s is represented clearly in DicomFileInfo", (_name, uint16s) => {
		const { buffer, byteArray } = makePixelBuffer(2, 2, uint16s.x00280100);
		const ds = makeDataSet({
			uint16s: { x00280010: 2, x00280011: 2, ...uint16s },
			elements: {
				x7fe00010: {
					tag: "x7fe00010",
					vr: "OW",
					dataOffset: 128,
					length: byteArray.length - 128,
				},
			},
			byteArray,
		});

		const info = buildInfo(ds, buffer);
		expect(info.bitsAllocated).toBe(uint16s.x00280100);
		expect(info.samplesPerPixel).toBe(uint16s.x00280002);
	});

	it.each([
		["rows=0", { rows: 0, columns: 512 }],
		["columns=0", { rows: 512, columns: 0 }],
	])("%s does not create thumbnail canvas data", (_name, size) => {
		const ds = makeDataSet({
			uint16s: {
				x00280010: size.rows,
				x00280011: size.columns,
				x00280100: 16,
			},
			elements: {
				x7fe00010: { tag: "x7fe00010", vr: "OW", dataOffset: 0, length: 0 },
			},
			byteArray: new Uint8Array(0),
		});

		const info = buildInfo(ds, new ArrayBuffer(0));
		expect(info.rows).toBe(size.rows);
		expect(info.columns).toBe(size.columns);
		expect(info.thumbnailData).toBeNull();
	});

	it("MPEG transfer syntax throws UnsupportedTransferSyntaxError", () => {
		const ds = makeDataSet({
			strings: { x00020010: "1.2.840.10008.1.2.4.100" },
		});
		expect(() => buildInfo(ds)).toThrow(UnsupportedTransferSyntaxError);
	});

	it("missing TransferSyntax defaults through validation as implicit little endian", () => {
		const info = buildInfo(makeDataSet());
		expect(info.tags.TransferSyntaxUID).toBeUndefined();
		expect(info.totalFrames).toBe(1);
	});

	it("actual dicom-parser rejects DICM-only buffers without crashing the test process", () => {
		expect(() =>
			dicomParser.parseDicom(new Uint8Array(makeDicomMagicBuffer(132))),
		).toThrow();
	});
});

describe("Measurement adversarial", () => {
	it("clicking the same point twice creates a 0.0 mm distance", () => {
		const { result } = renderHook(() => useMeasurement([0.5, 0.5]));
		act(() => result.current.startDistanceTool());
		act(() => result.current.addPoint({ x: 12, y: 34 }));
		act(() => result.current.addPoint({ x: 12, y: 34 }));

		const measurement = result.current.measurements[0];
		expect(measurement?.type).toBe("distance");
		if (measurement?.type === "distance") {
			expect(measurement.distanceMm).toBe(0);
			expect(measurement.distanceMm.toFixed(1)).toBe("0.0");
		}
	});

	it.each([
		[
			"opposite directions",
			[
				{ x: 0, y: 0 },
				{ x: 1, y: 0 },
				{ x: 2, y: 0 },
			],
			180,
		],
		[
			"same direction",
			[
				{ x: 1, y: 0 },
				{ x: 0, y: 0 },
				{ x: 2, y: 0 },
			],
			0,
		],
	])("three collinear points return a finite %s angle", (_name, points, expected) => {
		expect(calculateAngleDeg(points[0], points[1], points[2])).toBeCloseTo(
			expected,
		);
	});

	it("points outside image bounds are rejected by coordinate conversion", () => {
		const rect = new DOMRect(0, 0, 100, 100);
		const viewport = {
			getZoom: () => 1,
			getCenter: () => ({ x: 0.5, y: 0.5 }),
			getHomeBounds: () => ({ x: 0, y: 0, width: 1, height: 1 }),
		};

		expect(containerToImageCoord(-1, 50, rect, 100, 100, viewport)).toBeNull();
		expect(containerToImageCoord(50, 101, rect, 100, 100, viewport)).toBeNull();
	});

	it("1x1 pixel image can still measure the only valid point", () => {
		const { result } = renderHook(() => useMeasurement(null));
		act(() => result.current.startDistanceTool());
		act(() => result.current.addPoint({ x: 0, y: 0 }));
		act(() => result.current.addPoint({ x: 0, y: 0 }));

		const measurement = result.current.measurements[0];
		expect(measurement?.type).toBe("distance");
		if (measurement?.type === "distance") {
			expect(measurement.distanceMm).toBe(0);
		}
	});

	it("pixelSpacing=null uses pixel units instead of crashing", () => {
		expect(calculateDistanceMm({ x: 0, y: 0 }, { x: 3, y: 4 }, null)).toBe(5);
	});

	it("100 rapid distance measurements remain synchronous and finite", () => {
		const { result } = renderHook(() => useMeasurement([1, 1]));
		for (let i = 0; i < 100; i++) {
			act(() => result.current.startDistanceTool());
			act(() => result.current.addPoint({ x: i, y: i }));
			act(() => result.current.addPoint({ x: i + 3, y: i + 4 }));
		}

		expect(result.current.measurements).toHaveLength(100);
		for (const measurement of result.current.measurements) {
			expect(measurement.type).toBe("distance");
			if (measurement.type === "distance") {
				expect(measurement.distanceMm).toBe(5);
			}
		}
	});
});

describe("Viewer lifecycle adversarial", () => {
	it("load file, clear, load the same file again works", async () => {
		const { result } = renderHook(() => useDicomLoader());
		const data = makeExplicitDicomBuffer();

		await act(async () => {
			await result.current.loadFiles([{ path: "/study/same.dcm", data }]);
		});
		expect(result.current.dicomFiles).toHaveLength(1);

		act(() => result.current.clearFiles());
		expect(result.current.dicomFiles).toHaveLength(0);

		await act(async () => {
			await result.current.loadFiles([
				{ path: "/study/same.dcm", data: makeExplicitDicomBuffer() },
			]);
		});
		expect(result.current.dicomFiles).toHaveLength(1);
	});

	it("load 50 files then clear all leaves the shared image map empty", async () => {
		const { result } = renderHook(() => useDicomLoader());
		const files = Array.from({ length: 50 }, (_, index) => ({
			path: `/study/${index}.dcm`,
			data: makeExplicitDicomBuffer(),
		}));

		await act(async () => {
			await result.current.loadFiles(files);
		});
		act(() => result.current.clearFiles());

		expect(result.current.dicomFiles).toHaveLength(0);
		expect(getSharedImageDataMapSize()).toBe(0);
	});

	it("rapidly switching frames 100 times stays within slider bounds", () => {
		const { result } = renderHook(() => useViewerSlider());
		act(() => result.current.setMaxFrame(49));
		for (let i = 0; i < 100; i++) {
			act(() => result.current.setFrame(i % 50));
		}

		expect(result.current.sliderState.currentFrame).toBe(49);
		expect(result.current.sliderState.maxFrame).toBe(49);
	});

	it.each([
		["1x1", new DOMRect(0, 0, 1, 1)],
		["10000x10000", new DOMRect(0, 0, 10000, 10000)],
	])("resize-equivalent coordinate conversion for %s viewport stays finite", (_name, rect) => {
		const viewport = {
			getZoom: () => 1,
			getCenter: () => ({ x: 0.5, y: 0.5 }),
			getHomeBounds: () => ({ x: 0, y: 0, width: 1, height: 1 }),
		};

		const point = containerToImageCoord(
			rect.width / 2,
			rect.height / 2,
			rect,
			512,
			512,
			viewport,
		);

		expect(point?.x).toBeCloseTo(256);
		expect(point?.y).toBeCloseTo(256);
	});

	it("releaseImage can be called repeatedly for the same image id", () => {
		expect(() => {
			releaseImage("roentgen:/study/reused.dcm");
			releaseImage("roentgen:/study/reused.dcm");
		}).not.toThrow();
		expect(getSharedImageDataMapSize()).toBe(0);
	});

	it("terminated worker pool rejects pending and future work cleanly", async () => {
		const worker = {
			addEventListener: vi.fn(),
			removeEventListener: vi.fn(),
			postMessage: vi.fn(),
			terminate: vi.fn(),
		};
		const pool = createDicomParseWorkerPool(1, () => worker);
		pool.terminate();

		await expect(
			pool.parse({
				path: "/study/after-terminate.dcm",
				data: makeExplicitDicomBuffer(),
			}),
		).rejects.toThrow("terminated");
	});
});

describe("Cine adversarial", () => {
	it("play on a single-frame image does not advance frames", () => {
		vi.useFakeTimers();
		const nextFrame = vi.fn();
		const { result } = renderHook(() =>
			useCineMode({ nextFrame, maxFrame: 0, currentFrame: 0 }),
		);

		act(() => result.current.togglePlay());
		act(() => vi.advanceTimersByTime(1000));

		expect(nextFrame).not.toHaveBeenCalled();
	});

	it("setting FPS to 0 does not synchronously spin the player", async () => {
		vi.useFakeTimers();
		const nextFrame = vi.fn();
		const { result } = renderHook(() =>
			useCineMode({ nextFrame, maxFrame: 10, currentFrame: 0 }),
		);

		act(() => result.current.setFps(0));
		act(() => result.current.togglePlay());
		await act(async () => {
			await flushMicrotasks();
		});

		expect(result.current.fps).toBe(0);
		expect(nextFrame).not.toHaveBeenCalled();
	});

	it("FPS increase control clamps to 30", () => {
		const { result } = renderHook(() =>
			useCineMode({ nextFrame: vi.fn(), maxFrame: 10, currentFrame: 0 }),
		);

		for (let i = 0; i < 20; i++) {
			act(() => result.current.increaseFps());
		}

		expect(result.current.fps).toBe(30);
	});

	it("rapid play/pause toggles do not leave multiple intervals active", () => {
		vi.useFakeTimers();
		const setIntervalSpy = vi.spyOn(globalThis, "setInterval");
		const clearIntervalSpy = vi.spyOn(globalThis, "clearInterval");
		const nextFrame = vi.fn();
		const { result, unmount } = renderHook(() =>
			useCineMode({ nextFrame, maxFrame: 10, currentFrame: 0 }),
		);

		for (let i = 0; i < 50; i++) {
			act(() => result.current.togglePlay());
		}
		act(() => vi.advanceTimersByTime(1000));
		unmount();

		expect(setIntervalSpy.mock.calls.length).toBe(
			clearIntervalSpy.mock.calls.length,
		);
	});
});

describe("Viewer controls adversarial", () => {
	it("negative WW from controls is clamped before reaching viewer state", () => {
		let state = {
			windowWidth: 100,
			windowCenter: 50,
			zoom: 1,
			panX: 0,
			panY: 0,
			invert: false,
			rotation: 0,
			flipHorizontal: false,
			flipVertical: false,
		};
		const setWorldInfo = vi.fn((updater) => {
			state = typeof updater === "function" ? updater(state) : updater;
		});
		const { result } = renderHook(() =>
			useViewerControls({ setWorldInfo, getViewport: () => null }),
		);

		act(() => result.current.setWwWc(-100, -20));

		expect(state.windowWidth).toBe(1);
		expect(state.windowCenter).toBe(-20);
	});
});
