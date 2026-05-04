import type { DicomFileInfo } from "../types/dicom";

export type PrintImageMetadata = {
	patientName: string;
	studyDate: string;
	modality: string;
	description: string;
};

const EMPTY_VALUE = "未設定";

const normalizeMetadataValue = (value: string | undefined): string => {
	const normalized = value?.trim();
	return normalized ? normalized : EMPTY_VALUE;
};

export const formatDicomDateForPrint = (value: string | undefined): string => {
	const normalized = value?.trim();
	if (!normalized) return EMPTY_VALUE;
	if (!/^\d{8}$/.test(normalized)) return normalized;
	return `${normalized.slice(0, 4)}/${normalized.slice(4, 6)}/${normalized.slice(6, 8)}`;
};

export const formatDicomPersonNameForPrint = (
	value: string | undefined,
): string => {
	const normalized = value?.replace(/\^+/g, " ").replace(/\s+/g, " ").trim();
	return normalized ? normalized : EMPTY_VALUE;
};

export const buildPrintImageMetadata = (
	fileInfo: DicomFileInfo | null,
): PrintImageMetadata => {
	const tags = fileInfo?.tags ?? {};
	const studyDescription = tags.StudyDescription?.trim() ?? "";
	const seriesDescription = tags.SeriesDescription?.trim() ?? "";
	const description =
		studyDescription &&
		seriesDescription &&
		studyDescription !== seriesDescription
			? `${studyDescription} / ${seriesDescription}`
			: studyDescription || seriesDescription;

	return {
		patientName: formatDicomPersonNameForPrint(tags.PatientName),
		studyDate: formatDicomDateForPrint(tags.StudyDate),
		modality: normalizeMetadataValue(tags.Modality),
		description: normalizeMetadataValue(description),
	};
};

const escapeHtml = (value: string): string =>
	value
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;");

export const createPrintImageHtml = (
	imageDataUrl: string,
	metadata: PrintImageMetadata,
): string => {
	const items: { label: string; value: string }[] = [
		{ label: "患者名", value: metadata.patientName },
		{ label: "検査日", value: metadata.studyDate },
		{ label: "モダリティ", value: metadata.modality },
		{ label: "説明", value: metadata.description },
	];
	const metadataHtml = items
		.map(
			(item) => `
				<div class="metadata-item">
					<dt>${escapeHtml(item.label)}</dt>
					<dd>${escapeHtml(item.value)}</dd>
				</div>`,
		)
		.join("");

	return `<!doctype html>
<html lang="ja">
<head>
	<meta charset="utf-8" />
	<title>Roentgen 印刷</title>
	<style>
		@page {
			margin: 14mm;
		}

		* {
			box-sizing: border-box;
		}

		body {
			margin: 0;
			background: #ffffff;
			color: #111827;
			font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
		}

		header {
			border-bottom: 1px solid #d1d5db;
			margin-bottom: 16px;
			padding-bottom: 12px;
		}

		h1 {
			font-size: 15px;
			font-weight: 650;
			letter-spacing: 0;
			margin: 0 0 10px;
		}

		dl {
			display: grid;
			gap: 8px 18px;
			grid-template-columns: repeat(2, minmax(0, 1fr));
			margin: 0;
		}

		.metadata-item {
			display: grid;
			gap: 3px;
			min-width: 0;
		}

		dt {
			color: #4b5563;
			font-size: 10px;
			font-weight: 600;
			margin: 0;
		}

		dd {
			font-size: 12px;
			margin: 0;
			overflow-wrap: anywhere;
		}

		main {
			align-items: center;
			display: flex;
			justify-content: center;
			min-height: 0;
		}

		img {
			display: block;
			max-height: calc(100vh - 128px);
			max-width: 100%;
			object-fit: contain;
		}

		@media print {
			img {
				max-height: calc(100vh - 120px);
			}
		}
	</style>
</head>
<body>
	<header>
		<h1>DICOM画像</h1>
		<dl>${metadataHtml}
		</dl>
	</header>
	<main>
		<img src="${escapeHtml(imageDataUrl)}" alt="DICOM画像" />
	</main>
</body>
</html>`;
};
