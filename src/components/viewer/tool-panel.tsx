import {
	ArrowUpRight,
	Bone,
	Camera,
	ChevronDown,
	ChevronRight,
	Circle,
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
	PencilLine,
	Play,
	Plus,
	Printer,
	RefreshCw,
	RotateCcw,
	RotateCcwSquare,
	RotateCw,
	Ruler,
	Scan,
	Square,
	Trash2,
	Triangle,
	Type,
	X,
	XCircle,
	ZoomIn,
} from "lucide-react";
import { type ReactNode, useState } from "react";
import {
	CLINICAL_WW_WC_PRESETS,
	EQUINE_WW_WC_PRESETS,
} from "@/constants/ww-wc-presets";
import type { AnnotationToolType } from "@/types/annotation";
import { LAYOUT_TYPE, type LayoutType } from "@/types/layout";
import type { ViewerControlType } from "@/types/viewer";
import { VIEWER_CONTROL_TYPE } from "@/types/viewer";
import type { Species } from "@/utils/image-direction";

// --- Props ---

export type ToolPanelProps = {
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
	species: Species;
	onToggleSpecies: () => void;
	onSetWwWc: (ww: number, wc: number) => void;
	isPlaying: boolean;
	fps: number;
	onTogglePlay: () => void;
	onIncreaseFps: () => void;
	onDecreaseFps: () => void;
	onClearMeasurements: () => void;
	hasMeasurements: boolean;
	activeAnnotationTool: AnnotationToolType | null;
	onStartTextTool: () => void;
	onStartArrowTool: () => void;
	onStartRectTool: () => void;
	onStartEllipseTool: () => void;
	onStartFreehandTool: () => void;
	onClearAnnotations: () => void;
	hasAnnotations: boolean;
	isInverted: boolean;
	onClearSelected: () => void;
	onClearAll: () => void;
	onScreenshot: () => void;
	onPrint: () => void;
	isFullscreen: boolean;
	onToggleFullscreen: () => void;
	layout: LayoutType;
	onSetLayout: (layout: LayoutType) => void;
	viewerReady?: boolean;
};

// --- Sub-components ---

const ICON = 18;

const SectionHeader = ({
	label,
	collapsible,
	open,
	onToggle,
}: {
	label: string;
	collapsible?: boolean;
	open?: boolean;
	onToggle?: () => void;
}) => {
	if (collapsible && onToggle !== undefined) {
		return (
			<button
				type="button"
				onClick={onToggle}
				className="mb-1 mt-4 flex w-full items-center justify-between border-b border-white/5 px-3 pb-1.5 text-left font-sans text-[10px] font-medium tracking-[0.14em] text-zinc-400 uppercase transition-colors first:mt-1 hover:text-zinc-300"
			>
				{label}
				{open ? (
					<ChevronDown size={10} className="shrink-0" />
				) : (
					<ChevronRight size={10} className="shrink-0" />
				)}
			</button>
		);
	}
	return (
		<div className="mb-1 mt-4 border-b border-white/5 px-3 pb-1.5 font-sans text-[10px] font-medium tracking-[0.14em] text-zinc-400 uppercase first:mt-1">
			{label}
		</div>
	);
};

const ModeButton = ({
	icon,
	label,
	shortcut,
	active,
	onClick,
}: {
	icon: ReactNode;
	label: string;
	shortcut?: string;
	active: boolean;
	onClick: () => void;
}) => (
	<button
		type="button"
		aria-label={label}
		aria-pressed={active}
		onClick={onClick}
		className={`relative flex h-8 w-full items-center gap-2 rounded-md pl-3 pr-2 text-[12px] transition-[background-color,color,transform,box-shadow] duration-150 ease-out before:absolute before:left-0.5 before:top-1/2 before:h-5 before:w-[2px] before:-translate-y-1/2 before:rounded-full before:bg-gradient-to-b before:from-sky-400 before:to-sky-400/30 before:transition-opacity ${
			active
				? "bg-sky-400/[0.08] text-sky-300 before:opacity-100"
				: "text-zinc-400 before:opacity-0 hover:translate-x-[1px] hover:bg-white/[0.04] hover:text-zinc-100"
		}`}
	>
		{icon}
		<span className="flex-1 text-left">{label}</span>
		{shortcut && (
			<span className="font-mono text-[10px] text-zinc-500">{shortcut}</span>
		)}
	</button>
);

const ToggleButton = ({
	icon,
	label,
	shortcut,
	active,
	onClick,
}: {
	icon: ReactNode;
	label: string;
	shortcut?: string;
	active: boolean;
	onClick: () => void;
}) => (
	<button
		type="button"
		aria-label={label}
		aria-pressed={active}
		onClick={onClick}
		className={`flex h-8 w-full items-center gap-2 rounded-md px-3 text-[12px] transition-[background-color,color] duration-150 ease-out ${
			active
				? "bg-sky-400/[0.08] text-sky-300"
				: "text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-100"
		}`}
	>
		{icon}
		<span className="flex-1 text-left">{label}</span>
		{shortcut && (
			<span className="mr-1 font-mono text-[10px] text-zinc-500">
				{shortcut}
			</span>
		)}
		<span
			className={`h-1.5 w-3 rounded-full transition-colors ${active ? "bg-sky-400" : "bg-white/10"}`}
		/>
	</button>
);

const ActionButton = ({
	icon,
	label,
	shortcut,
	onClick,
	disabled,
}: {
	icon: ReactNode;
	label: string;
	shortcut?: string;
	onClick: () => void;
	disabled?: boolean;
}) => (
	<button
		type="button"
		aria-label={label}
		onClick={onClick}
		disabled={disabled}
		className={`flex h-8 w-full items-center gap-2 rounded-md px-3 text-[12px] transition-[background-color,color] duration-150 ease-out ${
			disabled
				? "cursor-not-allowed text-zinc-700"
				: "text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-100 active:bg-white/[0.06]"
		}`}
	>
		{icon}
		<span className="flex-1 text-left">{label}</span>
		{shortcut && (
			<span className="font-mono text-[10px] text-zinc-500">{shortcut}</span>
		)}
	</button>
);

// --- Main ---

export const ToolPanel = ({
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
	species,
	onToggleSpecies,
	onSetWwWc,
	isPlaying,
	fps,
	onTogglePlay,
	onIncreaseFps,
	onDecreaseFps,
	onClearMeasurements,
	hasMeasurements,
	activeAnnotationTool,
	onStartTextTool,
	onStartArrowTool,
	onStartRectTool,
	onStartEllipseTool,
	onStartFreehandTool,
	onClearAnnotations,
	hasAnnotations,
	isInverted,
	onClearSelected,
	onClearAll,
	onScreenshot,
	onPrint,
	isFullscreen,
	onToggleFullscreen,
	layout,
	onSetLayout,
	viewerReady = true,
}: ToolPanelProps) => {
	// 注釈: 使用中またはデータあり時は自動展開
	const [annotationOpen, setAnnotationOpen] = useState(
		() => activeAnnotationTool !== null || hasAnnotations,
	);
	const [transformOpen, setTransformOpen] = useState(false);
	const [clinicalPresetOpen, setClinicalPresetOpen] = useState(false);
	const [playbackOpen, setPlaybackOpen] = useState(true);

	const handleClearMeasurements = () => {
		if (!window.confirm("すべての計測をクリアします。よろしいですか？")) return;
		onClearMeasurements();
	};

	const handleClearAnnotations = () => {
		if (!window.confirm("すべての注釈をクリアします。よろしいですか？")) return;
		onClearAnnotations();
	};

	const handleClearSelected = () => {
		if (!window.confirm("選択中の DICOM をクリアします。よろしいですか？"))
			return;
		onClearSelected();
	};

	const handleClearAll = () => {
		if (!window.confirm("全 DICOM をクリアします。よろしいですか？")) return;
		onClearAll();
	};

	return (
		<aside className="flex w-[200px] shrink-0 flex-col overflow-y-auto py-2 panel-surface">
			{/* ビューア未準備時はレイアウト以外を無効化 */}
			<div className={!viewerReady ? "pointer-events-none opacity-40" : ""}>
				{/* 操作モード */}
				<SectionHeader label="操作モード" />
				<div className="flex flex-col gap-0.5 px-1">
					<ModeButton
						icon={<Contrast size={ICON} />}
						label="コントラスト"
						shortcut="W"
						active={activeMode === VIEWER_CONTROL_TYPE.WW_WC}
						onClick={() => onModeChange(VIEWER_CONTROL_TYPE.WW_WC)}
					/>
					<ModeButton
						icon={<ZoomIn size={ICON} />}
						label="ズーム"
						shortcut="Z"
						active={activeMode === VIEWER_CONTROL_TYPE.ZOOM}
						onClick={() => onModeChange(VIEWER_CONTROL_TYPE.ZOOM)}
					/>
					<ModeButton
						icon={<Move size={ICON} />}
						label="パン"
						shortcut="P"
						active={activeMode === VIEWER_CONTROL_TYPE.PAN}
						onClick={() => onModeChange(VIEWER_CONTROL_TYPE.PAN)}
					/>
				</div>

				{/* 表示調整 */}
				<SectionHeader label="表示調整" />
				<div className="flex flex-col gap-0.5 px-1">
					<ActionButton
						icon={<Maximize size={ICON} />}
						label="画面に合わせる"
						shortcut="F"
						onClick={onFitSize}
					/>
					<ActionButton
						icon={<Scan size={ICON} />}
						label="原寸大 1:1"
						onClick={onOneToOne}
					/>
					<ToggleButton
						icon={<RefreshCw size={ICON} />}
						label="白黒反転"
						shortcut="I"
						active={isInverted}
						onClick={onToggleInvert}
					/>
					<ActionButton
						icon={<RotateCcwSquare size={ICON} />}
						label="リセット"
						shortcut="R"
						onClick={onReset}
					/>
				</div>

				{/* 馬用プリセット */}
				<SectionHeader label="馬用プリセット" />
				<div className="flex flex-col gap-0.5 px-1">
					{EQUINE_WW_WC_PRESETS.map((preset) => (
						<button
							key={preset.key}
							type="button"
							onClick={() => onSetWwWc(preset.ww, preset.wc)}
							className="flex h-7 w-full items-center justify-between rounded-md px-3 text-[12px] text-zinc-400 transition-[background-color,color] duration-150 ease-out hover:bg-white/[0.04] hover:text-zinc-100"
						>
							<span>{preset.label}</span>
							<span className="font-mono text-[10px] text-zinc-500">
								{preset.ww}/{preset.wc}
							</span>
						</button>
					))}
				</div>

				{/* 計測 */}
				<SectionHeader label="計測" />
				<div className="flex flex-col gap-0.5 px-1">
					<ModeButton
						icon={<Ruler size={ICON} />}
						label="距離を測る"
						shortcut="D"
						active={activeMode === VIEWER_CONTROL_TYPE.MEASURE_DISTANCE}
						onClick={() => onModeChange(VIEWER_CONTROL_TYPE.MEASURE_DISTANCE)}
					/>
					<ModeButton
						icon={<Triangle size={ICON} />}
						label="角度を測る"
						shortcut="A"
						active={activeMode === VIEWER_CONTROL_TYPE.MEASURE_ANGLE}
						onClick={() => onModeChange(VIEWER_CONTROL_TYPE.MEASURE_ANGLE)}
					/>
					{hasMeasurements && (
						<ActionButton
							icon={<Trash2 size={ICON} />}
							label="計測クリア"
							shortcut="Del"
							onClick={handleClearMeasurements}
						/>
					)}
				</div>

				{/* 注釈（折りたたみ） */}
				<SectionHeader
					label="注釈"
					collapsible
					open={annotationOpen}
					onToggle={() => setAnnotationOpen((v) => !v)}
				/>
				{annotationOpen && (
					<div className="flex flex-col gap-0.5 px-1">
						<ModeButton
							icon={<Type size={ICON} />}
							label="テキスト"
							active={activeAnnotationTool === "text"}
							onClick={onStartTextTool}
						/>
						<ModeButton
							icon={<ArrowUpRight size={ICON} />}
							label="矢印"
							active={activeAnnotationTool === "arrow"}
							onClick={onStartArrowTool}
						/>
						<ModeButton
							icon={<Square size={ICON} />}
							label="四角形"
							active={activeAnnotationTool === "rect"}
							onClick={onStartRectTool}
						/>
						<ModeButton
							icon={<Circle size={ICON} />}
							label="楕円"
							active={activeAnnotationTool === "ellipse"}
							onClick={onStartEllipseTool}
						/>
						<ModeButton
							icon={<PencilLine size={ICON} />}
							label="フリーハンド"
							active={activeAnnotationTool === "freehand"}
							onClick={onStartFreehandTool}
						/>
						{hasAnnotations && (
							<ActionButton
								icon={<Trash2 size={ICON} />}
								label="注釈クリア"
								onClick={handleClearAnnotations}
							/>
						)}
					</div>
				)}

				{/* 情報表示 */}
				<SectionHeader label="情報表示" />
				<div className="flex flex-col gap-0.5 px-1">
					<ToggleButton
						icon={showOverlay ? <Eye size={ICON} /> : <EyeOff size={ICON} />}
						label="撮影情報"
						active={showOverlay}
						onClick={onToggleOverlay}
					/>
					<ToggleButton
						icon={<Compass size={ICON} />}
						label="方向マーカー"
						active={showDirection}
						onClick={onToggleDirection}
					/>
					<ToggleButton
						icon={<Bone size={ICON} />}
						label={species === "equine" ? "馬モード" : "人体モード"}
						active={species === "equine"}
						onClick={onToggleSpecies}
					/>
				</div>

				{/* 変形（折りたたみ） */}
				<SectionHeader
					label="変形"
					collapsible
					open={transformOpen}
					onToggle={() => setTransformOpen((v) => !v)}
				/>
				{transformOpen && (
					<div className="flex flex-col gap-0.5 px-1">
						<ActionButton
							icon={<RotateCw size={ICON} />}
							label="右90°回転"
							onClick={onRotateCW}
						/>
						<ActionButton
							icon={<RotateCcw size={ICON} />}
							label="左90°回転"
							onClick={onRotateCCW}
						/>
						<ActionButton
							icon={<FlipHorizontal2 size={ICON} />}
							label="左右反転"
							onClick={onFlipH}
						/>
						<ActionButton
							icon={<FlipVertical2 size={ICON} />}
							label="上下反転"
							onClick={onFlipV}
						/>
					</div>
				)}

				{/* 標準プリセット（折りたたみ） */}
				<SectionHeader
					label="標準プリセット"
					collapsible
					open={clinicalPresetOpen}
					onToggle={() => setClinicalPresetOpen((v) => !v)}
				/>
				{clinicalPresetOpen && (
					<div className="flex flex-col gap-0.5 px-1">
						{CLINICAL_WW_WC_PRESETS.map((preset, i) => (
							<button
								key={preset.key}
								type="button"
								onClick={() => onSetWwWc(preset.ww, preset.wc)}
								className="flex h-7 w-full items-center justify-between rounded-md px-3 text-[12px] text-zinc-400 transition-[background-color,color] duration-150 ease-out hover:bg-white/[0.04] hover:text-zinc-100"
							>
								<span>{preset.label}</span>
								<span className="font-mono text-[10px] text-zinc-500">
									{preset.ww}/{preset.wc}{" "}
									<span className="text-zinc-600">[{i + 1}]</span>
								</span>
							</button>
						))}
					</div>
				)}

				{/* シリーズ再生（折りたたみ） */}
				<SectionHeader
					label="シリーズ再生"
					collapsible
					open={playbackOpen}
					onToggle={() => setPlaybackOpen((v) => !v)}
				/>
				{playbackOpen && (
					<div className="flex flex-col gap-0.5 px-1">
						<ActionButton
							icon={isPlaying ? <Pause size={ICON} /> : <Play size={ICON} />}
							label={isPlaying ? "停止" : "再生"}
							shortcut="Space"
							onClick={onTogglePlay}
						/>
						<div className="flex items-center gap-1 px-3">
							<button
								type="button"
								aria-label="再生速度を下げる"
								onClick={onDecreaseFps}
								disabled={fps <= 5}
								className="rounded p-0.5 text-zinc-500 transition-colors hover:bg-white/[0.04] hover:text-zinc-200 disabled:cursor-not-allowed disabled:text-zinc-700"
							>
								<Minus size={14} />
							</button>
							<span className="min-w-[3rem] text-center font-mono tabular-nums text-[11px] text-zinc-400">
								{fps} fps
							</span>
							<button
								type="button"
								aria-label="再生速度を上げる"
								onClick={onIncreaseFps}
								disabled={fps >= 30}
								className="rounded p-0.5 text-zinc-500 transition-colors hover:bg-white/[0.04] hover:text-zinc-200 disabled:cursor-not-allowed disabled:text-zinc-700"
							>
								<Plus size={14} />
							</button>
						</div>
					</div>
				)}

				{/* ツール */}
				<SectionHeader label="ツール" />
				<div className="flex flex-col gap-0.5 px-1">
					<ActionButton
						icon={<Camera size={ICON} />}
						label="スクリーンショット"
						onClick={onScreenshot}
					/>
					<ActionButton
						icon={<Printer size={ICON} />}
						label="印刷"
						shortcut="Ctrl/Cmd+P"
						onClick={onPrint}
					/>
					<ToggleButton
						icon={<Maximize2 size={ICON} />}
						label="全画面"
						shortcut="F11"
						active={isFullscreen}
						onClick={onToggleFullscreen}
					/>
					<ActionButton
						icon={<X size={ICON} />}
						label="選択クリア"
						onClick={handleClearSelected}
					/>
					<ActionButton
						icon={<XCircle size={ICON} />}
						label="全クリア"
						onClick={handleClearAll}
					/>
				</div>
			</div>

			{/* レイアウト（常にアクティブ） */}
			<SectionHeader label="レイアウト" />
			<div className="grid grid-cols-4 gap-0.5 px-1">
				{(
					[
						{ type: LAYOUT_TYPE.ONE_BY_ONE, icon: Square, tip: "1×1" },
						{ type: LAYOUT_TYPE.TWO_BY_ONE, icon: Columns2, tip: "2×1" },
						{
							type: LAYOUT_TYPE.ONE_BY_TWO,
							icon: LayoutPanelTop,
							tip: "1×2",
						},
						{ type: LAYOUT_TYPE.TWO_BY_TWO, icon: Grid2X2, tip: "2×2" },
					] as const
				).map(({ type, icon: Icon, tip }) => (
					<button
						key={type}
						type="button"
						aria-label={tip}
						aria-pressed={layout === type}
						onClick={() => onSetLayout(type)}
						title={tip}
						className={`flex h-8 items-center justify-center rounded-md transition-[background-color,color] duration-150 ease-out ${
							layout === type
								? "bg-sky-400/[0.12] text-sky-300"
								: "text-zinc-500 hover:bg-white/[0.04] hover:text-zinc-200"
						}`}
					>
						<Icon size={ICON} />
					</button>
				))}
			</div>
		</aside>
	);
};
