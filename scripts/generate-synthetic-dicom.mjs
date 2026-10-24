#!/usr/bin/env node
// なぜ: 公開 fixture は再現可能な合成画像だけから生成し、実検査データを入力にしない。
import { writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const ROWS = 1996;
const COLUMNS = 2396;
const SOP_CLASS = "1.2.840.10008.5.1.4.1.1.1.1";
// UUID から作った合成 fixture 専用 UID。実検査の UID や施設の UID root を使わない。
const SOP_INSTANCE = "2.25.295518926422326695820387855315547977155";
const STUDY = "2.25.115564018067206796879292487070605862547";
const SERIES = "2.25.2280634659967152246516818395281509962";
const IMPLEMENTATION = "2.25.335905111303015453367542907432359022828";

const element = (group, tag, vr, value) => {
	let bytes;
	if (Buffer.isBuffer(value)) bytes = value;
	else if (vr === "US" || vr === "UL") {
		bytes = Buffer.alloc(vr === "US" ? 2 : 4);
		if (vr === "US") bytes.writeUInt16LE(value);
		else bytes.writeUInt32LE(value);
	} else bytes = Buffer.from(value, "utf8");
	if (bytes.length % 2) {
		bytes = Buffer.concat([bytes, Buffer.from([vr === "UI" ? 0 : 0x20])]);
	}
	const long = vr === "OB" || vr === "OW";
	const header = Buffer.alloc(long ? 12 : 8);
	header.writeUInt16LE(group);
	header.writeUInt16LE(tag, 2);
	header.write(vr, 4, "ascii");
	if (long) header.writeUInt32LE(bytes.length, 8);
	else header.writeUInt16LE(bytes.length, 6);
	return Buffer.concat([header, bytes]);
};

export function createSyntheticDicom({ comparison = false } = {}) {
	const sopInstance = comparison
		? "2.25.120067568061022888209450500930728212266"
		: SOP_INSTANCE;
	const series = comparison
		? "2.25.260532500791748040638421180630147374707"
		: SERIES;
	const pixels = Buffer.alloc(ROWS * COLUMNS * 2);
	for (let y = 0; y < ROWS; y++) {
		for (let x = 0; x < COLUMNS; x++) {
			// なぜ: 階調変化と局所コントラストを検証でき、解剖画像や文字の焼き込みを含まない。
			const marker = x >= 800 && x < 1600 && y >= 950 && y < 1050;
			const value = marker ? 14000 : Math.round((x * 16383) / (COLUMNS - 1));
			pixels.writeUInt16LE(value, (y * COLUMNS + x) * 2);
		}
	}
	const meta = Buffer.concat([
		element(0x0002, 0x0001, "OB", Buffer.from([0, 1])),
		element(0x0002, 0x0002, "UI", SOP_CLASS),
		element(0x0002, 0x0003, "UI", sopInstance),
		element(0x0002, 0x0010, "UI", "1.2.840.10008.1.2.1"),
		element(0x0002, 0x0012, "UI", IMPLEMENTATION),
		element(0x0002, 0x0013, "SH", "SYNTHETIC_DX_1"),
	]);
	const body = Buffer.concat([
		element(0x0008, 0x0005, "CS", "ISO_IR 192"),
		element(0x0008, 0x0008, "CS", "DERIVED\\PRIMARY"),
		element(0x0008, 0x0016, "UI", SOP_CLASS),
		element(0x0008, 0x0018, "UI", sopInstance),
		element(0x0008, 0x0020, "DA", ""),
		element(0x0008, 0x0030, "TM", ""),
		element(0x0008, 0x0050, "SH", ""),
		element(0x0008, 0x0060, "CS", "DX"),
		element(0x0008, 0x0068, "CS", "FOR PRESENTATION"),
		element(0x0008, 0x0070, "LO", "SYNTHETIC FIXTURE"),
		element(0x0008, 0x0090, "PN", ""),
		element(0x0010, 0x0010, "PN", "SYNTHETIC^HORSE=テスト^馬=てすと^うま"),
		element(0x0010, 0x0020, "LO", "SYNTHETIC-DX-001"),
		element(0x0010, 0x0030, "DA", ""),
		element(0x0010, 0x0040, "CS", ""),
		element(0x0012, 0x0062, "CS", "YES"),
		element(0x0012, 0x0063, "LO", "FULLY SYNTHETIC; NO SOURCE PATIENT DATA"),
		element(0x0018, 0x0060, "DS", ""),
		element(0x0018, 0x1164, "DS", "0.2\\0.2"),
		element(0x0020, 0x000d, "UI", STUDY),
		element(0x0020, 0x000e, "UI", series),
		element(0x0020, 0x0010, "SH", "SYNTHETIC"),
		element(0x0020, 0x0011, "IS", comparison ? "2" : "1"),
		element(0x0020, 0x0013, "IS", "1"),
		element(0x0020, 0x0020, "CS", ""),
		element(0x0020, 0x0060, "CS", ""),
		element(0x0020, 0x0062, "CS", "U"),
		element(
			0x0020,
			0x4000,
			"LT",
			"SYNTHETIC GRADIENT AND RECTANGLE; NOT CLINICAL",
		),
		element(0x0028, 0x0002, "US", 1),
		element(0x0028, 0x0004, "CS", "MONOCHROME2"),
		element(0x0028, 0x0008, "IS", "1"),
		element(0x0028, 0x0010, "US", ROWS),
		element(0x0028, 0x0011, "US", COLUMNS),
		element(0x0028, 0x0030, "DS", "0.2\\0.2"),
		element(0x0028, 0x0100, "US", 16),
		element(0x0028, 0x0101, "US", 14),
		element(0x0028, 0x0102, "US", 13),
		element(0x0028, 0x0103, "US", 0),
		element(0x0028, 0x0301, "CS", "NO"),
		element(0x0028, 0x1040, "CS", "LIN"),
		element(0x0028, 0x1041, "SS", Buffer.from([1, 0])),
		element(0x0028, 0x1050, "DS", "8191"),
		element(0x0028, 0x1051, "DS", "16383"),
		element(0x0028, 0x1052, "DS", "0"),
		element(0x0028, 0x1053, "DS", "1"),
		element(0x0028, 0x1054, "LO", "US"),
		element(0x0028, 0x2110, "CS", "00"),
		element(0x2050, 0x0020, "CS", "IDENTITY"),
		element(0x7fe0, 0x0010, "OW", pixels),
	]);
	return Buffer.concat([
		Buffer.alloc(128),
		Buffer.from("DICM", "ascii"),
		element(0x0002, 0x0000, "UL", meta.length),
		meta,
		body,
	]);
}

if (
	process.argv[1] &&
	import.meta.url === pathToFileURL(process.argv[1]).href
) {
	writeFileSync(
		new URL("../public/test.dcm", import.meta.url),
		createSyntheticDicom(),
	);
}
