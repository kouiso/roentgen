import * as dicomParser from "dicom-parser";

export type DicomdirEntry = {
	type: "PATIENT" | "STUDY" | "SERIES" | "IMAGE";
	referencedFileId: string | null;
	patientName?: string;
	studyDescription?: string;
	seriesDescription?: string;
};

type DicomdirRecordType = DicomdirEntry["type"];

type DicomDataSetLike = {
	string: (tag: string) => string | undefined;
	elements: Record<string, DicomElementLike | undefined>;
};

type DicomElementLike = {
	items?: DicomItemLike[];
};

type DicomItemLike = {
	dataSet?: DicomDataSetLike;
};

const DIRECTORY_RECORD_SEQUENCE = "x00041220";
const DIRECTORY_RECORD_TYPE = "x00041430";
const REFERENCED_FILE_ID = "x00041500";
const PATIENT_NAME = "x00100010";
const STUDY_DESCRIPTION = "x00081030";
const SERIES_DESCRIPTION = "x0008103e";

const isDicomdirRecordType = (
	value: string | undefined,
): value is DicomdirRecordType =>
	value === "PATIENT" ||
	value === "STUDY" ||
	value === "SERIES" ||
	value === "IMAGE";

const trimDicomString = (value: string | undefined): string | undefined => {
	const trimmed = value?.replace(/\0+$/g, "").trim();
	return trimmed ? trimmed : undefined;
};

export const parseDicomdir = (data: ArrayBuffer): DicomdirEntry[] => {
	const dataSet = dicomParser.parseDicom(
		new Uint8Array(data),
	) as DicomDataSetLike;
	const sequence = dataSet.elements[DIRECTORY_RECORD_SEQUENCE];
	if (!sequence?.items) return [];

	const entries: DicomdirEntry[] = [];
	for (const item of sequence.items) {
		const recordDataSet = item.dataSet;
		if (!recordDataSet) continue;

		const type = trimDicomString(
			recordDataSet.string(DIRECTORY_RECORD_TYPE),
		)?.toUpperCase();
		if (!isDicomdirRecordType(type)) continue;

		const entry: DicomdirEntry = {
			type,
			referencedFileId:
				type === "IMAGE"
					? (trimDicomString(recordDataSet.string(REFERENCED_FILE_ID)) ?? null)
					: null,
		};

		const patientName = trimDicomString(recordDataSet.string(PATIENT_NAME));
		const studyDescription = trimDicomString(
			recordDataSet.string(STUDY_DESCRIPTION),
		);
		const seriesDescription = trimDicomString(
			recordDataSet.string(SERIES_DESCRIPTION),
		);

		if (patientName) entry.patientName = patientName;
		if (studyDescription) entry.studyDescription = studyDescription;
		if (seriesDescription) entry.seriesDescription = seriesDescription;

		entries.push(entry);
	}

	return entries;
};
