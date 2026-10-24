import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import dicomParser from "dicom-parser";
import { createSyntheticDicom } from "../../scripts/generate-synthetic-dicom.mjs";

const fixture = readFileSync(new URL("../../public/test.dcm", import.meta.url));
const dataSet = dicomParser.parseDicom(new Uint8Array(fixture));
const pixelData = dataSet.elements.x7fe00010;

// なぜ: 元の患者名などをテストへ複写せず、公開可能な値だけを許可する。
const approvedText = {
	x00020002: "1.2.840.10008.5.1.4.1.1.1.1",
	x00020010: "1.2.840.10008.1.2.1",
	x00020013: "SYNTHETIC_DX_1",
	x00080005: "ISO_IR 192",
	x00080008: "DERIVED\\PRIMARY",
	x00080016: "1.2.840.10008.5.1.4.1.1.1.1",
	x00080020: "",
	x00080030: "",
	x00080050: "",
	x00080060: "DX",
	x00080068: "FOR PRESENTATION",
	x00080070: "SYNTHETIC FIXTURE",
	x00080090: "",
	x00100010: "SYNTHETIC^HORSE=テスト^馬=てすと^うま",
	x00100020: "SYNTHETIC-DX-001",
	x00100030: "",
	x00100040: "",
	x00120062: "YES",
	x00120063: "FULLY SYNTHETIC; NO SOURCE PATIENT DATA",
	x00180060: "",
	x00181164: "0.2\\0.2",
	x00200010: "SYNTHETIC",
	x00200011: "1",
	x00200013: "1",
	x00200020: "",
	x00200060: "",
	x00200062: "U",
	x00204000: "SYNTHETIC GRADIENT AND RECTANGLE; NOT CLINICAL",
	x00280004: "MONOCHROME2",
	x00280008: "1",
	x00280030: "0.2\\0.2",
	x00280301: "NO",
	x00281040: "LIN",
	x00281050: "8191",
	x00281051: "16383",
	x00281052: "0",
	x00281053: "1",
	x00281054: "US",
	x00282110: "00",
	x20500020: "IDENTITY",
};
const approvedNumbers = {
	x00280002: 1,
	x00280010: 1996,
	x00280011: 2396,
	x00280100: 16,
	x00280101: 14,
	x00280102: 13,
	x00280103: 0,
	x00281041: 1,
};
const generatedUids = [
	"x00020003",
	"x00020012",
	"x00080018",
	"x0020000d",
	"x0020000e",
];

test("tracked fixture is generated exclusively from the synthetic source", () => {
	assert.ok(
		fixture.equals(createSyntheticDicom()),
		"regenerate the synthetic fixture",
	);
	assert.ok(fixture.subarray(0, 128).equals(Buffer.alloc(128)));
	assert.equal(fixture.toString("ascii", 128, 132), "DICM");
	assert.equal(dataSet.string("x00020003"), dataSet.string("x00080018"));
	assert.equal(
		new Set(generatedUids.slice(1).map((tag) => dataSet.string(tag))).size,
		4,
	);
});

test("metadata contains only approved synthetic values and no private or source identity fields", () => {
	const expectedTags = [
		"x00020000",
		"x00020001",
		"x7fe00010",
		...Object.keys(approvedText),
		...Object.keys(approvedNumbers),
		...generatedUids,
	];
	assert.deepEqual(Object.keys(dataSet.elements).sort(), expectedTags.sort());
	for (const tag of Object.keys(dataSet.elements)) {
		assert.equal(
			Number.parseInt(tag.slice(1, 5), 16) % 2,
			0,
			`private group: ${tag}`,
		);
	}
	for (const [tag, expected] of Object.entries(approvedText)) {
		const { dataOffset, length } = dataSet.elements[tag];
		const value = new TextDecoder("utf8", { fatal: true })
			.decode(fixture.subarray(dataOffset, dataOffset + length))
			.replace(/[\0 ]+$/u, "");
		assert.ok(value === expected, `unapproved metadata value: ${tag}`);
	}
	for (const tag of generatedUids) {
		assert.ok(
			/^2\.25\.\d{1,39}$/.test(dataSet.string(tag)),
			`synthetic UID: ${tag}`,
		);
	}
	for (const [tag, value] of Object.entries(approvedNumbers)) {
		assert.equal(dataSet.uint16(tag), value, tag);
	}
	assert.ok(!dataSet.elements.x00080080, "no source institution");
	assert.ok(!dataSet.elements.x00081070, "no source operator");
	assert.ok(!dataSet.elements.x00102297, "no source owner");
});

test("single-frame DX grayscale pixels are a complete synthetic gradient and marker", () => {
	assert.equal(pixelData.length, 1996 * 2396 * 2);
	assert.equal(pixelData.dataOffset + pixelData.length, fixture.length);
	const pixel = (x, y) =>
		fixture.readUInt16LE(pixelData.dataOffset + (y * 2396 + x) * 2);
	assert.equal(pixel(0, 0), 0);
	assert.equal(pixel(2395, 1995), 16383);
	assert.equal(pixel(1200, 1000), 14000);
	assert.equal(pixel(1200, 900), Math.round((1200 * 16383) / 2395));
	assert.ok(pixel(600, 0) < pixel(1800, 0));
	const metaStart = dataSet.elements.x00020000.dataOffset + 4;
	const bodyStart = dataSet.elements.x00080005.dataOffset - 8;
	assert.equal(dataSet.uint32("x00020000"), bodyStart - metaStart);
});

test("comparison series is independently generated with only synthetic UID/series differences", () => {
	const bytes = createSyntheticDicom({ comparison: true });
	const comparison = dicomParser.parseDicom(new Uint8Array(bytes));
	assert.deepEqual(
		Object.keys(comparison.elements),
		Object.keys(dataSet.elements),
	);
	const changed = ["x00020003", "x00080018", "x0020000e", "x00200011"];
	for (const tag of Object.keys(dataSet.elements)) {
		const originalElement = dataSet.elements[tag];
		const otherElement = comparison.elements[tag];
		const value = fixture.subarray(
			originalElement.dataOffset,
			originalElement.dataOffset + originalElement.length,
		);
		const other = bytes.subarray(
			otherElement.dataOffset,
			otherElement.dataOffset + otherElement.length,
		);
		if (changed.includes(tag))
			assert.ok(!value.equals(other), `new synthetic series field: ${tag}`);
		else
			assert.ok(
				value.equals(other),
				`only approved synthetic fields may differ: ${tag}`,
			);
	}
	assert.equal(comparison.string("x00020003"), comparison.string("x00080018"));
	assert.equal(comparison.string("x00200011"), "2");
});
