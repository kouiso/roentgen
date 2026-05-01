import { describe, expect, it } from "vitest";
import {
	buildDicomFileInfo,
	ENCAPSULATED_TRANSFER_SYNTAX_UIDS,
	extractDicomTags,
	getInt16Tag,
	getNumberTag,
	getStringTag,
	getUint16Tag,
	isEncapsulatedTransferSyntax,
	parseImageOrientation,
	parseImagePosition,
	parseModalityLut,
	parseOverlayPlanes,
	parsePixelSpacing,
	parseVoiLut,
	UnsupportedTransferSyntaxError,
} from "./dicom-parser";

type MockElement = {
	dataOffset: number;
	length: number;
	items?: MockItem[];
};

type MockDataSet = {
	string: (tag: string) => string | undefined;
	uint16: (tag: string) => number | undefined;
	int16: (tag: string) => number | undefined;
	int32: (tag: string) => number | undefined;
	float: (tag: string) => number | undefined;
	floatString: (tag: string) => number | undefined;
	intString: (tag: string) => number | undefined;
	elements: Record<string, MockElement>;
	byteArray: Uint8Array;
};

type MockItem = {
	dataSet: MockDataSet;
};

// ---------------------------------------------------------------------------
// Mock DataSet factory
// ---------------------------------------------------------------------------
type MockDataSetOptions = {
	strings?: Record<string, string>;
	uint16s?: Record<string, number>;
	int16s?: Record<string, number>;
	int32s?: Record<string, number>;
	floats?: Record<string, number>;
	floatStrings?: Record<string, number>;
	intStrings?: Record<string, number>;
	elements?: Record<string, MockElement>;
	byteArray?: Uint8Array;
};

function makeDataSet(opts: MockDataSetOptions = {}): MockDataSet {
	return {
		string: (tag: string) => opts.strings?.[tag],
		uint16: (tag: string) => opts.uint16s?.[tag],
		int16: (tag: string) => opts.int16s?.[tag],
		int32: (tag: string) => opts.int32s?.[tag],
		float: (tag: string) => opts.floats?.[tag],
		floatString: (tag: string) => opts.floatStrings?.[tag],
		intString: (tag: string) => opts.intStrings?.[tag],
		elements: opts.elements ?? {},
		byteArray: opts.byteArray ?? new Uint8Array(0),
	};
}

// ---------------------------------------------------------------------------
// getStringTag
// ---------------------------------------------------------------------------
describe("getStringTag", () => {
	it("returns trimmed string when tag exists", () => {
		const ds = makeDataSet({ strings: { x00100010: "  John Doe  " } });
		expect(getStringTag(ds, "x00100010")).toBe("John Doe");
	});

	it("returns empty string when tag is missing", () => {
		const ds = makeDataSet();
		expect(getStringTag(ds, "x00100010")).toBe("");
	});

	it("returns empty string when tag value is only whitespace", () => {
		const ds = makeDataSet({ strings: { x00100010: "   " } });
		expect(getStringTag(ds, "x00100010")).toBe("");
	});
});

// ---------------------------------------------------------------------------
// getNumberTag
// ---------------------------------------------------------------------------
describe("getNumberTag", () => {
	it("returns floatString value when available", () => {
		const ds = makeDataSet({ floatStrings: { x00281050: 42.5 } });
		expect(getNumberTag(ds, "x00281050")).toBe(42.5);
	});

	it("falls back to float when floatString is missing", () => {
		const ds = makeDataSet({ floats: { x00281050: 10.2 } });
		expect(getNumberTag(ds, "x00281050")).toBe(10.2);
	});

	it("returns default value when both are missing", () => {
		const ds = makeDataSet();
		expect(getNumberTag(ds, "x00281050")).toBe(0);
		expect(getNumberTag(ds, "x00281050", 99)).toBe(99);
	});

	it("prefers floatString over float", () => {
		const ds = makeDataSet({
			floatStrings: { x00281050: 100 },
			floats: { x00281050: 200 },
		});
		expect(getNumberTag(ds, "x00281050")).toBe(100);
	});
});

// ---------------------------------------------------------------------------
// getUint16Tag
// ---------------------------------------------------------------------------
describe("getUint16Tag", () => {
	it("returns uint16 value when present", () => {
		const ds = makeDataSet({ uint16s: { x00280100: 16 } });
		expect(getUint16Tag(ds, "x00280100")).toBe(16);
	});

	it("returns default when missing", () => {
		const ds = makeDataSet();
		expect(getUint16Tag(ds, "x00280100")).toBe(0);
		expect(getUint16Tag(ds, "x00280100", 8)).toBe(8);
	});
});

// ---------------------------------------------------------------------------
// getInt16Tag
// ---------------------------------------------------------------------------
describe("getInt16Tag", () => {
	it("returns int16 value when present", () => {
		const ds = makeDataSet({ int16s: { x00280103: -1 } });
		expect(getInt16Tag(ds, "x00280103")).toBe(-1);
	});

	it("returns default when missing", () => {
		const ds = makeDataSet();
		expect(getInt16Tag(ds, "x00280103")).toBe(0);
		expect(getInt16Tag(ds, "x00280103", 5)).toBe(5);
	});
});

// ---------------------------------------------------------------------------
// parseImageOrientation
// ---------------------------------------------------------------------------
describe("parseImageOrientation", () => {
	it("parses valid 6-element orientation string", () => {
		const ds = makeDataSet({
			strings: { x00200037: "1\\0\\0\\0\\1\\0" },
		});
		expect(parseImageOrientation(ds)).toEqual([1, 0, 0, 0, 1, 0]);
	});

	it("returns null when tag is missing", () => {
		const ds = makeDataSet();
		expect(parseImageOrientation(ds)).toBeNull();
	});

	it("returns null when fewer than 6 values", () => {
		const ds = makeDataSet({ strings: { x00200037: "1\\0\\0" } });
		expect(parseImageOrientation(ds)).toBeNull();
	});

	it("returns null when values contain NaN", () => {
		const ds = makeDataSet({
			strings: { x00200037: "1\\0\\0\\abc\\1\\0" },
		});
		expect(parseImageOrientation(ds)).toBeNull();
	});

	it("handles floating-point direction cosines", () => {
		const ds = makeDataSet({
			strings: { x00200037: "0.707\\0.707\\0\\-0.707\\0.707\\0" },
		});
		const result = parseImageOrientation(ds);
		expect(result).toHaveLength(6);
		if (!result) throw new Error("orientation should be present");
		expect(result[0]).toBeCloseTo(Math.SQRT1_2, 3);
	});
});

// ---------------------------------------------------------------------------
// parseImagePosition
// ---------------------------------------------------------------------------
describe("parseImagePosition", () => {
	it("parses valid 3-element position string", () => {
		const ds = makeDataSet({
			strings: { x00200032: "-100.5\\-200.3\\50.7" },
		});
		expect(parseImagePosition(ds)).toEqual([-100.5, -200.3, 50.7]);
	});

	it("returns null when tag is missing", () => {
		const ds = makeDataSet();
		expect(parseImagePosition(ds)).toBeNull();
	});

	it("returns null when fewer than 3 values", () => {
		const ds = makeDataSet({ strings: { x00200032: "100\\200" } });
		expect(parseImagePosition(ds)).toBeNull();
	});

	it("returns null when values contain NaN", () => {
		const ds = makeDataSet({
			strings: { x00200032: "100\\abc\\300" },
		});
		expect(parseImagePosition(ds)).toBeNull();
	});
});

// ---------------------------------------------------------------------------
// parsePixelSpacing
// ---------------------------------------------------------------------------
describe("parsePixelSpacing", () => {
	it("parses valid 2-element pixel spacing", () => {
		const ds = makeDataSet({
			strings: { x00280030: "0.5\\0.5" },
		});
		expect(parsePixelSpacing(ds)).toEqual([0.5, 0.5]);
	});

	it("handles anisotropic spacing", () => {
		const ds = makeDataSet({
			strings: { x00280030: "0.3\\0.6" },
		});
		expect(parsePixelSpacing(ds)).toEqual([0.3, 0.6]);
	});

	it("returns null when tag is missing", () => {
		const ds = makeDataSet();
		expect(parsePixelSpacing(ds)).toBeNull();
	});

	it("returns null when fewer than 2 values", () => {
		const ds = makeDataSet({ strings: { x00280030: "0.5" } });
		expect(parsePixelSpacing(ds)).toBeNull();
	});

	it("returns null when values contain NaN", () => {
		const ds = makeDataSet({ strings: { x00280030: "abc\\0.5" } });
		expect(parsePixelSpacing(ds)).toBeNull();
	});
});

// ---------------------------------------------------------------------------
// parseModalityLut
// ---------------------------------------------------------------------------
describe("parseModalityLut", () => {
	it("parses valid modality LUT sequence", () => {
		const itemDataSet = makeDataSet({
			strings: { x00283002: "256\\0\\12" },
		});
		const ds = makeDataSet({
			elements: {
				x00283000: {
					items: [{ dataSet: itemDataSet }],
				},
			},
		});
		const result = parseModalityLut(ds);
		expect(result).toEqual({
			numberOfEntries: 256,
			firstInputValue: 0,
			bitsStored: 12,
			lutData: [],
		});
	});

	it("returns null when element is missing", () => {
		const ds = makeDataSet();
		expect(parseModalityLut(ds)).toBeNull();
	});

	it("returns null when items array is empty", () => {
		const ds = makeDataSet({
			elements: { x00283000: { items: [] } },
		});
		expect(parseModalityLut(ds)).toBeNull();
	});

	it("returns null when descriptor is missing", () => {
		const itemDataSet = makeDataSet();
		const ds = makeDataSet({
			elements: {
				x00283000: { items: [{ dataSet: itemDataSet }] },
			},
		});
		expect(parseModalityLut(ds)).toBeNull();
	});

	it("returns null when descriptor has fewer than 3 parts", () => {
		const itemDataSet = makeDataSet({
			strings: { x00283002: "256\\0" },
		});
		const ds = makeDataSet({
			elements: {
				x00283000: { items: [{ dataSet: itemDataSet }] },
			},
		});
		expect(parseModalityLut(ds)).toBeNull();
	});
});

// ---------------------------------------------------------------------------
// parseVoiLut
// ---------------------------------------------------------------------------
describe("parseVoiLut", () => {
	it("parses valid VOI LUT sequence", () => {
		const itemDataSet = makeDataSet({
			strings: { x00283002: "1024\\-500\\16" },
		});
		const ds = makeDataSet({
			elements: {
				x00283010: {
					items: [{ dataSet: itemDataSet }],
				},
			},
		});
		const result = parseVoiLut(ds);
		expect(result).toEqual({
			numberOfEntries: 1024,
			firstInputValue: -500,
			bitsStored: 16,
			lutData: [],
		});
	});

	it("returns null when element is missing", () => {
		const ds = makeDataSet();
		expect(parseVoiLut(ds)).toBeNull();
	});

	it("returns null when items array is empty", () => {
		const ds = makeDataSet({
			elements: { x00283010: { items: [] } },
		});
		expect(parseVoiLut(ds)).toBeNull();
	});

	it("returns null when descriptor is missing", () => {
		const itemDataSet = makeDataSet();
		const ds = makeDataSet({
			elements: {
				x00283010: { items: [{ dataSet: itemDataSet }] },
			},
		});
		expect(parseVoiLut(ds)).toBeNull();
	});

	it("returns null when descriptor has fewer than 3 parts", () => {
		const itemDataSet = makeDataSet({
			strings: { x00283002: "1024" },
		});
		const ds = makeDataSet({
			elements: {
				x00283010: { items: [{ dataSet: itemDataSet }] },
			},
		});
		expect(parseVoiLut(ds)).toBeNull();
	});
});

// ---------------------------------------------------------------------------
// parseOverlayPlanes
// ---------------------------------------------------------------------------
describe("parseOverlayPlanes", () => {
	it("returns empty array when no overlay groups exist", () => {
		const ds = makeDataSet();
		expect(parseOverlayPlanes(ds)).toEqual([]);
	});

	it("parses a single overlay plane (group 0x6000)", () => {
		const overlayBytes = new Uint8Array([0xff, 0x00, 0xaa, 0x55]);
		const byteArray = new Uint8Array(100 + overlayBytes.length);
		byteArray.set(overlayBytes, 100);

		const ds = makeDataSet({
			uint16s: {
				x60000010: 128, // rows
				x60000011: 64, // cols
				x60000100: 1, // bitsAllocated
				x60000102: 0, // bitPosition
			},
			strings: {
				x60000050: "5\\10", // origin
			},
			elements: {
				x60003000: {
					dataOffset: 100,
					length: overlayBytes.length,
				},
			},
			byteArray,
		});

		const result = parseOverlayPlanes(ds);
		expect(result).toHaveLength(1);
		expect(result[0]).toMatchObject({
			groupNumber: 0x6000,
			rows: 128,
			columns: 64,
			originRow: 5,
			originCol: 10,
			bitsAllocated: 1,
			bitPosition: 0,
		});
		expect(result[0].data).toBeInstanceOf(Uint8Array);
		expect(result[0].data.length).toBe(overlayBytes.length);
	});

	it("uses default origin 1\\1 when origin tag is missing", () => {
		const overlayBytes = new Uint8Array([0x01]);
		const byteArray = new Uint8Array(10 + overlayBytes.length);
		byteArray.set(overlayBytes, 10);

		const ds = makeDataSet({
			uint16s: {
				x60000010: 16,
				x60000011: 16,
			},
			elements: {
				x60003000: {
					dataOffset: 10,
					length: overlayBytes.length,
				},
			},
			byteArray,
		});

		const result = parseOverlayPlanes(ds);
		expect(result).toHaveLength(1);
		expect(result[0].originRow).toBe(1);
		expect(result[0].originCol).toBe(1);
	});

	it("skips groups where rows or cols are missing", () => {
		const ds = makeDataSet({
			uint16s: {
				x60000010: 128, // rows for 0x6000
				// cols missing for 0x6000
			},
			elements: {
				x60003000: { dataOffset: 0, length: 4 },
			},
			byteArray: new Uint8Array(4),
		});

		expect(parseOverlayPlanes(ds)).toEqual([]);
	});
});

// ---------------------------------------------------------------------------
// extractDicomTags
// ---------------------------------------------------------------------------
describe("extractDicomTags", () => {
	it("extracts tags from dataset into named record", () => {
		const ds = makeDataSet({
			strings: {
				x00100010: "TestPatient",
				x00100020: "ID001",
				x00080060: "CR",
				x00080020: "20240101",
			},
		});

		const tags = extractDicomTags(ds);
		expect(tags.PatientName).toBe("TestPatient");
		expect(tags.PatientID).toBe("ID001");
		expect(tags.Modality).toBe("CR");
		expect(tags.StudyDate).toBe("20240101");
	});

	it("skips tags with empty string values", () => {
		const ds = makeDataSet({
			strings: {
				x00100010: "TestPatient",
				x00100020: "  ",
			},
		});

		const tags = extractDicomTags(ds);
		expect(tags.PatientName).toBe("TestPatient");
		expect(tags.PatientID).toBeUndefined();
	});

	it("skips tags that are undefined", () => {
		const ds = makeDataSet({
			strings: { x00100010: "TestPatient" },
		});

		const tags = extractDicomTags(ds);
		expect(tags.PatientName).toBe("TestPatient");
		expect(tags.Modality).toBeUndefined();
	});

	it("returns empty object when all tags are missing", () => {
		const ds = makeDataSet();
		const tags = extractDicomTags(ds);
		expect(Object.keys(tags).length).toBe(0);
	});
});

// ---------------------------------------------------------------------------
// buildDicomFileInfo
// ---------------------------------------------------------------------------
describe("buildDicomFileInfo", () => {
	it.each([
		"1.2.840.10008.1.2",
		"1.2.840.10008.1.2.1",
		"1.2.840.10008.1.2.2",
	])("allows uncompressed transfer syntax %s", (transferSyntaxUid) => {
		const buffer = new ArrayBuffer(16);
		const ds = makeDataSet({
			strings: {
				x00020010: transferSyntaxUid,
			},
			byteArray: new Uint8Array(buffer),
		});

		expect(() =>
			buildDicomFileInfo(ds, "wadouri:ok", "/tmp/ok.dcm", "ok.dcm", buffer),
		).not.toThrow();
	});

	it.each(
		ENCAPSULATED_TRANSFER_SYNTAX_UIDS,
	)("allows encapsulated transfer syntax %s", (transferSyntaxUid) => {
		const buffer = new ArrayBuffer(16);
		const ds = makeDataSet({
			strings: {
				x00020010: transferSyntaxUid,
			},
			byteArray: new Uint8Array(buffer),
		});

		expect(() =>
			buildDicomFileInfo(
				ds,
				"wadouri:encapsulated",
				"/tmp/encapsulated.dcm",
				"encapsulated.dcm",
				buffer,
			),
		).not.toThrow();
		expect(isEncapsulatedTransferSyntax(transferSyntaxUid)).toBe(true);
	});

	it.each([
		"1.2.840.10008.1.2.1.99",
		"1.2.840.10008.1.2.4.100",
		"1.2.840.10008.1.2.4.102",
		"9.9.9.9",
	])("throws a typed error for unsupported transfer syntax %s", (uid) => {
		const buffer = new ArrayBuffer(16);
		const ds = makeDataSet({
			strings: {
				x00020010: uid,
			},
			byteArray: new Uint8Array(buffer),
		});

		expect(() =>
			buildDicomFileInfo(
				ds,
				"wadouri:jpeg2000",
				"/tmp/jpeg2000.dcm",
				"jpeg2000.dcm",
				buffer,
			),
		).toThrow(UnsupportedTransferSyntaxError);

		try {
			buildDicomFileInfo(
				ds,
				"wadouri:jpeg2000",
				"/tmp/jpeg2000.dcm",
				"jpeg2000.dcm",
				buffer,
			);
			throw new Error("unsupported transfer syntax should throw");
		} catch (error) {
			expect(error).toBeInstanceOf(UnsupportedTransferSyntaxError);
			if (!(error instanceof UnsupportedTransferSyntaxError)) return;
			expect(error.transferSyntaxUid).toBe(uid);
			expect(error.message).toContain(uid);
		}
	});

	it("builds a complete DicomFileInfo from a dataset", () => {
		// Create a minimal pixel data buffer for thumbnail generation
		const pixelDataLength = 4 * 2; // 4 pixels, 16-bit
		const bufferSize = 200 + pixelDataLength;
		const buffer = new ArrayBuffer(bufferSize);
		const byteArray = new Uint8Array(buffer);

		// Write some pixel data at offset 200
		const pixelView = new Uint16Array(buffer, 200, 4);
		pixelView[0] = 100;
		pixelView[1] = 200;
		pixelView[2] = 150;
		pixelView[3] = 250;

		const ds = makeDataSet({
			strings: {
				x00100010: "TestPatient",
				x00280004: "MONOCHROME2",
				x00280030: "0.5\\0.5",
				x00200037: "1\\0\\0\\0\\1\\0",
				x00200032: "0\\0\\0",
				x0020000d: "1.2.3.4",
				x0020000e: "1.2.3.5",
				x00281050: "175",
				x00281051: "150",
			},
			uint16s: {
				x00280010: 2, // rows
				x00280011: 2, // columns
				x00280100: 16, // bitsAllocated
				x00280101: 12, // bitsStored
				x00280102: 11, // highBit
				x00280103: 0, // pixelRepresentation (unsigned)
				x00280002: 1, // samplesPerPixel
			},
			floatStrings: {
				x00281050: 175,
				x00281051: 150,
				x00281052: 0,
				x00281053: 1,
				x00280008: 1,
			},
			elements: {
				x7fe00010: {
					dataOffset: 200,
					length: pixelDataLength,
				},
			},
			byteArray,
		});

		const info = buildDicomFileInfo(
			ds,
			"wadouri:test",
			"/tmp/test.dcm",
			"test.dcm",
			buffer,
		);

		expect(info.imageId).toBe("wadouri:test");
		expect(info.filePath).toBe("/tmp/test.dcm");
		expect(info.fileName).toBe("test.dcm");
		expect(info.rows).toBe(2);
		expect(info.columns).toBe(2);
		expect(info.bitsAllocated).toBe(16);
		expect(info.bitsStored).toBe(12);
		expect(info.highBit).toBe(11);
		expect(info.pixelRepresentation).toBe(0);
		expect(info.samplesPerPixel).toBe(1);
		expect(info.photometricInterpretation).toBe("MONOCHROME2");
		expect(info.windowCenter).toBe(175);
		expect(info.windowWidth).toBe(150);
		expect(info.pixelSpacing).toEqual([0.5, 0.5]);
		expect(info.imageOrientationPatient).toEqual([1, 0, 0, 0, 1, 0]);
		expect(info.imagePositionPatient).toEqual([0, 0, 0]);
		expect(info.studyInstanceUID).toBe("1.2.3.4");
		expect(info.seriesInstanceUID).toBe("1.2.3.5");
		expect(info.tags.PatientName).toBe("TestPatient");
		expect(info.frameIndex).toBe(0);
		expect(info.totalFrames).toBe(1);
		// Thumbnail should be generated (2x2 pixel data with valid WW/WC)
		expect(info.thumbnailData).not.toBeNull();
	});

	it("handles missing optional fields gracefully", () => {
		const buffer = new ArrayBuffer(16);
		const byteArray = new Uint8Array(buffer);

		const ds = makeDataSet({
			strings: {},
			uint16s: {},
			floatStrings: {},
			elements: {},
			byteArray,
		});

		const info = buildDicomFileInfo(
			ds,
			"wadouri:empty",
			"/tmp/empty.dcm",
			"empty.dcm",
			buffer,
		);

		expect(info.rows).toBe(0);
		expect(info.columns).toBe(0);
		expect(info.windowCenter).toBe(0);
		expect(info.windowWidth).toBe(0);
		expect(info.pixelSpacing).toBeNull();
		expect(info.imageOrientationPatient).toBeNull();
		expect(info.imagePositionPatient).toBeNull();
		expect(info.studyInstanceUID).toBeNull();
		expect(info.seriesInstanceUID).toBeNull();
		expect(info.thumbnailData).toBeNull();
	});

	it("generates thumbnail with signed 16-bit pixel data", () => {
		const pixelDataLength = 4 * 2; // 4 pixels, 16-bit signed
		const bufferSize = 100 + pixelDataLength;
		const buffer = new ArrayBuffer(bufferSize);
		const byteArray = new Uint8Array(buffer);
		const pixelView = new Int16Array(buffer, 100, 4);
		pixelView[0] = -100;
		pixelView[1] = 100;
		pixelView[2] = 0;
		pixelView[3] = 200;

		const ds = makeDataSet({
			uint16s: {
				x00280010: 2,
				x00280011: 2,
				x00280100: 16,
				x00280103: 1, // signed
			},
			strings: {
				x00281050: "50",
				x00281051: "300",
			},
			elements: {
				x7fe00010: { dataOffset: 100, length: pixelDataLength },
			},
			byteArray,
		});

		const info = buildDicomFileInfo(
			ds,
			"wadouri:signed",
			"/tmp/signed.dcm",
			"signed.dcm",
			buffer,
		);

		const thumbnailData = info.thumbnailData;
		expect(thumbnailData).not.toBeNull();
		if (!thumbnailData) throw new Error("thumbnail should be generated");
		expect(thumbnailData.length).toBe(100 * 80 * 4); // THUMB_W * THUMB_H * 4
	});

	it("generates thumbnail with 8-bit pixel data", () => {
		const pixelDataLength = 4; // 4 pixels, 8-bit
		const bufferSize = 50 + pixelDataLength;
		const buffer = new ArrayBuffer(bufferSize);
		const byteArray = new Uint8Array(buffer);
		byteArray[50] = 0;
		byteArray[51] = 128;
		byteArray[52] = 64;
		byteArray[53] = 255;

		const ds = makeDataSet({
			uint16s: {
				x00280010: 2,
				x00280011: 2,
				x00280100: 8,
				x00280103: 0,
			},
			strings: {
				x00281050: "128",
				x00281051: "256",
			},
			elements: {
				x7fe00010: { dataOffset: 50, length: pixelDataLength },
			},
			byteArray,
		});

		const info = buildDicomFileInfo(
			ds,
			"wadouri:8bit",
			"/tmp/8bit.dcm",
			"8bit.dcm",
			buffer,
		);

		const thumbnailData = info.thumbnailData;
		expect(thumbnailData).not.toBeNull();
		if (!thumbnailData) throw new Error("thumbnail should be generated");
		expect(thumbnailData.length).toBe(100 * 80 * 4);
	});

	it("auto-calculates WW/WC when tags are missing", () => {
		const pixelDataLength = 4 * 2;
		const bufferSize = 50 + pixelDataLength;
		const buffer = new ArrayBuffer(bufferSize);
		const byteArray = new Uint8Array(buffer);
		const pixels = new Uint16Array(buffer, 50, 4);
		pixels[0] = 100;
		pixels[1] = 300;
		pixels[2] = 200;
		pixels[3] = 400;

		const ds = makeDataSet({
			uint16s: {
				x00280010: 2,
				x00280011: 2,
				x00280100: 16,
				x00280103: 0,
			},
			// No WW/WC strings → auto-calculate from pixel range
			elements: {
				x7fe00010: { dataOffset: 50, length: pixelDataLength },
			},
			byteArray,
		});

		const info = buildDicomFileInfo(
			ds,
			"wadouri:auto-wc",
			"/tmp/auto.dcm",
			"auto.dcm",
			buffer,
		);

		// Thumbnail should still be generated with auto-calculated WW/WC
		expect(info.thumbnailData).not.toBeNull();
	});
});
