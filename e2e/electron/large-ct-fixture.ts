// 大容量 CT（マルチフレーム）の合成 DICOM を生成する。
// 実患者データをリポジトリに置けないため、性能検証用に形と大きさだけ現実に寄せた画像を作る。
import { closeSync, openSync, writeSync } from "node:fs";

type ElementValue = string | number | Buffer;

const LONG_VRS = new Set(["OB", "OW", "OF", "SQ", "UT", "UN"]);

const encodeHeader = (
	group: number,
	element: number,
	vr: string,
	length: number,
): Buffer => {
	const isLong = LONG_VRS.has(vr);
	const header = Buffer.alloc(isLong ? 12 : 8);
	header.writeUInt16LE(group, 0);
	header.writeUInt16LE(element, 2);
	header.write(vr, 4, "latin1");
	if (isLong) header.writeUInt32LE(length, 8);
	else header.writeUInt16LE(length, 6);
	return header;
};

const encodeElement = (
	group: number,
	element: number,
	vr: string,
	value: ElementValue,
): Buffer => {
	let data: Buffer;
	if (Buffer.isBuffer(value)) {
		data = value;
	} else if (vr === "US") {
		data = Buffer.alloc(2);
		data.writeUInt16LE(Number(value));
	} else if (vr === "UL") {
		data = Buffer.alloc(4);
		data.writeUInt32LE(Number(value));
	} else {
		data = Buffer.from(String(value), "latin1");
	}
	if (data.length % 2 === 1) {
		data = Buffer.concat([
			data,
			Buffer.from([vr === "UI" || vr === "OB" ? 0x00 : 0x20]),
		]);
	}
	return Buffer.concat([encodeHeader(group, element, vr, data.length), data]);
};

export type LargeCtFixture = {
	rows: number;
	columns: number;
	frames: number;
	fileBytes: number;
	pixelBytes: number;
};

// 保存値 = HU + 1024。空気(-1000)の中に軟部組織の楕円と、スライスごとに位置が変わる骨を置く。
// フレームごとに絵が変わるので、表示がフレーム送りに追従しているかを画素で判定できる。
const AIR = -1000 + 1024;
const SOFT_TISSUE = 40 + 1024;
const BONE = 1200 + 1024;

const createBaseFrame = (rows: number, columns: number) => {
	const base = Buffer.alloc(rows * columns * 2);
	for (let y = 0; y < rows; y++) {
		for (let x = 0; x < columns; x++) {
			const dx = (x - columns / 2) / (columns * 0.42);
			const dy = (y - rows / 2) / (rows * 0.32);
			base.writeUInt16LE(
				dx * dx + dy * dy <= 1 ? SOFT_TISSUE : AIR,
				(y * columns + x) * 2,
			);
		}
	}
	return base;
};

export const boneCenterXForFrame = (
	frameIndex: number,
	frames: number,
	columns: number,
) => columns * (0.25 + 0.5 * (frames <= 1 ? 0 : frameIndex / (frames - 1)));

const drawBone = (
	frame: Buffer,
	frameIndex: number,
	frames: number,
	rows: number,
	columns: number,
) => {
	const boneX = boneCenterXForFrame(frameIndex, frames, columns);
	const boneY = rows / 2;
	const radius = Math.min(rows, columns) * 0.06;
	for (
		let y = Math.floor(boneY - radius);
		y <= Math.ceil(boneY + radius);
		y++
	) {
		for (
			let x = Math.floor(boneX - radius);
			x <= Math.ceil(boneX + radius);
			x++
		) {
			if (x < 0 || y < 0 || x >= columns || y >= rows) continue;
			if (Math.hypot(x - boneX, y - boneY) <= radius) {
				frame.writeUInt16LE(BONE, (y * columns + x) * 2);
			}
		}
	}
};

export const writeLargeCtFixture = (
	filePath: string,
	options: { rows: number; columns: number; frames: number },
): LargeCtFixture => {
	const { rows, columns, frames } = options;
	const frameBytes = rows * columns * 2;
	const pixelBytes = frameBytes * frames;

	const sopClassUid = "1.2.840.10008.5.1.4.1.1.2.1";
	const uidRoot = "1.2.826.0.1.3680043.10.998";
	const sopInstanceUid = `${uidRoot}.1`;
	const meta = Buffer.concat([
		encodeElement(0x0002, 0x0001, "OB", Buffer.from([0, 1])),
		encodeElement(0x0002, 0x0002, "UI", sopClassUid),
		encodeElement(0x0002, 0x0003, "UI", sopInstanceUid),
		encodeElement(0x0002, 0x0010, "UI", "1.2.840.10008.1.2.1"),
		encodeElement(0x0002, 0x0012, "UI", uidRoot),
	]);
	const body = Buffer.concat([
		encodeElement(0x0008, 0x0016, "UI", sopClassUid),
		encodeElement(0x0008, 0x0018, "UI", sopInstanceUid),
		encodeElement(0x0008, 0x0060, "CS", "CT"),
		encodeElement(0x0010, 0x0010, "PN", "Large^CT"),
		encodeElement(0x0010, 0x0020, "LO", "LARGECT"),
		encodeElement(0x0020, 0x000d, "UI", `${uidRoot}.2`),
		encodeElement(0x0020, 0x000e, "UI", `${uidRoot}.3`),
		encodeElement(0x0020, 0x0013, "IS", "1"),
		encodeElement(0x0028, 0x0002, "US", 1),
		encodeElement(0x0028, 0x0004, "CS", "MONOCHROME2"),
		encodeElement(0x0028, 0x0008, "IS", String(frames)),
		encodeElement(0x0028, 0x0010, "US", rows),
		encodeElement(0x0028, 0x0011, "US", columns),
		encodeElement(0x0028, 0x0030, "DS", "0.5\\0.5"),
		encodeElement(0x0028, 0x0100, "US", 16),
		encodeElement(0x0028, 0x0101, "US", 12),
		encodeElement(0x0028, 0x0102, "US", 11),
		encodeElement(0x0028, 0x0103, "US", 0),
		encodeElement(0x0028, 0x1050, "DS", "40"),
		encodeElement(0x0028, 0x1051, "DS", "400"),
		encodeElement(0x0028, 0x1052, "DS", "-1024"),
		encodeElement(0x0028, 0x1053, "DS", "1"),
		encodeHeader(0x7fe0, 0x0010, "OW", pixelBytes),
	]);
	const groupLength = encodeElement(0x0002, 0x0000, "UL", meta.length);
	const header = Buffer.concat([
		Buffer.alloc(128),
		Buffer.from("DICM", "latin1"),
		groupLength,
		meta,
		body,
	]);

	// 500 MB 超を一度にメモリへ載せないよう、フレーム単位で書き出す
	const fd = openSync(filePath, "w");
	try {
		writeSync(fd, header);
		const base = createBaseFrame(rows, columns);
		const frame = Buffer.alloc(frameBytes);
		for (let i = 0; i < frames; i++) {
			base.copy(frame);
			drawBone(frame, i, frames, rows, columns);
			writeSync(fd, frame);
		}
	} finally {
		closeSync(fd);
	}

	return {
		rows,
		columns,
		frames,
		fileBytes: header.length + pixelBytes,
		pixelBytes,
	};
};
