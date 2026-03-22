// 操作パネル — lucide-reactアイコン + ツールチップ（renkeibox ViewerControlPanel.tsx 参考）
import type { ViewerControlType } from "@/types/viewer";
import { VIEWER_CONTROL_TYPE } from "@/types/viewer";
import {
	Contrast,
	FlipHorizontal2,
	FlipVertical2,
	Maximize,
	Move,
	RefreshCw,
	RotateCcw,
	RotateCw,
	Scan,
	ZoomIn,
	// P2スタブ用
	Circle,
	Pencil,
	Ruler,
	Search,
	Slash,
	Square,
	Type,
	ArrowUpRight,
	Gauge,
	Eye,
	EyeOff,
	Compass,
} from "lucide-react";
import { type ReactNode, useCallback, useRef, useState } from "react";

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

// ツールチップ付きボタン
type IconButtonProps = {
	icon: ReactNode;
	tooltip: string;
	onClick: () => void;
	active?: boolean;
	disabled?: boolean;
};

const Tooltip = ({ text, children }: { text: string; children: ReactNode }) => {
	const [show, setShow] = useState(false);
	const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	const handleEnter = useCallback(() => {
		timeoutRef.current = setTimeout(() => setShow(true), 400);
	}, []);

	const handleLeave = useCallback(() => {
		if (timeoutRef.current) clearTimeout(timeoutRef.current);
		setShow(false);
	}, []);

	return (
		<div className="relative" onMouseEnter={handleEnter} onMouseLeave={handleLeave}>
			{children}
			{show && (
				<div className="pointer-events-none absolute top-full left-1/2 z-50 mt-1.5 -translate-x-1/2 whitespace-nowrap rounded bg-neutral-800 px-2 py-1 text-xs text-neutral-200 shadow-lg">
					{text}
				</div>
			)}
		</div>
	);
};

const IconButton = ({ icon, tooltip, onClick, active, disabled }: IconButtonProps) => (
	<Tooltip text={tooltip}>
		<button
			type="button"
			onClick={onClick}
			disabled={disabled}
			className={`flex items-center justify-center rounded p-1.5 transition-colors ${
				active
					? "bg-blue-600 text-white shadow-sm shadow-blue-500/30"
					: disabled
						? "cursor-not-allowed text-neutral-700"
						: "text-neutral-400 hover:bg-neutral-700/60 hover:text-neutral-200"
			}`}
		>
			{icon}
		</button>
	</Tooltip>
);

const Divider = () => <div className="mx-0.5 h-6 w-px bg-neutral-700/50" />;

const SIZE = 16;

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
		<div className="flex shrink-0 items-center gap-0.5 border-b border-neutral-800/80 bg-neutral-900/95 px-2 py-1">
			{/* 操作モード */}
			<div className="flex gap-0.5 rounded-md bg-neutral-800/60 p-0.5">
				<IconButton
					icon={<Contrast size={SIZE} />}
					tooltip="WW/WC（濃度コントラスト）"
					onClick={() => onModeChange(VIEWER_CONTROL_TYPE.WW_WC)}
					active={activeMode === VIEWER_CONTROL_TYPE.WW_WC}
				/>
				<IconButton
					icon={<ZoomIn size={SIZE} />}
					tooltip="ズーム"
					onClick={() => onModeChange(VIEWER_CONTROL_TYPE.ZOOM)}
					active={activeMode === VIEWER_CONTROL_TYPE.ZOOM}
				/>
				<IconButton
					icon={<Move size={SIZE} />}
					tooltip="パン（移動）"
					onClick={() => onModeChange(VIEWER_CONTROL_TYPE.PAN)}
					active={activeMode === VIEWER_CONTROL_TYPE.PAN}
				/>
			</div>

			<Divider />

			{/* 表示操作 */}
			<IconButton icon={<Maximize size={SIZE} />} tooltip="フィット" onClick={onFitSize} />
			<IconButton icon={<Scan size={SIZE} />} tooltip="1:1 原寸大" onClick={onOneToOne} />
			<IconButton icon={<RefreshCw size={SIZE} />} tooltip="白黒反転" onClick={onToggleInvert} />

			<Divider />

			{/* 回転・反転 */}
			<IconButton icon={<RotateCw size={SIZE} />} tooltip="右90°回転" onClick={onRotateCW} />
			<IconButton icon={<RotateCcw size={SIZE} />} tooltip="左90°回転" onClick={onRotateCCW} />
			<IconButton icon={<FlipHorizontal2 size={SIZE} />} tooltip="左右反転" onClick={onFlipH} />
			<IconButton icon={<FlipVertical2 size={SIZE} />} tooltip="上下反転" onClick={onFlipV} />

			<Divider />

			{/* オーバーレイトグル */}
			<IconButton
				icon={showOverlay ? <Eye size={SIZE} /> : <EyeOff size={SIZE} />}
				tooltip={showOverlay ? "情報オーバーレイ非表示" : "情報オーバーレイ表示"}
				onClick={onToggleOverlay}
				active={showOverlay}
			/>
			<IconButton
				icon={<Compass size={SIZE} />}
				tooltip={showDirection ? "方向マーカー非表示" : "方向マーカー表示"}
				onClick={onToggleDirection}
				active={showDirection}
			/>

			<Divider />

			{/* リセット */}
			<IconButton
				icon={<svg xmlns="http://www.w3.org/2000/svg" width={SIZE} height={SIZE} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /><path d="M3 3v5h5" /></svg>}
				tooltip="リセット"
				onClick={onReset}
			/>

			{/* P2: 将来拡張用スタブ */}
			<Divider />
			<IconButton icon={<Gauge size={SIZE} />} tooltip="プリセット（準備中）" onClick={() => {}} disabled />
			<IconButton icon={<Search size={SIZE} />} tooltip="虫眼鏡（準備中）" onClick={() => {}} disabled />

			<Divider />
			<IconButton icon={<Slash size={SIZE} />} tooltip="直線（準備中）" onClick={() => {}} disabled />
			<IconButton icon={<ArrowUpRight size={SIZE} />} tooltip="矢印（準備中）" onClick={() => {}} disabled />
			<IconButton icon={<Square size={SIZE} />} tooltip="四角（準備中）" onClick={() => {}} disabled />
			<IconButton icon={<Circle size={SIZE} />} tooltip="円（準備中）" onClick={() => {}} disabled />
			<IconButton icon={<Type size={SIZE} />} tooltip="文字（準備中）" onClick={() => {}} disabled />

			<Divider />
			<IconButton icon={<Ruler size={SIZE} />} tooltip="距離計測（準備中）" onClick={() => {}} disabled />
			<IconButton icon={<Pencil size={SIZE} />} tooltip="CT値計測（準備中）" onClick={() => {}} disabled />
		</div>
	);
};
