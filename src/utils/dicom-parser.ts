// DICOMタグパースユーティリティ（renkeibox Parser.ts 参考）
import type { DicomFileInfo, ModalityLutData, OverlayPlaneData, VoiLutData } from "@/types/dicom";

// dicom-parserの型（ライブラリに型定義がないため）
type DicomDataSet = {
	string: (tag: string) => string | undefined;
	uint16: (tag: string) => number | undefined;
	int16: (tag: string) => number | undefined;
	int32: (tag: string) => number | undefined;
	float: (tag: string) => number | undefined;
	floatString: (tag: string) => number | undefined;
	intString: (tag: string) => number | undefined;
	elements: Record<string, DicomElement>;
	byteArray: Uint8Array;
};

type DicomElement = {
	tag: string;
	vr: string;
	length: number;
	dataOffset: number;
	items?: DicomItem[];
};

type DicomItem = {
	dataSet: DicomDataSet;
};

// DICOMタグから文字列を取得（日本語デコード対応）
export const getStringTag = (
	dataSet: DicomDataSet,
	tag: string,
): string => {
	return dataSet.string(tag)?.trim() ?? "";
};

// DICOMタグから数値を取得
export const getNumberTag = (
	dataSet: DicomDataSet,
	tag: string,
	defaultValue = 0,
): number => {
	return dataSet.floatString(tag) ?? dataSet.float(tag) ?? defaultValue;
};

// DICOMタグからuint16を取得
export const getUint16Tag = (
	dataSet: DicomDataSet,
	tag: string,
	defaultValue = 0,
): number => {
	return dataSet.uint16(tag) ?? defaultValue;
};

// DICOMタグからint16を取得
export const getInt16Tag = (
	dataSet: DicomDataSet,
	tag: string,
	defaultValue = 0,
): number => {
	return dataSet.int16(tag) ?? defaultValue;
};

// Image Orientation Patient (0020,0037) のパース
export const parseImageOrientation = (
	dataSet: DicomDataSet,
): number[] | null => {
	const value = dataSet.string("x00200037");
	if (!value) return null;
	const parts = value.split("\\").map(Number);
	if (parts.length !== 6 || parts.some(Number.isNaN)) return null;
	return parts;
};

// Image Position Patient (0020,0032) のパース
export const parseImagePosition = (
	dataSet: DicomDataSet,
): number[] | null => {
	const value = dataSet.string("x00200032");
	if (!value) return null;
	const parts = value.split("\\").map(Number);
	if (parts.length !== 3 || parts.some(Number.isNaN)) return null;
	return parts;
};

// Pixel Spacing (0028,0030) のパース
export const parsePixelSpacing = (
	dataSet: DicomDataSet,
): [number, number] | null => {
	const value = dataSet.string("x00280030");
	if (!value) return null;
	const parts = value.split("\\").map(Number);
	if (parts.length !== 2 || parts.some(Number.isNaN)) return null;
	return [parts[0] ?? 0, parts[1] ?? 0];
};

// Modality LUT Sequence (0028,3000) のパース
export const parseModalityLut = (
	dataSet: DicomDataSet,
): ModalityLutData | null => {
	const element = dataSet.elements.x00283000;
	if (!element?.items?.[0]) return null;

	const item = element.items[0].dataSet;
	const descriptor = item.string("x00283002");
	if (!descriptor) return null;

	const parts = descriptor.split("\\").map(Number);
	if (parts.length < 3) return null;

	return {
		numberOfEntries: parts[0] ?? 0,
		firstInputValue: parts[1] ?? 0,
		bitsStored: parts[2] ?? 0,
		lutData: [],
	};
};

// VOI LUT Sequence (0028,3010) のパース
export const parseVoiLut = (
	dataSet: DicomDataSet,
): VoiLutData | null => {
	const element = dataSet.elements.x00283010;
	if (!element?.items?.[0]) return null;

	const item = element.items[0].dataSet;
	const descriptor = item.string("x00283002");
	if (!descriptor) return null;

	const parts = descriptor.split("\\").map(Number);
	if (parts.length < 3) return null;

	return {
		numberOfEntries: parts[0] ?? 0,
		firstInputValue: parts[1] ?? 0,
		bitsStored: parts[2] ?? 0,
		lutData: [],
	};
};

// DICOMオーバーレイプレーン (60xx,3000) のパース
export const parseOverlayPlanes = (
	dataSet: DicomDataSet,
): OverlayPlaneData[] => {
	const overlays: OverlayPlaneData[] = [];

	// 60xx グループ (x6000〜x601E、偶数のみ)
	for (let group = 0x6000; group <= 0x601e; group += 2) {
		const groupHex = group.toString(16).padStart(4, "0");
		const rowsTag = `x${groupHex}0010`;
		const colsTag = `x${groupHex}0011`;
		const dataTag = `x${groupHex}3000`;

		const rows = dataSet.uint16(rowsTag);
		const cols = dataSet.uint16(colsTag);
		const element = dataSet.elements[dataTag];

		if (rows === undefined || cols === undefined || !element) continue;

		const originStr = dataSet.string(`x${groupHex}0050`) ?? "1\\1";
		const originParts = originStr.split("\\").map(Number);

		overlays.push({
			groupNumber: group,
			rows,
			columns: cols,
			originRow: originParts[0] ?? 1,
			originCol: originParts[1] ?? 1,
			bitsAllocated: dataSet.uint16(`x${groupHex}0100`) ?? 1,
			bitPosition: dataSet.uint16(`x${groupHex}0102`) ?? 0,
			data: new Uint8Array(
				dataSet.byteArray.buffer,
				element.dataOffset,
				element.length,
			),
		});
	}

	return overlays;
};

// DICOMタグから主要情報を一括取得
export const extractDicomTags = (
	dataSet: DicomDataSet,
): Record<string, string> => {
	const tags: Record<string, string> = {};

	// 主要タグの一覧（renkeibox ImageOverlay.ts の70+タグ対応）
	const tagMap: Record<string, string> = {
		// 患者情報
		"x00100010": "PatientName",
		"x00100020": "PatientID",
		"x00100030": "PatientBirthDate",
		"x00100040": "PatientSex",
		"x00101010": "PatientAge",
		"x00101020": "PatientSize",
		"x00101030": "PatientWeight",
		// 検査情報
		"x00080020": "StudyDate",
		"x00080030": "StudyTime",
		"x00080050": "AccessionNumber",
		"x00080060": "Modality",
		"x00080070": "Manufacturer",
		"x00080080": "InstitutionName",
		"x00080090": "ReferringPhysicianName",
		"x00081010": "StationName",
		"x00081030": "StudyDescription",
		"x0008103e": "SeriesDescription",
		"x00081070": "OperatorsName",
		"x00081090": "ManufacturerModelName",
		// 画像情報
		"x00080008": "ImageType",
		"x00200011": "SeriesNumber",
		"x00200012": "AcquisitionNumber",
		"x00200013": "InstanceNumber",
		"x00200020": "PatientOrientation",
		"x00200032": "ImagePositionPatient",
		"x00200037": "ImageOrientationPatient",
		"x00201041": "SliceLocation",
		// 画像パラメータ
		"x00280002": "SamplesPerPixel",
		"x00280004": "PhotometricInterpretation",
		"x00280010": "Rows",
		"x00280011": "Columns",
		"x00280030": "PixelSpacing",
		"x00280100": "BitsAllocated",
		"x00280101": "BitsStored",
		"x00280102": "HighBit",
		"x00280103": "PixelRepresentation",
		"x00281050": "WindowCenter",
		"x00281051": "WindowWidth",
		"x00281052": "RescaleIntercept",
		"x00281053": "RescaleSlope",
		"x00281054": "RescaleType",
		// X線固有
		"x00180060": "KVP",
		"x00181151": "XRayTubeCurrent",
		"x00181152": "Exposure",
		"x00181153": "ExposureInuAs",
		"x00181160": "FilterType",
		"x00181190": "FocalSpots",
		"x00181164": "ImagerPixelSpacing",
		"x00181110": "DistanceSourceToDetector",
		"x00181111": "DistanceSourceToPatient",
		"x00181030": "ProtocolName",
		"x00180015": "BodyPartExamined",
		"x00180050": "SliceThickness",
		"x00180088": "SpacingBetweenSlices",
		// CT固有
		"x00180022": "ScanOptions",
		"x00180090": "DataCollectionDiameter",
		"x00181120": "GantryDetectorTilt",
		"x00181130": "TableHeight",
		"x00181140": "RotationDirection",
		"x00181150": "ExposureTime",
		"x00181210": "ConvolutionKernel",
		// MRI固有
		"x00180020": "ScanningSequence",
		"x00180021": "SequenceVariant",
		"x00180023": "MRAcquisitionType",
		"x00180024": "SequenceName",
		"x00180025": "AngioFlag",
		"x00180080": "RepetitionTime",
		"x00180081": "EchoTime",
		"x00180082": "InversionTime",
		"x00180083": "NumberOfAverages",
		"x00180084": "ImagingFrequency",
		"x00180085": "ImagedNucleus",
		"x00180086": "EchoNumbers",
		"x00180087": "MagneticFieldStrength",
		"x00180091": "EchoTrainLength",
		"x00181312": "InPlanePhaseEncodingDirection",
		"x00181314": "FlipAngle",
	};

	for (const [tag, name] of Object.entries(tagMap)) {
		const value = dataSet.string(tag);
		if (value !== undefined && value.trim() !== "") {
			tags[name] = value.trim();
		}
	}

	return tags;
};

// DicomDataSetからDicomFileInfoを生成
export const buildDicomFileInfo = (
	dataSet: DicomDataSet,
	imageId: string,
	filePath: string,
	fileName: string,
	rawData: ArrayBuffer,
): DicomFileInfo => {
	const windowCenter = getNumberTag(dataSet, "x00281050");
	const windowWidth = getNumberTag(dataSet, "x00281051");

	return {
		imageId,
		filePath,
		fileName,
		frameIndex: 0,
		totalFrames: Math.max(1, getNumberTag(dataSet, "x00280008", 1)),
		rows: getUint16Tag(dataSet, "x00280010"),
		columns: getUint16Tag(dataSet, "x00280011"),
		bitsAllocated: getUint16Tag(dataSet, "x00280100"),
		bitsStored: getUint16Tag(dataSet, "x00280101"),
		highBit: getUint16Tag(dataSet, "x00280102"),
		pixelRepresentation: getUint16Tag(dataSet, "x00280103"),
		samplesPerPixel: getUint16Tag(dataSet, "x00280002", 1),
		photometricInterpretation: getStringTag(dataSet, "x00280004"),
		rescaleIntercept: getNumberTag(dataSet, "x00281052"),
		rescaleSlope: getNumberTag(dataSet, "x00281053", 1),
		windowCenter,
		windowWidth,
		pixelSpacing: parsePixelSpacing(dataSet),
		imageOrientationPatient: parseImageOrientation(dataSet),
		imagePositionPatient: parseImagePosition(dataSet),
		sliceThickness: dataSet.floatString("x00180050") ?? null,
		sliceLocation: dataSet.floatString("x00201041") ?? null,
		instanceNumber: dataSet.intString("x00200013") ?? null,
		modalityLutSequence: parseModalityLut(dataSet),
		voiLutSequence: parseVoiLut(dataSet),
		overlayData: parseOverlayPlanes(dataSet),
		tags: extractDicomTags(dataSet),
		rawData,
	};
};
