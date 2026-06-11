// DICOMタグからオーバーレイ情報生成（renkeibox useOverlay.ts 参考）
import { useMemo } from "react";
import type { DicomFileInfo } from "@/types/dicom";
import type { ImageOverlayInfo, OverlayItem } from "@/types/overlay";
import { OVERLAY_ITEMS } from "@/utils/overlay-items";

// 計算タグの値を生成
const getComputedValue = (
	tag: string,
	fileInfo: DicomFileInfo,
): string | null => {
	switch (tag) {
		case "_imageSize":
			return `${fileInfo.rows} × ${fileInfo.columns}`;
		case "_bitsInfo":
			return `${fileInfo.bitsAllocated}bit (stored: ${fileInfo.bitsStored})`;
		default:
			return null;
	}
};

export const useImageOverlay = (
	fileInfo: DicomFileInfo | null,
	currentWW?: number,
	currentWC?: number,
): ImageOverlayInfo => {
	return useMemo(() => {
		const result: ImageOverlayInfo = {
			topLeft: [],
			topRight: [],
			bottomLeft: [],
			bottomRight: [],
		};

		if (!fileInfo) return result;

		for (const item of OVERLAY_ITEMS) {
			let value: string;

			// 計算タグ（_プレフィックス）
			if (item.tag.startsWith("_")) {
				const computed = getComputedValue(item.tag, fileInfo);
				if (!computed) continue;
				value = computed;
			} else if (item.tag === "WindowCenter") {
				// 動的WC値
				value = String(currentWC ?? fileInfo.windowCenter);
			} else if (item.tag === "WindowWidth") {
				// 動的WW値
				value = String(currentWW ?? fileInfo.windowWidth);
			} else {
				const rawValue = fileInfo.tags[item.tag];
				if (!rawValue) continue;
				value = item.format ? item.format(rawValue) : rawValue;
			}

			const overlayItem: OverlayItem = {
				id: item.id,
				label: item.label,
				value,
				position: item.position,
				bold: item.bold,
			};

			result[item.position].push(overlayItem);
		}

		return result;
	}, [fileInfo, currentWW, currentWC]);
};
