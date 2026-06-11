// メインビュー: OSD + cornerstone Canvas
// OSDがタイル管理・ビューポート制御、cornerstoneがDICOM固有処理を担当
import { useEffect, useRef } from "react";

type StackViewProps = {
	containerId: string;
	onViewerReady?: (container: HTMLDivElement) => void;
};

export const StackView = ({ containerId, onViewerReady }: StackViewProps) => {
	const containerRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (containerRef.current) {
			onViewerReady?.(containerRef.current);
		}
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
