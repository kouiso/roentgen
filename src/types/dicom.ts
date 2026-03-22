// DICOMファイル情報（renkeibox models/Viewer/DicomFileInfo 参考）
export type DicomFileInfo = {
	imageId: string;
	filePath: string;
	fileName: string;
	frameIndex: number;
	totalFrames: number;
	rows: number;
	columns: number;
	bitsAllocated: number;
	bitsStored: number;
	highBit: number;
	pixelRepresentation: number;
	samplesPerPixel: number;
	photometricInterpretation: string;
	rescaleIntercept: number;
	rescaleSlope: number;
	windowCenter: number;
	windowWidth: number;
	pixelSpacing: [number, number] | null;
	imageOrientationPatient: number[] | null;
	imagePositionPatient: number[] | null;
	sliceThickness: number | null;
	sliceLocation: number | null;
	instanceNumber: number | null;
	// Modality LUT
	modalityLutSequence: ModalityLutData | null;
	// VOI LUT
	voiLutSequence: VoiLutData | null;
	// DICOMオーバーレイプレーン（60xx,3000）
	overlayData: OverlayPlaneData[];
	// DICOMタグ全体（オーバーレイ表示用）
	tags: Record<string, string>;
	// 元のDICOMファイルデータ（cornerstoneのimageLoader用）
	rawData: ArrayBuffer;
};

// Modality LUT データ
export type ModalityLutData = {
	firstInputValue: number;
	numberOfEntries: number;
	bitsStored: number;
	lutData: number[];
};

// VOI LUT データ
export type VoiLutData = {
	firstInputValue: number;
	numberOfEntries: number;
	bitsStored: number;
	lutData: number[];
};

// DICOMオーバーレイプレーン（60xx,3000タグ）
export type OverlayPlaneData = {
	groupNumber: number;
	rows: number;
	columns: number;
	originRow: number;
	originCol: number;
	bitsAllocated: number;
	bitPosition: number;
	data: Uint8Array;
};

// DICOM画像の読み込み状態
export type DicomLoadState =
	| { status: "idle" }
	| { status: "loading"; progress: number }
	| { status: "loaded"; files: DicomFileInfo[] }
	| { status: "error"; message: string };
