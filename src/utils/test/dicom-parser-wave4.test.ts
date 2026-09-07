import { describe, expect, it } from "vitest";
import { buildDicomFileInfo } from "../dicom-parser";

type BuildDicomDataSet = Parameters<typeof buildDicomFileInfo>[0];

const makeDataSet = (numberOfFrames: string): BuildDicomDataSet => ({
	string: () => undefined,
	uint16: () => undefined,
	int16: () => undefined,
	int32: () => undefined,
	float: () => undefined,
	floatString: () => undefined,
	intString: (tag) => {
		if (tag !== "x00280008") return undefined;
		const parsed = Number.parseInt(numberOfFrames.trim(), 10);
		return Number.isFinite(parsed) ? parsed : undefined;
	},
	elements: {},
	byteArray: new Uint8Array(0),
});

describe("buildDicomFileInfo Wave 4 polish", () => {
	it("M3: parses NumberOfFrames as an integer string with trailing space", () => {
		const info = buildDicomFileInfo(
			makeDataSet("12 "),
			"roentgen:/tmp/multiframe.dcm",
			"/tmp/multiframe.dcm",
			"multiframe.dcm",
			new ArrayBuffer(0),
		);

		expect(info.totalFrames).toBe(12);
	});
});
