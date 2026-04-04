// 操作パネル — lucide-reactアイコン + ツールチップ（renkeibox ViewerControlPanel.tsx 参考）

import {
	Camera,
	ChevronDown,
	Columns2,
	Compass,
	Contrast,
	Eye,
	EyeOff,
	FlipHorizontal2,
	FlipVertical2,
	Grid2X2,
	LayoutPanelTop,
	Maximize,
	Maximize2,
	Minus,
	Move,
	Pause,
	Play,
	Plus,
	RefreshCw,
	RotateCcw,
	RotateCcwSquare,
	RotateCw,
	Ruler,
	Scan,
	Square,
	Trash2,
	Triangle,
	X,
	XCircle,
	ZoomIn,
} from "lucide-react";
import {
	type ReactNode,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";
import { WW_WC_PRESETS } from "@/constants/ww-wc-presets";
import { LAYOUT_TYPE, type LayoutType } from "@/types/layout";
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
	onClearSelected: () => void;
	onClearAll: () => void;
	// WW/WCプリセット
	onSetWwWc: (ww: number, wc: number) => void;
	// Cineモード
	isPlaying: boolean;
	fps: number;
	onTogglePlay: () => void;
	onIncreaseFps: () => void;
	onDecreaseFps: () => void;
	// スクリーンショット
	onScreenshot: () => void;
	// フルスクリーン
	isFullscreen: boolean;
	onToggleFullscreen: () => void;
	// 計測
	onClearMeasurements: () => void;
	hasMeasurements: boolean;
	// レイアウト選択
	layout: LayoutType;
	onSetLayout: (layout: LayoutType) => void;
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

	useEffect(() => {
		return () => {
			if (timeoutRef.current) clearTimeout(timeoutRef.current);
		};
	}, []);

	const handleEnter = useCallback(() => {
		timeoutRef.current = setTimeout(() => setShow(true), 400);
	}, []);

	const handleLeave = useCallback(() => {
		if (timeoutRef.current) clearTimeout(timeoutRef.current);
		setShow(false);
	}, []);

	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: ツールチップのhover検出用ラッパー（装飾目的）
		<div
			className="relative"
			onMouseEnter={handleEnter}
			onMouseLeave={handleLeave}
		>
			{children}
			{show && (
				<div className="pointer-events-none absolute top-full left-1/2 z-50 mt-1.5 -translate-x-1/2 whitespace-nowrap rounded bg-neutral-800 px-2 py-1 text-xs text-neutral-200 shadow-lg">
					{text}
				</div>
			)}
		</div>
	);
};

const IconButton = ({
	icon,
	tooltip,
	onClick,
	active,
	disabled,
}: IconButtonProps) => (
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

// WW/WCプリセットドロップダウン
const WwWcPresetDropdown = ({
	onSetWwWc,
}: {
	onSetWwWc: (ww: number, wc: number) => void;
}) => {
	const [open, setOpen] = useState(false);
	const dropdownRef = useRef<HTMLDivElement>(null);

	// クリック外で閉じる
	useEffect(() => {
		if (!open) return;
		const handleClickOutside = (e: MouseEvent) => {
			if (
				dropdownRef.current &&
				!dropdownRef.current.contains(e.target as Node)
			) {
				setOpen(false);
			}
		};
		document.addEventListener("mousedown", handleClickOutside);
		return () => document.removeEventListener("mousedown", handleClickOutside);
	}, [open]);

	return (
		<div className="relative" ref={dropdownRef}>
			<Tooltip text="WW/WCプリセット (1-7)">
				<button
					type="button"
					onClick={() => setOpen((v) => !v)}
					className={`flex items-center gap-0.5 rounded p-1.5 transition-colors ${
						open
							? "bg-blue-600 text-white"
							: "text-neutral-400 hover:bg-neutral-700/60 hover:text-neutral-200"
					}`}
				>
					<Contrast size={SIZE} />
					<ChevronDown size={10} />
				</button>
			</Tooltip>
			{open && (
				<div className="absolute top-full left-0 z-50 mt-1 min-w-[160px] rounded-md border border-neutral-700 bg-neutral-800 py-1 shadow-xl">
					{WW_WC_PRESETS.map((preset, i) => (
						<button
							key={preset.key}
							type="button"
							onClick={() => {
								onSetWwWc(preset.ww, preset.wc);
								setOpen(false);
							}}
							className="flex w-full items-center justify-between px-3 py-1.5 text-left text-xs text-neutral-300 transition-colors hover:bg-neutral-700"
						>
							<span>{preset.label}</span>
							<span className="ml-4 text-neutral-500">
								W:{preset.ww} L:{preset.wc}
								<span className="ml-2 text-neutral-600">[{i + 1}]</span>
							</span>
						</button>
					))}
				</div>
			)}
		</div>
	);
};

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
	onClearSelected,
	onClearAll,
	onSetWwWc,
	isPlaying,
	fps,
	onTogglePlay,
	onIncreaseFps,
	onDecreaseFps,
	onScreenshot,
	isFullscreen,
	onToggleFullscreen,
	onClearMeasurements,
	hasMeasurements,
	layout,
	onSetLayout,
}: ControlPanelProps) => {
	return (
		<div className="flex shrink-0 items-center gap-0.5 border-b border-neutral-800/80 bg-neutral-900/95 px-2 py-1">
			{/* 画像クリア */}
			<IconButton
				icon={<X size={SIZE} />}
				tooltip="選択画像クリア"
				onClick={onClearSelected}
			/>
			<IconButton
				icon={<XCircle size={SIZE} />}
				tooltip="全画像クリア"
				onClick={onClearAll}
			/>

			<Divider />

			{/* 操作モード */}
			<div className="flex gap-0.5 rounded-md bg-neutral-800/60 p-0.5">
				<IconButton
					icon={<Contrast size={SIZE} />}
					tooltip="WW/WC [W]"
					onClick={() => onModeChange(VIEWER_CONTROL_TYPE.WW_WC)}
					active={activeMode === VIEWER_CONTROL_TYPE.WW_WC}
				/>
				<IconButton
					icon={<ZoomIn size={SIZE} />}
					tooltip="ズーム [Z]"
					onClick={() => onModeChange(VIEWER_CONTROL_TYPE.ZOOM)}
					active={activeMode === VIEWER_CONTROL_TYPE.ZOOM}
				/>
				<IconButton
					icon={<Move size={SIZE} />}
					tooltip="パン [P]"
					onClick={() => onModeChange(VIEWER_CONTROL_TYPE.PAN)}
					active={activeMode === VIEWER_CONTROL_TYPE.PAN}
				/>
			</div>

			<Divider />

			{/* WW/WCプリセット */}
			<WwWcPresetDropdown onSetWwWc={onSetWwWc} />

			<Divider />

			{/* 計測ツール */}
			<div className="flex gap-0.5 rounded-md bg-neutral-800/60 p-0.5">
				<IconButton
					icon={<Ruler size={SIZE} />}
					tooltip="距離計測 [D]"
					onClick={() => onModeChange(VIEWER_CONTROL_TYPE.MEASURE_DISTANCE)}
					active={activeMode === VIEWER_CONTROL_TYPE.MEASURE_DISTANCE}
				/>
				<IconButton
					icon={<Triangle size={SIZE} />}
					tooltip="角度計測 [A]"
					onClick={() => onModeChange(VIEWER_CONTROL_TYPE.MEASURE_ANGLE)}
					active={activeMode === VIEWER_CONTROL_TYPE.MEASURE_ANGLE}
				/>
			</div>
			{hasMeasurements && (
				<IconButton
					icon={<Trash2 size={SIZE} />}
					tooltip="計測クリア [Del]"
					onClick={onClearMeasurements}
				/>
			)}

			<Divider />

			{/* 表示操作 */}
			<IconButton
				icon={<Maximize size={SIZE} />}
				tooltip="フィット [F]"
				onClick={onFitSize}
			/>
			<IconButton
				icon={<Scan size={SIZE} />}
				tooltip="1:1 原寸大"
				onClick={onOneToOne}
			/>
			<IconButton
				icon={<RefreshCw size={SIZE} />}
				tooltip="白黒反転 [I]"
				onClick={onToggleInvert}
			/>

			<Divider />

			{/* 回転・反転 */}
			<IconButton
				icon={<RotateCw size={SIZE} />}
				tooltip="右90°回転"
				onClick={onRotateCW}
			/>
			<IconButton
				icon={<RotateCcw size={SIZE} />}
				tooltip="左90°回転"
				onClick={onRotateCCW}
			/>
			<IconButton
				icon={<FlipHorizontal2 size={SIZE} />}
				tooltip="左右反転"
				onClick={onFlipH}
			/>
			<IconButton
				icon={<FlipVertical2 size={SIZE} />}
				tooltip="上下反転"
				onClick={onFlipV}
			/>

			<Divider />

			{/* オーバーレイトグル */}
			<IconButton
				icon={showOverlay ? <Eye size={SIZE} /> : <EyeOff size={SIZE} />}
				tooltip={
					showOverlay ? "情報オーバーレイ非表示" : "情報オーバーレイ表示"
				}
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

			{/* Cine再生 */}
			<div className="flex items-center gap-0.5">
				<IconButton
					icon={isPlaying ? <Pause size={SIZE} /> : <Play size={SIZE} />}
					tooltip={`${isPlaying ? "停止" : "再生"} [Space]`}
					onClick={onTogglePlay}
				/>
				<IconButton
					icon={<Minus size={12} />}
					tooltip="速度 -5fps"
					onClick={onDecreaseFps}
					disabled={fps <= 5}
				/>
				<span className="min-w-[2rem] text-center font-mono text-[10px] text-neutral-500">
					{fps}fps
				</span>
				<IconButton
					icon={<Plus size={12} />}
					tooltip="速度 +5fps"
					onClick={onIncreaseFps}
					disabled={fps >= 30}
				/>
			</div>

			<Divider />

			{/* スクリーンショット・フルスクリーン・リセット */}
			<IconButton
				icon={<Camera size={SIZE} />}
				tooltip="スクリーンショット"
				onClick={onScreenshot}
			/>
			<IconButton
				icon={<Maximize2 size={SIZE} />}
				tooltip={`フルスクリーン [F11]`}
				onClick={onToggleFullscreen}
				active={isFullscreen}
			/>
			<IconButton
				icon={<RotateCcwSquare size={SIZE} />}
				tooltip="リセット [R]"
				onClick={onReset}
			/>

			<Divider />

			{/* レイアウト選択 */}
			<div className="flex gap-0.5 rounded-md bg-neutral-800/60 p-0.5">
				<IconButton
					icon={<Square size={SIZE} />}
					tooltip="1×1 レイアウト"
					onClick={() => onSetLayout(LAYOUT_TYPE.ONE_BY_ONE)}
					active={layout === LAYOUT_TYPE.ONE_BY_ONE}
				/>
				<IconButton
					icon={<Columns2 size={SIZE} />}
					tooltip="2×1 レイアウト（左右分割）"
					onClick={() => onSetLayout(LAYOUT_TYPE.TWO_BY_ONE)}
					active={layout === LAYOUT_TYPE.TWO_BY_ONE}
				/>
				<IconButton
					icon={<LayoutPanelTop size={SIZE} />}
					tooltip="1×2 レイアウト（上下分割）"
					onClick={() => onSetLayout(LAYOUT_TYPE.ONE_BY_TWO)}
					active={layout === LAYOUT_TYPE.ONE_BY_TWO}
				/>
				<IconButton
					icon={<Grid2X2 size={SIZE} />}
					tooltip="2×2 レイアウト（4分割）"
					onClick={() => onSetLayout(LAYOUT_TYPE.TWO_BY_TWO)}
					active={layout === LAYOUT_TYPE.TWO_BY_TWO}
				/>
			</div>
		</div>
	);
};
