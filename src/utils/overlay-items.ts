// オーバーレイ項目定義（renkeibox ImageOverlay.ts 移植）
// 70+タグの4隅オーバーレイ配置
import type { OverlayItemDefinition } from "@/types/overlay";

// 日付フォーマット: YYYYMMDD → YYYY/MM/DD
const formatDate = (value: string): string => {
	if (value.length !== 8) return value;
	return `${value.slice(0, 4)}/${value.slice(4, 6)}/${value.slice(6, 8)}`;
};

// 時刻フォーマット: HHMMSS.fff → HH:MM:SS
const formatTime = (value: string): string => {
	if (value.length < 6) return value;
	return `${value.slice(0, 2)}:${value.slice(2, 4)}:${value.slice(4, 6)}`;
};

export const OVERLAY_ITEMS: OverlayItemDefinition[] = [
	// === 左上: 対象情報 ===
	{
		id: "patientName",
		tag: "PatientName",
		label: "名前",
		position: "topLeft",
	},
	{ id: "patientId", tag: "PatientID", label: "ID", position: "topLeft" },
	{
		id: "patientBirthDate",
		tag: "PatientBirthDate",
		label: "生年月日",
		position: "topLeft",
		format: formatDate,
	},
	{ id: "patientSex", tag: "PatientSex", label: "性別", position: "topLeft" },
	{ id: "patientAge", tag: "PatientAge", label: "年齢", position: "topLeft" },

	// === 右上: 検査情報 ===
	{
		id: "institutionName",
		tag: "InstitutionName",
		label: "施設名",
		position: "topRight",
	},
	{
		id: "studyDate",
		tag: "StudyDate",
		label: "検査日",
		position: "topRight",
		format: formatDate,
	},
	{
		id: "studyTime",
		tag: "StudyTime",
		label: "検査時刻",
		position: "topRight",
		format: formatTime,
	},
	{
		id: "modality",
		tag: "Modality",
		label: "撮影種別",
		position: "topRight",
	},
	{
		id: "studyDescription",
		tag: "StudyDescription",
		label: "検査説明",
		position: "topRight",
	},
	{
		id: "seriesDescription",
		tag: "SeriesDescription",
		label: "シリーズ説明",
		position: "topRight",
	},
	{
		id: "accessionNumber",
		tag: "AccessionNumber",
		label: "整理番号",
		position: "topRight",
	},
	{
		id: "referringPhysician",
		tag: "ReferringPhysicianName",
		label: "担当医師",
		position: "topRight",
	},

	// === 左下: 装置・撮影条件 ===
	{
		id: "manufacturer",
		tag: "Manufacturer",
		label: "メーカー",
		position: "bottomLeft",
	},
	{
		id: "modelName",
		tag: "ManufacturerModelName",
		label: "機種名",
		position: "bottomLeft",
	},
	{
		id: "stationName",
		tag: "StationName",
		label: "ステーション",
		position: "bottomLeft",
	},
	{
		id: "protocolName",
		tag: "ProtocolName",
		label: "プロトコル",
		position: "bottomLeft",
	},
	{
		id: "bodyPartExamined",
		tag: "BodyPartExamined",
		label: "撮影部位",
		position: "bottomLeft",
	},
	// X線固有
	{ id: "kvp", tag: "KVP", label: "管電圧(kV)", position: "bottomLeft" },
	{
		id: "tubeCurrent",
		tag: "XRayTubeCurrent",
		label: "管電流(mA)",
		position: "bottomLeft",
	},
	{
		id: "exposure",
		tag: "Exposure",
		label: "照射量(mAs)",
		position: "bottomLeft",
	},
	{
		id: "filterType",
		tag: "FilterType",
		label: "フィルタ",
		position: "bottomLeft",
	},
	{
		id: "focalSpots",
		tag: "FocalSpots",
		label: "焦点サイズ",
		position: "bottomLeft",
	},
	{
		id: "distSourceDetector",
		tag: "DistanceSourceToDetector",
		label: "SID(mm)",
		position: "bottomLeft",
	},
	{
		id: "distSourcePatient",
		tag: "DistanceSourceToPatient",
		label: "SOD(mm)",
		position: "bottomLeft",
	},
	// CT固有
	{
		id: "sliceThickness",
		tag: "SliceThickness",
		label: "スライス厚(mm)",
		position: "bottomLeft",
	},
	{
		id: "spacingBetweenSlices",
		tag: "SpacingBetweenSlices",
		label: "スライス間隔(mm)",
		position: "bottomLeft",
	},
	{
		id: "convolutionKernel",
		tag: "ConvolutionKernel",
		label: "カーネル",
		position: "bottomLeft",
	},
	{
		id: "gantryTilt",
		tag: "GantryDetectorTilt",
		label: "ガントリー角",
		position: "bottomLeft",
	},
	// MRI固有
	{
		id: "repetitionTime",
		tag: "RepetitionTime",
		label: "TR(ms)",
		position: "bottomLeft",
	},
	{ id: "echoTime", tag: "EchoTime", label: "TE(ms)", position: "bottomLeft" },
	{
		id: "flipAngle",
		tag: "FlipAngle",
		label: "フリップ角",
		position: "bottomLeft",
	},
	{
		id: "magneticFieldStrength",
		tag: "MagneticFieldStrength",
		label: "磁場(T)",
		position: "bottomLeft",
	},
	{
		id: "scanningSequence",
		tag: "ScanningSequence",
		label: "シーケンス",
		position: "bottomLeft",
	},

	// === 右下: 画像パラメータ ===
	{
		id: "imageSize",
		tag: "_imageSize",
		label: "画像サイズ",
		position: "bottomRight",
	},
	{
		id: "bitsInfo",
		tag: "_bitsInfo",
		label: "ビット",
		position: "bottomRight",
	},
	{
		id: "pixelSpacing",
		tag: "PixelSpacing",
		label: "ピクセル間隔",
		position: "bottomRight",
	},
	{
		id: "windowCenter",
		tag: "WindowCenter",
		label: "WC",
		position: "bottomRight",
	},
	{
		id: "windowWidth",
		tag: "WindowWidth",
		label: "WW",
		position: "bottomRight",
	},
	{
		id: "rescaleSlope",
		tag: "RescaleSlope",
		label: "傾き",
		position: "bottomRight",
	},
	{
		id: "rescaleIntercept",
		tag: "RescaleIntercept",
		label: "切片",
		position: "bottomRight",
	},
	{
		id: "rescaleType",
		tag: "RescaleType",
		label: "単位",
		position: "bottomRight",
	},
	{
		id: "photometric",
		tag: "PhotometricInterpretation",
		label: "表色系",
		position: "bottomRight",
	},
	{
		id: "seriesNumber",
		tag: "SeriesNumber",
		label: "シリーズ#",
		position: "bottomRight",
	},
	{
		id: "instanceNumber",
		tag: "InstanceNumber",
		label: "画像#",
		position: "bottomRight",
	},
	{
		id: "sliceLocation",
		tag: "SliceLocation",
		label: "スライス位置",
		position: "bottomRight",
	},
	{
		id: "imagePosition",
		tag: "ImagePositionPatient",
		label: "画像位置",
		position: "bottomRight",
	},
];
