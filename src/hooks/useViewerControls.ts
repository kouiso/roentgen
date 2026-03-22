// ビューア操作機能（renkeibox useDicom.ts + useRender.ts 参考）
// WW/WC: cornerstone側で処理 → OSD再描画
// ズーム/パン: OSD.viewportに委譲
import { useCallback } from "react";
import type { ViewerWorldInfo } from "@/types/viewer";

type OSDViewport = {
	getZoom: () => number;
	zoomTo: (zoom: number) => void;
	zoomBy: (factor: number) => void;
	panBy: (delta: { x: number; y: number }) => void;
	fitBounds: (rect: { x: number; y: number; width: number; height: number }) => void;
	getHomeBounds: () => { x: number; y: number; width: number; height: number };
};

type UseViewerControlsProps = {
	setWorldInfo: React.Dispatch<React.SetStateAction<ViewerWorldInfo>>;
	triggerRedraw: () => void;
	getViewport: () => OSDViewport | null;
};

export const useViewerControls = ({
	setWorldInfo,
	triggerRedraw,
	getViewport,
}: UseViewerControlsProps) => {
	// WW/WC変更（マウスドラッグで呼ばれる）
	const setWwWc = useCallback(
		(ww: number, wc: number) => {
			setWorldInfo((prev) => ({
				...prev,
				windowWidth: Math.max(1, ww),
				windowCenter: wc,
			}));
			triggerRedraw();
		},
		[setWorldInfo, triggerRedraw],
	);

	// WW/WCをデルタ値で変更（マウスドラッグ用）
	const adjustWwWc = useCallback(
		(deltaWW: number, deltaWC: number) => {
			setWorldInfo((prev) => ({
				...prev,
				windowWidth: Math.max(1, prev.windowWidth + deltaWW),
				windowCenter: prev.windowCenter + deltaWC,
			}));
			triggerRedraw();
		},
		[setWorldInfo, triggerRedraw],
	);

	// 白黒反転
	const toggleInvert = useCallback(() => {
		setWorldInfo((prev) => ({
			...prev,
			invert: !prev.invert,
		}));
		triggerRedraw();
	}, [setWorldInfo, triggerRedraw]);

	// 枠サイズフィット（OSD.viewport.fitBounds）
	const fitSize = useCallback(() => {
		const viewport = getViewport();
		if (!viewport) return;
		const bounds = viewport.getHomeBounds();
		viewport.fitBounds(bounds);
	}, [getViewport]);

	// 1:1表示
	const oneToOneSize = useCallback(() => {
		const viewport = getViewport();
		if (!viewport) return;
		viewport.zoomTo(1);
	}, [getViewport]);

	// ズーム
	const zoomBy = useCallback(
		(factor: number) => {
			const viewport = getViewport();
			if (!viewport) return;
			viewport.zoomBy(factor);
		},
		[getViewport],
	);

	// パン
	const panBy = useCallback(
		(deltaX: number, deltaY: number) => {
			const viewport = getViewport();
			if (!viewport) return;
			viewport.panBy({ x: deltaX, y: deltaY });
		},
		[getViewport],
	);

	// リセット（cornerstone viewport + OSD viewport両方を初期値に戻す）
	const resetImage = useCallback(
		(initialWW: number, initialWC: number) => {
			setWorldInfo((prev) => ({
				...prev,
				windowWidth: initialWW,
				windowCenter: initialWC,
				invert: false,
				rotation: 0,
				flipHorizontal: false,
				flipVertical: false,
			}));

			const viewport = getViewport();
			if (viewport) {
				const bounds = viewport.getHomeBounds();
				viewport.fitBounds(bounds);
			}

			triggerRedraw();
		},
		[setWorldInfo, getViewport, triggerRedraw],
	);

	// 回転（90度単位）
	const rotate = useCallback(
		(degrees: number) => {
			setWorldInfo((prev) => ({
				...prev,
				rotation: (prev.rotation + degrees) % 360,
			}));
			triggerRedraw();
		},
		[setWorldInfo, triggerRedraw],
	);

	// 水平反転
	const toggleFlipHorizontal = useCallback(() => {
		setWorldInfo((prev) => ({
			...prev,
			flipHorizontal: !prev.flipHorizontal,
		}));
		triggerRedraw();
	}, [setWorldInfo, triggerRedraw]);

	// 垂直反転
	const toggleFlipVertical = useCallback(() => {
		setWorldInfo((prev) => ({
			...prev,
			flipVertical: !prev.flipVertical,
		}));
		triggerRedraw();
	}, [setWorldInfo, triggerRedraw]);

	return {
		setWwWc,
		adjustWwWc,
		toggleInvert,
		fitSize,
		oneToOneSize,
		zoomBy,
		panBy,
		resetImage,
		rotate,
		toggleFlipHorizontal,
		toggleFlipVertical,
	};
};
