// DICOMファイル情報
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
	// Patient Orientation (0020,0020)。一般撮影(DX/CR)は IOP を持たずこちらだけのことが多い
	patientOrientation: PatientOrientation | null;
	// Anatomical Orientation Type (0010,2210)。未設定は規格上 BIPED 扱い
	anatomicalOrientationType: AnatomicalOrientationType;
	sliceThickness: number | null;
	sliceLocation: number | null;
	instanceNumber: number | null;
	// Modality LUT
	modalityLutSequence: ModalityLutData | null;
	// VOI LUT
	voiLutSequence: VoiLutData | null;
	// Study / Series 識別子
	studyInstanceUID: string | null;
	seriesInstanceUID: string | null;
	// DICOMオーバーレイプレーン（60xx,3000）
	overlayData: OverlayPlaneData[];
	// DICOMタグ全体（オーバーレイ表示用）
	tags: Record<string, string>;
	// サムネイル用プリレンダリング済みRGBAデータ（100x80）
	thumbnailData: Uint8ClampedArray | null;
};

export type AnatomicalOrientationType = "BIPED" | "QUADRUPED";

// 画像の右方向（行）と下方向（列）の解剖学的方向。値は DICOM の略号のまま保持する
export type PatientOrientation = {
	row: string;
	column: string;
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

// 個別ファイルの読込エラー情報
export type DicomFileError = {
	filePath: string;
	reason: "corrupt" | "not-dicom" | "read-error";
	detail: string;
};

// DICOM画像の読み込み状態
export type DicomLoadState =
	| { status: "idle" }
	| { status: "loading"; progress: number; cancelRequested?: boolean }
	| {
			status: "loaded";
			files: DicomFileInfo[];
			skipped: DicomFileError[];
	  }
	| { status: "error"; message: string; skipped?: DicomFileError[] }
	| { status: "cancelled" };
