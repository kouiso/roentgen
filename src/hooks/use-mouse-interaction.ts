// マウスインタラクション管理
// WW/WCドラッグ、モード切替（左+右同時押し）をOSD上で実現
import { useCallback, useEffect, useRef } from "react";
import type { ViewerControlType } from "@/types/viewer";
import { VIEWER_CONTROL_TYPE } from "@/types/viewer";

type UseMouseInteractionProps = {
	containerId: string;
	activeMode: ViewerControlType;
	onModeChange: (mode: ViewerControlType) => void;
	adjustWwWc: (deltaWW: number, deltaWC: number) => void;
	zoomBy: (factor: number) => void;
	panBy: (deltaX: number, deltaY: number) => void;
	currentWindowWidth: number;
	onNextFrame: () => void;
	onPrevFrame: () => void;
	enabled: boolean;
};

// マウスショートカット切替の順番
const MODE_CYCLE: ViewerControlType[] = [
	VIEWER_CONTROL_TYPE.WW_WC,
	VIEWER_CONTROL_TYPE.ZOOM,
	VIEWER_CONTROL_TYPE.PAN,
];

const CURSOR_LAYER_SELECTOR =
	".openseadragon-container, .openseadragon-canvas, canvas";

const updateViewerCursor = (container: HTMLElement, cursor: string) => {
	container.style.cursor = cursor;
	for (const element of container.querySelectorAll<HTMLElement>(
		CURSOR_LAYER_SELECTOR,
	)) {
		element.style.cursor = cursor;
	}
};

export const useMouseInteraction = ({
	containerId,
	activeMode,
	onModeChange,
	adjustWwWc,
	zoomBy,
	panBy,
	currentWindowWidth,
	onNextFrame,
	onPrevFrame,
	enabled,
}: UseMouseInteractionProps) => {
	const isDraggingRef = useRef(false);
	const lastMouseRef = useRef({ x: 0, y: 0 });
	const activeModeRef = useRef(activeMode);
	const currentWindowWidthRef = useRef(currentWindowWidth);
	const windowMouseUpHandlerRef = useRef<((e: MouseEvent) => void) | null>(
		null,
	);
	const bothButtonsRef = useRef(false);

	useEffect(() => {
		activeModeRef.current = activeMode;
	}, [activeMode]);

	useEffect(() => {
		currentWindowWidthRef.current = currentWindowWidth;
	}, [currentWindowWidth]);

	// モード変更時のカーソル更新
	useEffect(() => {
		if (!enabled) return;
		const container = document.getElementById(containerId);
		if (!container) return;
		updateViewerCursor(
			container,
			activeMode === VIEWER_CONTROL_TYPE.PAN ? "grab" : "default",
		);
		return () => {
			updateViewerCursor(container, "");
		};
	}, [containerId, activeMode, enabled]);

	const zoomByRef = useRef(zoomBy);
	const panByRef = useRef(panBy);
	useEffect(() => {
		zoomByRef.current = zoomBy;
	}, [zoomBy]);
	useEffect(() => {
		panByRef.current = panBy;
	}, [panBy]);

	const handleMouseMove = useCallback(
		(e: MouseEvent) => {
			if (!isDraggingRef.current || bothButtonsRef.current) return;

			const deltaX = e.clientX - lastMouseRef.current.x;
			const deltaY = e.clientY - lastMouseRef.current.y;
			lastMouseRef.current = { x: e.clientX, y: e.clientY };

			switch (activeModeRef.current) {
				case VIEWER_CONTROL_TYPE.WW_WC: {
					// 水平ドラッグ → WW（コントラスト）変更
					// 垂直ドラッグ → WC（明るさ）変更
					const container = document.getElementById(containerId);
					const containerWidth = container?.clientWidth || 1;
					const scale = currentWindowWidthRef.current / containerWidth + 1;
					adjustWwWc(deltaX * scale, -deltaY * scale);
					break;
				}
				case VIEWER_CONTROL_TYPE.ZOOM:
					// 縦ドラッグで拡大縮小
					zoomByRef.current(1 - deltaY * 0.005);
					break;
				case VIEWER_CONTROL_TYPE.PAN: {
					// ドラッグでパン（OSD viewport座標系: 画像幅=1.0）
					const container = document.getElementById(containerId);
					if (container) {
						const w = container.clientWidth || 1;
						panByRef.current(-deltaX / w, -deltaY / w);
					}
					break;
				}
			}
		},
		[adjustWwWc, containerId],
	);

	const handleMouseUp = useCallback(() => {
		if (windowMouseUpHandlerRef.current) {
			window.removeEventListener("mouseup", windowMouseUpHandlerRef.current);
			windowMouseUpHandlerRef.current = null;
		}
		isDraggingRef.current = false;
		bothButtonsRef.current = false;
		if (activeModeRef.current === VIEWER_CONTROL_TYPE.PAN) {
			const container = document.getElementById(containerId);
			if (container) updateViewerCursor(container, "grab");
		}
	}, [containerId]);

	const handleMouseDown = useCallback(
		(e: MouseEvent) => {
			// 左+右同時押し検出
			if (
				e.buttons === 3 ||
				(e.shiftKey && e.button === 0 && e.buttons === 1)
			) {
				bothButtonsRef.current = true;
				const currentIdx = MODE_CYCLE.indexOf(activeModeRef.current);
				const nextIdx = (currentIdx + 1) % MODE_CYCLE.length;
				const nextMode = MODE_CYCLE[nextIdx];
				if (nextMode) {
					onModeChange(nextMode);
				}
				e.preventDefault();
				return;
			}

			// 左ボタンのみでドラッグ開始
			if (e.button === 0) {
				isDraggingRef.current = true;
				lastMouseRef.current = { x: e.clientX, y: e.clientY };
				bothButtonsRef.current = false;
				windowMouseUpHandlerRef.current = handleMouseUp;
				window.addEventListener("mouseup", handleMouseUp, { once: true });
				if (activeModeRef.current === VIEWER_CONTROL_TYPE.PAN) {
					const container = document.getElementById(containerId);
					if (container) updateViewerCursor(container, "grabbing");
				}
			}
		},
		[onModeChange, containerId, handleMouseUp],
	);

	const onNextFrameRef = useRef(onNextFrame);
	const onPrevFrameRef = useRef(onPrevFrame);
	useEffect(() => {
		onNextFrameRef.current = onNextFrame;
		onPrevFrameRef.current = onPrevFrame;
	}, [onNextFrame, onPrevFrame]);

	// ホイールでスタックフレーム切替
	const handleWheel = useCallback((e: WheelEvent) => {
		e.preventDefault();
		if (e.deltaY > 0) {
			onNextFrameRef.current();
		} else if (e.deltaY < 0) {
			onPrevFrameRef.current();
		}
	}, []);

	// コンテキストメニュー抑制（右クリック）
	const handleContextMenu = useCallback((e: MouseEvent) => {
		e.preventDefault();
	}, []);

	useEffect(() => {
		if (!enabled) return;

		const container = document.getElementById(containerId);
		if (!container) return;

		container.addEventListener("mousedown", handleMouseDown);
		container.addEventListener("mousemove", handleMouseMove);
		container.addEventListener("mouseup", handleMouseUp);
		container.addEventListener("mouseleave", handleMouseUp);
		container.addEventListener("wheel", handleWheel, { passive: false });
		container.addEventListener("contextmenu", handleContextMenu);

		return () => {
			if (windowMouseUpHandlerRef.current) {
				window.removeEventListener("mouseup", windowMouseUpHandlerRef.current);
				windowMouseUpHandlerRef.current = null;
			}
			container.removeEventListener("mousedown", handleMouseDown);
			container.removeEventListener("mousemove", handleMouseMove);
			container.removeEventListener("mouseup", handleMouseUp);
			container.removeEventListener("mouseleave", handleMouseUp);
			container.removeEventListener("wheel", handleWheel);
			container.removeEventListener("contextmenu", handleContextMenu);
		};
	}, [
		containerId,
		enabled,
		handleMouseDown,
		handleMouseMove,
		handleMouseUp,
		handleWheel,
		handleContextMenu,
	]);
};
