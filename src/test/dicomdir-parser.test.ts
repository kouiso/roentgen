import { beforeEach, describe, expect, it, vi } from "vitest";

const parseDicomMock = vi.hoisted(() => vi.fn());

vi.mock("dicom-parser", () => ({
	parseDicom: parseDicomMock,
}));

import { parseDicomdir } from "@/utils/dicomdir-parser";

type MockDataSet = {
	string: (tag: string) => string | undefined;
	elements: Record<string, MockElement | undefined>;
};

type MockElement = {
	items?: { dataSet?: MockDataSet }[];
};

const makeDataSet = (
	values: Record<string, string | undefined>,
	elements: Record<string, MockElement | undefined> = {},
): MockDataSet => ({
	string: (tag: string) => values[tag],
	elements,
});

describe("parseDicomdir", () => {
	beforeEach(() => {
		parseDicomMock.mockReset();
	});

	it("Directory Record SequenceからIMAGE参照と階層メタデータを抽出する", () => {
		const patient = makeDataSet({
			x00041430: "PATIENT ",
			x00100010: "HORSE^TEST ",
		});
		const study = makeDataSet({
			x00041430: "STUDY",
			x00081030: "LEFT FORELIMB ",
		});
		const series = makeDataSet({
			x00041430: "SERIES",
			x0008103e: "LATERAL ",
		});
		const image = makeDataSet({
			x00041430: "IMAGE",
			x00041500: "IMAGE\\IM00001 ",
		});
		const unknown = makeDataSet({
			x00041430: "PRIVATE",
			x00041500: "IGNORED",
		});
		const dicomdir = makeDataSet(
			{},
			{
				x00041220: {
					items: [
						{ dataSet: patient },
						{ dataSet: study },
						{ dataSet: series },
						{ dataSet: image },
						{ dataSet: unknown },
					],
				},
			},
		);
		parseDicomMock.mockReturnValue(dicomdir);

		const buffer = new ArrayBuffer(256);
		const entries = parseDicomdir(buffer);

		expect(parseDicomMock).toHaveBeenCalledWith(expect.any(Uint8Array));
		expect(entries).toEqual([
			{
				type: "PATIENT",
				referencedFileId: null,
				patientName: "HORSE^TEST",
			},
			{
				type: "STUDY",
				referencedFileId: null,
				studyDescription: "LEFT FORELIMB",
			},
			{
				type: "SERIES",
				referencedFileId: null,
				seriesDescription: "LATERAL",
			},
			{
				type: "IMAGE",
				referencedFileId: "IMAGE\\IM00001",
			},
		]);
	});

	it("Directory Record Sequenceがない場合は空配列を返す", () => {
		parseDicomMock.mockReturnValue(makeDataSet({}));

		expect(parseDicomdir(new ArrayBuffer(256))).toEqual([]);
	});
});
