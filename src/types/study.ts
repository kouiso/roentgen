// Study / Series グループ型定義
import type { DicomFileInfo } from "./dicom";

export type SeriesGroup = {
	seriesInstanceUID: string; // "" means unknown/ungrouped
	seriesNumber: number | null;
	seriesDescription: string;
	modality: string;
	files: DicomFileInfo[];
};

export type StudyGroup = {
	studyInstanceUID: string;
	studyDate: string;
	studyDescription: string;
	patientName: string;
	series: SeriesGroup[];
};
