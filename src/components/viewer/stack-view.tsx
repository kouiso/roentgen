// メインビュー: OSD + cornerstone Canvas（renkeibox StackView.tsx 移植）
// OSDがタイル管理・ビューポート制御、cornerstoneがDICOM固有処理を担当
import { useEffect, useRef } from "react";

type StackViewProps = {
	containerId: string;
	onViewerReady?: (container: HTMLDivElement) => void;
};

export const StackView = ({ containerId, onViewerReady }: StackViewProps) => {
	const containerRef = useRef<HTMLDivElement>(null);
	const isInitialized = useRef(false);

	useEffect(() => {
		if (containerRef.current && !isInitialized.current) {
			isInitialized.current = true;
			onViewerReady?.(containerRef.current);
		}
		// StrictMode対応: cleanup時にフラグをリセットし、re-mount時に再初期化を許可
		return () => {
			isInitialized.current = false;
		};
	}, [onViewerReady]);

	return (
		<div className="absolute inset-0 overflow-hidden bg-black">
			<div
				ref={containerRef}
				id={containerId}
				className="h-full w-full"
				style={{ background: "#000" }}
			/>
		</div>
	);
};
