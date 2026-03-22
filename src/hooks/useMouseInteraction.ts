// マウスインタラクション管理（renkeibox useDicom.ts + useShortcut.ts 参考）
// WW/WCドラッグ、モード切替（左+右同時押し）をOSD上で実現
import { useCallback, useEffect, useRef } from "react";
import type { ViewerControlType } from "@/types/viewer";
import { VIEWER_CONTROL_TYPE } from "@/types/viewer";

type UseMouseInteractionProps = {
	containerId: string;
	activeMode: ViewerControlType;
	onModeChange: (mode: ViewerControlType) => void;
	adjustWwWc: (deltaWW: number, deltaWC: number) => void;
	onNextFrame: () => void;
	onPrevFrame: () => void;
	enabled: boolean;
};

// マウスショートカット切替の順番（renkeibox useShortcut.ts 参考）
const MODE_CYCLE: ViewerControlType[] = [
	VIEWER_CONTROL_TYPE.WW_WC,
	VIEWER_CONTROL_TYPE.ZOOM,
	VIEWER_CONTROL_TYPE.PAN,
];

export const useMouseInteraction = ({
	containerId,
	activeMode,
	onModeChange,
	adjustWwWc,
	onNextFrame,
	onPrevFrame,
	enabled,
}: UseMouseInteractionProps) => {
	const isDraggingRef = useRef(false);
	const lastMouseRef = useRef({ x: 0, y: 0 });
	const activeModeRef = useRef(activeMode);
	const bothButtonsRef = useRef(false);

	useEffect(() => {
		activeModeRef.current = activeMode;
	}, [activeMode]);

	const handleMouseDown = useCallback(
		(e: MouseEvent) => {
			// 左+右同時押し検出（renkeibox useShortcut.ts: マウスショートカット切替）
			if (e.buttons === 3) {
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
			}
		},
		[onModeChange],
	);

	const handleMouseMove = useCallback(
		(e: MouseEvent) => {
			if (!isDraggingRef.current || bothButtonsRef.current) return;

			const deltaX = e.clientX - lastMouseRef.current.x;
			const deltaY = e.clientY - lastMouseRef.current.y;
			lastMouseRef.current = { x: e.clientX, y: e.clientY };

			// WW/WCモードの場合のみカスタム処理
			// ズーム・パンモードはOSD標準機能に委譲
			if (activeModeRef.current === VIEWER_CONTROL_TYPE.WW_WC) {
				// 水平ドラッグ → WW（コントラスト）変更
				// 垂直ドラッグ → WC（明るさ）変更
				adjustWwWc(deltaX, -deltaY);
			}
		},
		[adjustWwWc],
	);

	const handleMouseUp = useCallback(() => {
		isDraggingRef.current = false;
		bothButtonsRef.current = false;
	}, []);

	const onNextFrameRef = useRef(onNextFrame);
	const onPrevFrameRef = useRef(onPrevFrame);
	useEffect(() => {
		onNextFrameRef.current = onNextFrame;
		onPrevFrameRef.current = onPrevFrame;
	}, [onNextFrame, onPrevFrame]);

	// ホイールでスタックフレーム切替（renkeibox useDicom.ts: doChangeFrame 参考）
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
