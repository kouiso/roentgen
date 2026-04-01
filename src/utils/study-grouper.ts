// Study/Series グループ化ユーティリティ
import type { DicomFileInfo } from "@/types/dicom";
import type { SeriesGroup, StudyGroup } from "@/types/study";

export const groupByStudySeries = (files: DicomFileInfo[]): StudyGroup[] => {
	const studyMap = new Map<string, StudyGroup>();

	for (const file of files) {
		const studyUID = file.studyInstanceUID ?? "__unknown__";
		const seriesUID = file.seriesInstanceUID ?? "__unknown__";

		if (!studyMap.has(studyUID)) {
			studyMap.set(studyUID, {
				studyInstanceUID: studyUID,
				studyDate: file.tags.StudyDate ?? "",
				studyDescription: file.tags.StudyDescription ?? "",
				patientName: file.tags.PatientName ?? "",
				series: [],
			});
		}

		const study = studyMap.get(studyUID) as StudyGroup;
		let series = study.series.find((s) => s.seriesInstanceUID === seriesUID);

		if (!series) {
			const seriesNumStr = file.tags.SeriesNumber;
			series = {
				seriesInstanceUID: seriesUID,
				seriesNumber: seriesNumStr ? Number.parseInt(seriesNumStr, 10) : null,
				seriesDescription: file.tags.SeriesDescription ?? "",
				modality: file.tags.Modality ?? "",
				files: [],
			};
			study.series.push(series);
		}

		series.files.push(file);
	}

	// SeriesNumber順→InstanceNumber順でソート
	for (const study of studyMap.values()) {
		study.series.sort(
			(a, b) => (a.seriesNumber ?? 999) - (b.seriesNumber ?? 999),
		);
		for (const series of study.series) {
			series.files.sort(
				(a, b) => (a.instanceNumber ?? 0) - (b.instanceNumber ?? 0),
			);
		}
	}

	return [...studyMap.values()];
};

// 全シリーズをフラットリストで取得
export const getAllSeries = (studies: StudyGroup[]): SeriesGroup[] => {
	return studies.flatMap((s) => s.series);
};
