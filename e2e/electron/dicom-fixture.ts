// 幾何検証用の最小 DICOM (Explicit VR Little Endian) を生成する。
// 実データでは「正解の位置・寸法」が分からないため、物理寸法が既知の図形を描いた画像を使う。
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

type ElementValue = string | number | Buffer;

const LONG_VRS = new Set(["OB", "OW", "OF", "SQ", "UT", "UN"]);

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
	const isLong = LONG_VRS.has(vr);
	const header = Buffer.alloc(isLong ? 12 : 8);
	header.writeUInt16LE(group, 0);
	header.writeUInt16LE(element, 2);
	header.write(vr, 4, "latin1");
	if (isLong) header.writeUInt32LE(data.length, 8);
	else header.writeUInt16LE(data.length, 6);
	return Buffer.concat([header, data]);
};

export type GeometryFixture = {
	rows: number;
	columns: number;
	// [rowSpacing, columnSpacing] mm/pixel
	pixelSpacing: [number, number];
	widthMm: number;
	heightMm: number;
	ringRadiusMm: number;
	ringHalfThicknessMm: number;
	// 左上の「F」マーカーの中心（物理座標 mm）
	markerCenterMm: { x: number; y: number };
};

export const BACKGROUND_VALUE = 300;
export const RING_VALUE = 2000;
export const MARKER_VALUE = 4000;

// 物理空間で真円のリングと、向きが一意に分かる「F」型マーカーを描く
export const writeGeometryFixture = (
	filePath: string,
	options: {
		rows: number;
		columns: number;
		pixelSpacing: [number, number];
		uid: string;
		// 指定時だけ Patient Orientation (0020,0020) / Anatomical Orientation Type (0010,2210) を書く
		patientOrientation?: string;
		anatomicalOrientationType?: "BIPED" | "QUADRUPED";
	},
): GeometryFixture => {
	const { rows, columns, pixelSpacing } = options;
	const [rowSpacing, columnSpacing] = pixelSpacing;
	const widthMm = columns * columnSpacing;
	const heightMm = rows * rowSpacing;
	const ringRadiusMm = Math.min(widthMm, heightMm) * 0.35;
	const ringHalfThicknessMm = Math.min(widthMm, heightMm) * 0.03;

	const inMarker = (u: number, v: number) =>
		(u > 0.05 && u < 0.09 && v > 0.05 && v < 0.3) ||
		(u > 0.05 && u < 0.22 && v > 0.05 && v < 0.09) ||
		(u > 0.05 && u < 0.16 && v > 0.15 && v < 0.19);

	const pixels = Buffer.alloc(rows * columns * 2);
	let markerSumX = 0;
	let markerSumY = 0;
	let markerCount = 0;
	for (let y = 0; y < rows; y++) {
		for (let x = 0; x < columns; x++) {
			const mmX = (x + 0.5) * columnSpacing;
			const mmY = (y + 0.5) * rowSpacing;
			const distance = Math.hypot(mmX - widthMm / 2, mmY - heightMm / 2);
			let value = BACKGROUND_VALUE;
			if (Math.abs(distance - ringRadiusMm) < ringHalfThicknessMm) {
				value = RING_VALUE;
			}
			if (inMarker(mmX / widthMm, mmY / heightMm)) {
				value = MARKER_VALUE;
				markerSumX += mmX;
				markerSumY += mmY;
				markerCount++;
			}
			pixels.writeUInt16LE(value, (y * columns + x) * 2);
		}
	}

	const sopClassUid = "1.2.840.10008.5.1.4.1.1.1.1";
	const sopInstanceUid = `1.2.826.0.1.3680043.10.999.${options.uid}.1`;
	const meta = Buffer.concat([
		encodeElement(0x0002, 0x0001, "OB", Buffer.from([0, 1])),
		encodeElement(0x0002, 0x0002, "UI", sopClassUid),
		encodeElement(0x0002, 0x0003, "UI", sopInstanceUid),
		encodeElement(0x0002, 0x0010, "UI", "1.2.840.10008.1.2.1"),
		encodeElement(0x0002, 0x0012, "UI", "1.2.826.0.1.3680043.10.999"),
	]);
	const body = Buffer.concat([
		encodeElement(0x0008, 0x0016, "UI", sopClassUid),
		encodeElement(0x0008, 0x0018, "UI", sopInstanceUid),
		encodeElement(0x0008, 0x0060, "CS", "DX"),
		encodeElement(0x0010, 0x0010, "PN", "Geometry^Fixture"),
		encodeElement(0x0010, 0x0020, "LO", `GEO${options.uid}`),
		...(options.anatomicalOrientationType
			? [encodeElement(0x0010, 0x2210, "CS", options.anatomicalOrientationType)]
			: []),
		encodeElement(
			0x0020,
			0x000d,
			"UI",
			`1.2.826.0.1.3680043.10.999.${options.uid}.2`,
		),
		encodeElement(
			0x0020,
			0x000e,
			"UI",
			`1.2.826.0.1.3680043.10.999.${options.uid}.3`,
		),
		encodeElement(0x0020, 0x0013, "IS", "1"),
		...(options.patientOrientation
			? [encodeElement(0x0020, 0x0020, "CS", options.patientOrientation)]
			: []),
		encodeElement(0x0028, 0x0002, "US", 1),
		encodeElement(0x0028, 0x0004, "CS", "MONOCHROME2"),
		encodeElement(0x0028, 0x0010, "US", rows),
		encodeElement(0x0028, 0x0011, "US", columns),
		encodeElement(0x0028, 0x0030, "DS", `${rowSpacing}\\${columnSpacing}`),
		encodeElement(0x0028, 0x0100, "US", 16),
		encodeElement(0x0028, 0x0101, "US", 12),
		encodeElement(0x0028, 0x0102, "US", 11),
		encodeElement(0x0028, 0x0103, "US", 0),
		// 自動ウィンドウ補正が働かない（全レンジ未満の）明示ウィンドウにして見た目を固定する
		encodeElement(0x0028, 0x1050, "DS", "2150"),
		encodeElement(0x0028, 0x1051, "DS", "3600"),
		encodeElement(0x7fe0, 0x0010, "OW", pixels),
	]);
	const groupLength = encodeElement(0x0002, 0x0000, "UL", meta.length);

	mkdirSync(dirname(filePath), { recursive: true });
	writeFileSync(
		filePath,
		Buffer.concat([
			Buffer.alloc(128),
			Buffer.from("DICM", "latin1"),
			groupLength,
			meta,
			body,
		]),
	);

	return {
		rows,
		columns,
		pixelSpacing,
		widthMm,
		heightMm,
		ringRadiusMm,
		ringHalfThicknessMm,
		markerCenterMm: {
			x: markerSumX / Math.max(1, markerCount),
			y: markerSumY / Math.max(1, markerCount),
		},
	};
};
