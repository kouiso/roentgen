// 操作パネル（renkeibox ViewerControlPanel.tsx 参考）
import type { ViewerControlType } from "@/types/viewer";
import { VIEWER_CONTROL_TYPE } from "@/types/viewer";

type ControlPanelProps = {
	activeMode: ViewerControlType;
	onModeChange: (mode: ViewerControlType) => void;
	onFitSize: () => void;
	onOneToOne: () => void;
	onToggleInvert: () => void;
	onReset: () => void;
	onRotateCW: () => void;
	onRotateCCW: () => void;
	onFlipH: () => void;
	onFlipV: () => void;
	showOverlay: boolean;
	onToggleOverlay: () => void;
	showDirection: boolean;
	onToggleDirection: () => void;
};

type ButtonProps = {
	label: string;
	onClick: () => void;
	active?: boolean;
	disabled?: boolean;
};

const ToolButton = ({ label, onClick, active, disabled }: ButtonProps) => (
	<button
		type="button"
		onClick={onClick}
		disabled={disabled}
		className={`rounded px-2 py-1 text-xs transition-colors ${
			active
				? "bg-blue-600 text-white"
				: disabled
					? "cursor-not-allowed bg-neutral-800 text-neutral-600"
					: "bg-neutral-800 text-neutral-300 hover:bg-neutral-700"
		}`}
	>
		{label}
	</button>
);

export const ControlPanel = ({
	activeMode,
	onModeChange,
	onFitSize,
	onOneToOne,
	onToggleInvert,
	onReset,
	onRotateCW,
	onRotateCCW,
	onFlipH,
	onFlipV,
	showOverlay,
	onToggleOverlay,
	showDirection,
	onToggleDirection,
}: ControlPanelProps) => {
	return (
		<div className="flex shrink-0 flex-wrap items-center gap-1 border-b border-neutral-800 bg-neutral-900 px-3 py-1.5">
			{/* 操作モード */}
			<div className="flex gap-0.5 rounded bg-neutral-800 p-0.5">
				<ToolButton
					label="WW/WC"
					onClick={() => onModeChange(VIEWER_CONTROL_TYPE.WW_WC)}
					active={activeMode === VIEWER_CONTROL_TYPE.WW_WC}
				/>
				<ToolButton
					label="ズーム"
					onClick={() => onModeChange(VIEWER_CONTROL_TYPE.ZOOM)}
					active={activeMode === VIEWER_CONTROL_TYPE.ZOOM}
				/>
				<ToolButton
					label="パン"
					onClick={() => onModeChange(VIEWER_CONTROL_TYPE.PAN)}
					active={activeMode === VIEWER_CONTROL_TYPE.PAN}
				/>
			</div>

			<div className="mx-1 h-4 w-px bg-neutral-700" />

			{/* 表示操作 */}
			<ToolButton label="フィット" onClick={onFitSize} />
			<ToolButton label="1:1" onClick={onOneToOne} />
			<ToolButton label="反転" onClick={onToggleInvert} />

			<div className="mx-1 h-4 w-px bg-neutral-700" />

			{/* 回転・反転 */}
			<ToolButton label="↻90°" onClick={onRotateCW} />
			<ToolButton label="↺90°" onClick={onRotateCCW} />
			<ToolButton label="↔" onClick={onFlipH} />
			<ToolButton label="↕" onClick={onFlipV} />

			<div className="mx-1 h-4 w-px bg-neutral-700" />

			{/* オーバーレイトグル */}
			<ToolButton
				label="情報"
				onClick={onToggleOverlay}
				active={showOverlay}
			/>
			<ToolButton
				label="方向"
				onClick={onToggleDirection}
				active={showDirection}
			/>

			<div className="mx-1 h-4 w-px bg-neutral-700" />

			{/* リセット */}
			<ToolButton label="リセット" onClick={onReset} />

			{/* P2: 将来拡張用スタブ（disabled） */}
			<div className="mx-1 h-4 w-px bg-neutral-700" />
			<ToolButton label="プリセット" onClick={() => {}} disabled />
			<ToolButton label="虫眼鏡" onClick={() => {}} disabled />

			<div className="mx-1 h-4 w-px bg-neutral-700" />
			<ToolButton label="直線" onClick={() => {}} disabled />
			<ToolButton label="矢印" onClick={() => {}} disabled />
			<ToolButton label="四角" onClick={() => {}} disabled />
			<ToolButton label="円" onClick={() => {}} disabled />
			<ToolButton label="文字" onClick={() => {}} disabled />

			<div className="mx-1 h-4 w-px bg-neutral-700" />
			<ToolButton label="距離" onClick={() => {}} disabled />
			<ToolButton label="CT値" onClick={() => {}} disabled />
		</div>
	);
};
