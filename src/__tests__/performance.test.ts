// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import * as dicomParser from "dicom-parser";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	disposeCornerstoneHmrState,
	getSharedImageDataMapSize,
	useCornerstone,
} from "@/hooks/use-cornerstone";
import {
	createDicomParseWorkerPool,
	useDicomLoader,
} from "@/hooks/use-dicom-loader";
import type { DicomFileInfo } from "@/types/dicom";
import { buildDicomFileInfo } from "@/utils/dicom-parser";

vi.mock("cornerstone-core", () => ({
	default: {
		imageCache: {},
		imageLoader: {},
		loadImage: vi.fn(),
		registerImageLoader: vi.fn(),
		renderToCanvas: vi.fn(),
	},
}));

vi.mock("cornerstone-wado-image-loader", () => ({
	default: {
		external: {},
		configure: vi.fn(),
		webWorkerManager: {
			initialize: vi.fn(),
			terminate: vi.fn(),
		},
		wadouri: {
			fileManager: { purge: vi.fn() },
			dataSetCacheManager: { purge: vi.fn() },
		},
	},
}));

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
	rows: number,
	columns: number,
	options: { fillPixels?: boolean; window?: boolean } = {},
): ArrayBuffer => {
	const preamble = new Uint8Array(132);
	preamble[128] = 0x44;
	preamble[129] = 0x49;
	preamble[130] = 0x43;
	preamble[131] = 0x4d;
	const pixelBytes = new Uint8Array(rows * columns * 2);
	if (options.fillPixels) {
		const pixels = new Uint16Array(pixelBytes.buffer);
		for (let i = 0; i < pixels.length; i++) {
			pixels[i] = i % 4096;
		}
	}

	const parts = [
		preamble,
		makeElement(0x0002, 0x0010, "UI", encodeString("1.2.840.10008.1.2.1", 0)),
		makeElement(0x0028, 0x0010, "US", makeUs(rows)),
		makeElement(0x0028, 0x0011, "US", makeUs(columns)),
		makeElement(0x0028, 0x0002, "US", makeUs(1)),
		makeElement(0x0028, 0x0004, "CS", encodeString("MONOCHROME2")),
		makeElement(0x0028, 0x0030, "DS", encodeString("0.2\\0.2")),
		makeElement(0x0028, 0x0100, "US", makeUs(16)),
		makeElement(0x0028, 0x0101, "US", makeUs(12)),
		makeElement(0x0028, 0x0102, "US", makeUs(11)),
		makeElement(0x0028, 0x0103, "US", makeUs(0)),
		...(options.window === false
			? []
			: [
					makeElement(0x0028, 0x1050, "DS", encodeString("2048")),
					makeElement(0x0028, 0x1051, "DS", encodeString("4096")),
				]),
		makeElement(0x7fe0, 0x0010, "OW", pixelBytes),
	];
	return concatBytes(parts);
};

const parseAndBuild = (buffer: ArrayBuffer, fileName = "perf.dcm") => {
	const dataSet = dicomParser.parseDicom(new Uint8Array(buffer)) as Parameters<
		typeof buildDicomFileInfo
	>[0];
	return buildDicomFileInfo(
		dataSet,
		`roentgen:/perf/${fileName}`,
		`/perf/${fileName}`,
		fileName,
		buffer,
	);
};

const timed = <T>(fn: () => T): { value: T; elapsedMs: number } => {
	const start = performance.now();
	const value = fn();
	return { value, elapsedMs: performance.now() - start };
};

const makeFileInfo = (index: number): DicomFileInfo => ({
	imageId: `roentgen:/perf/${index}.dcm`,
	filePath: `/perf/${index}.dcm`,
	fileName: `${index}.dcm`,
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
	windowCenter: 2048,
	windowWidth: 4096,
	pixelSpacing: [0.2, 0.2],
	imageOrientationPatient: null,
	imagePositionPatient: null,
	sliceThickness: null,
	sliceLocation: null,
	instanceNumber: index,
	studyInstanceUID: "1.2.3",
	seriesInstanceUID: "1.2.3.4",
	modalityLutSequence: null,
	voiLutSequence: null,
	overlayData: [],
	tags: {},
	thumbnailData: null,
});

beforeEach(() => {
	disposeCornerstoneHmrState();
});

afterEach(() => {
	disposeCornerstoneHmrState();
});

describe("Parser performance", () => {
	it("parses and builds a 512x512 16-bit DICOM in under 50ms", () => {
		const buffer = makeDicomBuffer(512, 512, { fillPixels: true });
		parseAndBuild(buffer, "warmup-512.dcm");

		const { value, elapsedMs } = timed(() => parseAndBuild(buffer, "512.dcm"));

		expect(value.rows).toBe(512);
		expect(value.columns).toBe(512);
		expect(elapsedMs).toBeLessThan(50);
	});

	it("parses and builds a 2048x2048 16-bit DICOM in under 200ms", () => {
		const buffer = makeDicomBuffer(2048, 2048);
		parseAndBuild(buffer, "warmup-2048.dcm");

		const { value, elapsedMs } = timed(() => parseAndBuild(buffer, "2048.dcm"));

		expect(value.rows).toBe(2048);
		expect(value.columns).toBe(2048);
		expect(elapsedMs).toBeLessThan(200);
	});

	it("generates a 512x512 thumbnail in under 20ms", () => {
		const buffer = makeDicomBuffer(512, 512, { fillPixels: true });

		const { value, elapsedMs } = timed(() =>
			parseAndBuild(buffer, "thumb.dcm"),
		);

		expect(value.thumbnailData).not.toBeNull();
		expect(elapsedMs).toBeLessThan(20);
	});

	it.each([
		[128, 128, 20],
		[512, 512, 50],
		[1024, 1024, 100],
	])("buildDicomFileInfo stays within budget for %ix%i", (rows, columns, budgetMs) => {
		const buffer = makeDicomBuffer(rows, columns);
		const dataSet = dicomParser.parseDicom(
			new Uint8Array(buffer),
		) as Parameters<typeof buildDicomFileInfo>[0];

		const { value, elapsedMs } = timed(() =>
			buildDicomFileInfo(
				dataSet,
				`roentgen:/perf/${rows}x${columns}.dcm`,
				`/perf/${rows}x${columns}.dcm`,
				`${rows}x${columns}.dcm`,
				buffer,
			),
		);

		expect(value.thumbnailData?.length).toBe(100 * 80 * 4);
		expect(elapsedMs).toBeLessThan(budgetMs);
	});
});

describe("Memory performance", () => {
	it("after loading and clearing 10 files, sharedImageDataMap.size is 0", () => {
		const cornerstone = renderHook(() => useCornerstone());
		act(() => {
			for (let i = 0; i < 10; i++) {
				cornerstone.result.current.registerImageData(
					`/perf/${i}.dcm`,
					makeDicomBuffer(16, 16),
				);
			}
		});

		expect(getSharedImageDataMapSize()).toBe(10);

		act(() => cornerstone.result.current.clearAllImageData());

		expect(getSharedImageDataMapSize()).toBe(0);
		cornerstone.unmount();
	});

	it("after clearing registered files, WeakRef probes no longer imply map retention", () => {
		const cornerstone = renderHook(() => useCornerstone());
		const refs: WeakRef<ArrayBuffer>[] = [];
		act(() => {
			for (let i = 0; i < 10; i++) {
				const buffer = makeDicomBuffer(16, 16);
				refs.push(new WeakRef(buffer));
				cornerstone.result.current.registerImageData(`/weak/${i}.dcm`, buffer);
			}
			cornerstone.result.current.clearAllImageData();
		});

		expect(refs).toHaveLength(10);
		expect(getSharedImageDataMapSize()).toBe(0);
		cornerstone.unmount();
	});

	it("loader clearFiles releases 10 loaded file records without retaining UI state", async () => {
		const loader = renderHook(() => useDicomLoader());
		const files = Array.from({ length: 10 }, (_, index) => ({
			path: `/perf/load-${index}.dcm`,
			data: makeDicomBuffer(32, 32),
		}));

		await act(async () => {
			await loader.result.current.loadFiles(files);
		});
		expect(loader.result.current.dicomFiles).toHaveLength(10);

		act(() => loader.result.current.clearFiles());

		expect(loader.result.current.dicomFiles).toHaveLength(0);
		expect(loader.result.current.loadState.status).toBe("idle");
	});
});

describe("Batch loading performance", () => {
	it("loads 20 DICOM files sequentially via the worker pool", async () => {
		const workers: TestWorker[] = [];
		const pool = createDicomParseWorkerPool(4, () => {
			const worker = new TestWorker((message) => ({
				id: message.id,
				type: "success",
				fileInfo: makeFileInfo(
					Number(message.payload.path.match(/(\d+)/)?.[1] ?? 0),
				),
				rawData: message.payload.data,
			}));
			workers.push(worker);
			return worker;
		});

		const results = [];
		for (let i = 0; i < 20; i++) {
			results.push(
				await pool.parse({
					path: `/perf/worker-${i}.dcm`,
					data: makeDicomBuffer(16, 16),
				}),
			);
		}

		expect(results).toHaveLength(20);
		expect(results.at(-1)?.fileInfo.fileName).toBe("19.dcm");
		expect(workers).toHaveLength(4);
		pool.terminate();
	});

	it("loads 20 files then clearFiles leaves the pool reusable and state idle", async () => {
		const loader = renderHook(() => useDicomLoader());
		const files = Array.from({ length: 20 }, (_, index) => ({
			path: `/perf/batch-${index}.dcm`,
			data: makeDicomBuffer(16, 16),
		}));

		await act(async () => {
			await loader.result.current.loadFiles(files);
		});
		expect(loader.result.current.dicomFiles).toHaveLength(20);

		act(() => loader.result.current.clearFiles());

		expect(loader.result.current.dicomFiles).toHaveLength(0);
		expect(loader.result.current.loadState.status).toBe("idle");

		await act(async () => {
			await loader.result.current.loadFiles([
				{ path: "/perf/reuse.dcm", data: makeDicomBuffer(16, 16) },
			]);
		});
		expect(loader.result.current.dicomFiles).toHaveLength(1);
	});
});

type WorkerMessage = {
	id: number;
	payload: {
		path: string;
		data: ArrayBuffer;
	};
};

type WorkerResponse = {
	id: number;
	type: "success";
	fileInfo: DicomFileInfo;
	rawData: ArrayBuffer;
};

type WorkerListener = (event: MessageEvent<WorkerResponse>) => void;
type WorkerErrorListener = (event: ErrorEvent) => void;

class TestWorker {
	private messageListener: WorkerListener | null = null;
	private terminated = false;

	constructor(
		private readonly respond: (message: WorkerMessage) => WorkerResponse,
	) {}

	addEventListener(...args: ["message", WorkerListener]): void;
	addEventListener(...args: ["error", WorkerErrorListener]): void;
	addEventListener(
		...args: ["message", WorkerListener] | ["error", WorkerErrorListener]
	): void {
		const [eventName, listener] = args;
		if (eventName === "message") {
			this.messageListener = listener;
		}
	}

	removeEventListener(eventName: "message", listener: WorkerListener): void {
		if (eventName === "message" && this.messageListener === listener) {
			this.messageListener = null;
		}
	}

	postMessage(message: WorkerMessage): void {
		queueMicrotask(() => {
			if (this.terminated) return;
			this.messageListener?.(
				new MessageEvent("message", { data: this.respond(message) }),
			);
		});
	}

	terminate(): void {
		this.terminated = true;
		this.messageListener = null;
	}
}
