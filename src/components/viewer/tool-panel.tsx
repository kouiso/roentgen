import {
	ArrowUpRight,
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
	Hand,
	LayoutPanelTop,
	Maximize,
	Maximize2,
	Minus,
	Pause,
	PawPrint,
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
	Sparkles,
	Square,
	Sun,
	Trash2,
	Triangle,
	Type,
	X,
	XCircle,
	ZoomIn,
} from "lucide-react";
import { type ReactNode, useId, useState } from "react";
import { WW_WC_PRESETS } from "@/constants/ww-wc-presets";
import type { AnnotationToolType } from "@/types/annotation";
import { LAYOUT_TYPE, type LayoutType } from "@/types/layout";
import type { ViewerControlType } from "@/types/viewer";
import { VIEWER_CONTROL_TYPE } from "@/types/viewer";
import type { Species } from "@/utils/image-direction";
import { OWNER_PRESETS, ownerPresetWindow } from "@/utils/owner-presets";
import {
	brightnessFromWindow,
	contrastFromWindow,
	windowCenterFromBrightness,
	windowWidthFromContrast,
} from "@/utils/simple-window";

// --- Props ---

export type ToolPanelProps = {
	activeMode: ViewerControlType;
	onModeChange: (mode: ViewerControlType) => void;
	onFitSize: () => void;
	onFitAllPanes?: () => void;
	onOneToOne: () => void;
	syncWwWc?: boolean;
	onToggleSyncWwWc?: () => void;
	syncZoom?: boolean;
	onToggleSyncZoom?: () => void;
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
	onAutoContrast?: () => void;
	baseWW?: number;
	baseWC?: number;
	photometricInterpretation?: string;
	currentWW?: number;
	currentWC?: number;
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

const ICON = 18;

// --- Sub-components ---

const Section = ({
	title,
	children,
}: {
	title: string;
	children: ReactNode;
}) => {
	const headingId = useId();
	return (
		<section aria-labelledby={headingId} className="px-3 pt-4">
			<h2
				id={headingId}
				className="mb-2 text-[12px] font-semibold tracking-wide text-ink-2"
			>
				{title}
			</h2>
			{children}
		</section>
	);
};

// 大きめのタイル型ボタン。押せる場所が一目で分かるように枠と余白を持たせる
const TileButton = ({
	icon,
	label,
	ariaLabel,
	shortcut,
	active,
	onClick,
	disabled,
}: {
	icon: ReactNode;
	label: string;
	ariaLabel?: string;
	shortcut?: string;
	active?: boolean;
	onClick: () => void;
	disabled?: boolean;
}) => (
	<button
		type="button"
		aria-label={ariaLabel ?? label}
		aria-pressed={active}
		title={shortcut ? `${label}（キー: ${shortcut}）` : label}
		onClick={onClick}
		disabled={disabled}
		className={`flex min-h-[58px] flex-col items-center justify-center gap-1 rounded-lg border px-1.5 py-2 text-[12px] leading-tight transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-40 ${
			active
				? "border-accent/50 bg-accent/[0.14] text-accent"
				: "border-white/[0.08] bg-white/[0.02] text-ink-2 hover:border-white/[0.16] hover:bg-hover hover:text-ink"
		}`}
	>
		{icon}
		<span className="text-center">{label}</span>
	</button>
);

const RowButton = ({
	icon,
	label,
	ariaLabel,
	onClick,
	active,
	tone = "default",
}: {
	icon: ReactNode;
	label: string;
	ariaLabel?: string;
	onClick: () => void;
	active?: boolean;
	tone?: "default" | "danger";
}) => (
	<button
		type="button"
		aria-label={ariaLabel ?? label}
		aria-pressed={active}
		onClick={onClick}
		className={`flex h-9 w-full items-center gap-2.5 rounded-md px-2.5 text-[13px] transition-colors duration-150 ${
			tone === "danger"
				? "text-rose-300 hover:bg-rose-500/10"
				: active
					? "bg-accent/[0.12] text-accent"
					: "text-ink-2 hover:bg-hover hover:text-ink"
		}`}
	>
		{icon}
		<span className="flex-1 text-left">{label}</span>
		{active !== undefined && (
			<span
				aria-hidden
				className={`h-4 w-7 rounded-full p-0.5 transition-colors ${active ? "bg-accent" : "bg-white/[0.12]"}`}
			>
				<span
					className={`block h-3 w-3 rounded-full bg-white transition-transform ${active ? "translate-x-3" : ""}`}
				/>
			</span>
		)}
	</button>
);

const SliderRow = ({
	icon,
	label,
	value,
	onChange,
	disabled,
	lowLabel,
	highLabel,
}: {
	icon: ReactNode;
	label: string;
	value: number;
	onChange: (value: number) => void;
	disabled?: boolean;
	lowLabel: string;
	highLabel: string;
}) => {
	const inputId = useId();
	return (
		<div className="flex flex-col gap-1">
			<label
				htmlFor={inputId}
				className="flex items-center gap-2 text-[13px] text-ink"
			>
				{icon}
				<span className="flex-1">{label}</span>
			</label>
			<input
				id={inputId}
				type="range"
				min={-100}
				max={100}
				step={1}
				value={Math.round(value)}
				disabled={disabled}
				onChange={(e) => onChange(Number(e.target.value))}
				aria-valuetext={`${label} ${value > 0 ? "+" : ""}${Math.round(value)}`}
				className="h-2 w-full cursor-pointer accent-[#1fbfa6] disabled:cursor-not-allowed"
			/>
			<div className="flex justify-between text-[11px] text-ink-3">
				<span>{lowLabel}</span>
				<span>{highLabel}</span>
			</div>
		</div>
	);
};

// --- Main ---

export const ToolPanel = ({
	activeMode,
	onModeChange,
	onFitSize,
	onFitAllPanes,
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
	onAutoContrast,
	baseWW,
	baseWC,
	photometricInterpretation,
	currentWW,
	currentWC,
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
	syncWwWc,
	onToggleSyncWwWc,
	syncZoom,
	onToggleSyncZoom,
	layout,
	onSetLayout,
	viewerReady = true,
}: ToolPanelProps) => {
	// 獣医・技師向けの機能は普段は畳んでおき、迷わせる選択肢を減らす
	const [advancedOpen, setAdvancedOpen] = useState(false);

	const hasPresetBase =
		baseWW !== undefined && baseWC !== undefined && baseWW > 0;
	const hasBaseWindow =
		baseWW !== undefined &&
		baseWC !== undefined &&
		currentWW !== undefined &&
		currentWC !== undefined &&
		baseWW > 0;
	const brightness = hasBaseWindow
		? brightnessFromWindow(currentWC, baseWC, baseWW)
		: 0;
	const contrast = hasBaseWindow ? contrastFromWindow(currentWW, baseWW) : 0;

	const handleBrightness = (value: number) => {
		if (!hasBaseWindow) return;
		onSetWwWc(currentWW, windowCenterFromBrightness(value, baseWC, baseWW));
	};

	const handleContrast = (value: number) => {
		if (!hasBaseWindow) return;
		onSetWwWc(windowWidthFromContrast(value, baseWW), currentWC);
	};

	const handleClearMeasurements = () => {
		if (!window.confirm("測った線をすべて消します。よろしいですか？")) return;
		onClearMeasurements();
	};

	const handleClearAnnotations = () => {
		if (!window.confirm("書き込みをすべて消します。よろしいですか？")) return;
		onClearAnnotations();
	};

	const handleClearSelected = () => {
		if (!window.confirm("表示中の画像を閉じます。よろしいですか？")) return;
		onClearSelected();
	};

	const handleClearAll = () => {
		if (!window.confirm("開いている画像をすべて閉じます。よろしいですか？"))
			return;
		onClearAll();
	};

	return (
		<aside
			aria-label="画像の操作パネル"
			className="flex w-[300px] shrink-0 flex-col overflow-y-auto pb-4 panel-surface"
		>
			{/* ビューア未準備時は並べて比べる以外を無効化 */}
			<div
				className={!viewerReady ? "pointer-events-none opacity-40" : ""}
				aria-disabled={!viewerReady}
			>
				<Section title="マウスでできること">
					<div className="grid grid-cols-3 gap-1.5">
						<TileButton
							icon={<Hand size={ICON} />}
							label="動かす"
							ariaLabel="ドラッグで動かす"
							shortcut="P"
							active={activeMode === VIEWER_CONTROL_TYPE.PAN}
							onClick={() => onModeChange(VIEWER_CONTROL_TYPE.PAN)}
						/>
						<TileButton
							icon={<ZoomIn size={ICON} />}
							label="拡大縮小"
							ariaLabel="ドラッグで拡大縮小"
							shortcut="Z"
							active={activeMode === VIEWER_CONTROL_TYPE.ZOOM}
							onClick={() => onModeChange(VIEWER_CONTROL_TYPE.ZOOM)}
						/>
						<TileButton
							icon={<Sun size={ICON} />}
							label="明るさ"
							ariaLabel="ドラッグで明るさ調整"
							shortcut="W"
							active={activeMode === VIEWER_CONTROL_TYPE.WW_WC}
							onClick={() => onModeChange(VIEWER_CONTROL_TYPE.WW_WC)}
						/>
					</div>
					<p className="mt-2 text-[11px] leading-relaxed text-ink-3">
						ホイールで拡大・縮小できます
					</p>
					<div className="mt-2 grid grid-cols-2 gap-1.5">
						<TileButton
							icon={<Maximize size={ICON} />}
							label="全体を表示"
							shortcut="F"
							onClick={onFitSize}
						/>
						<TileButton
							icon={<RotateCcwSquare size={ICON} />}
							label="最初の状態に戻す"
							shortcut="R"
							onClick={onReset}
						/>
					</div>
				</Section>

				<Section title="見やすくする">
					{onAutoContrast && (
						<button
							type="button"
							onClick={onAutoContrast}
							className="mb-3 flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-accent text-[13px] font-semibold text-[#062b25] transition-colors hover:bg-accent/90"
						>
							<Sparkles size={16} />
							おまかせで見やすく
						</button>
					)}
					<div className="flex flex-col gap-3">
						<SliderRow
							icon={<Sun size={16} className="text-ink-3" />}
							label="明るさ"
							value={brightness}
							onChange={handleBrightness}
							disabled={!hasBaseWindow}
							lowLabel="暗く"
							highLabel="明るく"
						/>
						<SliderRow
							icon={<Contrast size={16} className="text-ink-3" />}
							label="くっきり"
							value={contrast}
							onChange={handleContrast}
							disabled={!hasBaseWindow}
							lowLabel="やわらかく"
							highLabel="くっきり"
						/>
					</div>
					<div className="mt-3">
						<RowButton
							icon={<RefreshCw size={16} />}
							label="白黒を反転"
							active={isInverted}
							onClick={onToggleInvert}
						/>
					</div>
					<p className="mb-1.5 mt-3 text-[12px] text-ink-2">見たい部分で選ぶ</p>
					<div className="grid grid-cols-2 gap-1.5">
						{OWNER_PRESETS.map((preset) => (
							<button
								key={preset.key}
								type="button"
								aria-label={`${preset.label}を見やすく`}
								title={preset.hint}
								disabled={!hasPresetBase}
								onClick={() => {
									if (baseWW === undefined || baseWC === undefined) return;
									const next = ownerPresetWindow(
										preset,
										{ ww: baseWW, wc: baseWC },
										photometricInterpretation,
									);
									onSetWwWc(next.ww, next.wc);
								}}
								className="flex flex-col items-start rounded-lg border border-white/[0.08] bg-white/[0.02] px-2.5 py-1.5 text-left transition-colors hover:border-white/[0.16] hover:bg-hover disabled:cursor-not-allowed disabled:opacity-40"
							>
								<span className="text-[13px] text-ink">{preset.label}</span>
								<span className="text-[11px] text-ink-3">{preset.hint}</span>
							</button>
						))}
					</div>
				</Section>

				<Section title="測る・書き込む">
					<div className="grid grid-cols-2 gap-1.5">
						<TileButton
							icon={<Ruler size={ICON} />}
							label="長さを測る"
							ariaLabel="距離を測る"
							shortcut="D"
							active={activeMode === VIEWER_CONTROL_TYPE.MEASURE_DISTANCE}
							onClick={() => onModeChange(VIEWER_CONTROL_TYPE.MEASURE_DISTANCE)}
						/>
						<TileButton
							icon={<Triangle size={ICON} />}
							label="角度を測る"
							shortcut="A"
							active={activeMode === VIEWER_CONTROL_TYPE.MEASURE_ANGLE}
							onClick={() => onModeChange(VIEWER_CONTROL_TYPE.MEASURE_ANGLE)}
						/>
					</div>
					<div className="mt-1.5 grid grid-cols-3 gap-1.5">
						<TileButton
							icon={<Type size={ICON} />}
							label="文字"
							active={activeAnnotationTool === "text"}
							onClick={onStartTextTool}
						/>
						<TileButton
							icon={<ArrowUpRight size={ICON} />}
							label="矢印"
							active={activeAnnotationTool === "arrow"}
							onClick={onStartArrowTool}
						/>
						<TileButton
							icon={<PencilLine size={ICON} />}
							label="手書き"
							ariaLabel="フリーハンド"
							active={activeAnnotationTool === "freehand"}
							onClick={onStartFreehandTool}
						/>
						<TileButton
							icon={<Square size={ICON} />}
							label="四角で囲む"
							ariaLabel="四角形"
							active={activeAnnotationTool === "rect"}
							onClick={onStartRectTool}
						/>
						<TileButton
							icon={<Circle size={ICON} />}
							label="丸で囲む"
							ariaLabel="楕円"
							active={activeAnnotationTool === "ellipse"}
							onClick={onStartEllipseTool}
						/>
					</div>
					{(hasMeasurements || hasAnnotations) && (
						<div className="mt-2 flex flex-col gap-0.5">
							{hasMeasurements && (
								<RowButton
									icon={<Trash2 size={16} />}
									label="測った線を消す"
									ariaLabel="計測クリア"
									tone="danger"
									onClick={handleClearMeasurements}
								/>
							)}
							{hasAnnotations && (
								<RowButton
									icon={<Trash2 size={16} />}
									label="書き込みを消す"
									ariaLabel="注釈クリア"
									tone="danger"
									onClick={handleClearAnnotations}
								/>
							)}
						</div>
					)}
				</Section>

				<Section title="残す・共有する">
					<div className="grid grid-cols-3 gap-1.5">
						<TileButton
							icon={<Camera size={ICON} />}
							label="画像で保存"
							ariaLabel="スクリーンショット"
							onClick={onScreenshot}
						/>
						<TileButton
							icon={<Printer size={ICON} />}
							label="印刷"
							shortcut="Ctrl/Cmd+P"
							onClick={onPrint}
						/>
						<TileButton
							icon={<Maximize2 size={ICON} />}
							label="全画面"
							shortcut="F11"
							active={isFullscreen}
							onClick={onToggleFullscreen}
						/>
					</div>
				</Section>

				{/* くわしい設定（獣医・技師向け） */}
				<div className="px-3 pt-5">
					<button
						type="button"
						aria-expanded={advancedOpen}
						onClick={() => setAdvancedOpen((v) => !v)}
						className="flex w-full items-center justify-between rounded-md border border-white/[0.08] px-2.5 py-2 text-[13px] text-ink-2 transition-colors hover:bg-hover hover:text-ink"
					>
						<span>くわしい設定（獣医さん向け）</span>
						{advancedOpen ? (
							<ChevronDown size={14} />
						) : (
							<ChevronRight size={14} />
						)}
					</button>
				</div>
				{advancedOpen && (
					<div className="flex flex-col gap-0.5 px-3 pt-2">
						<RowButton
							icon={showOverlay ? <Eye size={16} /> : <EyeOff size={16} />}
							label="撮影情報"
							active={showOverlay}
							onClick={onToggleOverlay}
						/>
						<RowButton
							icon={<Compass size={16} />}
							label="方向マーカー"
							active={showDirection}
							onClick={onToggleDirection}
						/>
						<RowButton
							icon={<PawPrint size={16} />}
							label={species === "equine" ? "馬モード" : "人体モード"}
							active={species === "equine"}
							onClick={onToggleSpecies}
						/>
						<RowButton
							icon={<Scan size={16} />}
							label="原寸大 1:1"
							onClick={onOneToOne}
						/>
						<div className="mt-1 grid grid-cols-4 gap-1">
							<TileButton
								icon={<RotateCw size={16} />}
								label="右回転"
								ariaLabel="右90°回転"
								onClick={onRotateCW}
							/>
							<TileButton
								icon={<RotateCcw size={16} />}
								label="左回転"
								ariaLabel="左90°回転"
								onClick={onRotateCCW}
							/>
							<TileButton
								icon={<FlipHorizontal2 size={16} />}
								label="左右"
								ariaLabel="左右反転"
								onClick={onFlipH}
							/>
							<TileButton
								icon={<FlipVertical2 size={16} />}
								label="上下"
								ariaLabel="上下反転"
								onClick={onFlipV}
							/>
						</div>
						{currentWW !== undefined && currentWC !== undefined && (
							<p className="mt-2 font-mono text-[11px] text-ink-3 tabular-nums">
								WW {Math.round(currentWW)} / WC {Math.round(currentWC)}
							</p>
						)}
						<p className="mb-1 mt-2 text-[12px] text-ink-2">標準プリセット</p>
						<div className="grid grid-cols-2 gap-1">
							{WW_WC_PRESETS.map((preset, i) => (
								<button
									key={preset.key}
									type="button"
									title={i < 9 ? `キー: ${i + 1}` : undefined}
									onClick={() => onSetWwWc(preset.ww, preset.wc)}
									className="flex h-8 items-center justify-between rounded-md px-2 text-[12px] text-ink-2 transition-colors hover:bg-hover hover:text-ink"
								>
									<span>{preset.label}</span>
									<span className="font-mono text-[10px] text-ink-3">
										{preset.ww}/{preset.wc}
									</span>
								</button>
							))}
						</div>
						<p className="mb-1 mt-2 text-[12px] text-ink-2">シリーズ再生</p>
						<div className="flex items-center gap-1">
							<RowButton
								icon={isPlaying ? <Pause size={16} /> : <Play size={16} />}
								label={isPlaying ? "停止" : "再生"}
								onClick={onTogglePlay}
							/>
							<button
								type="button"
								aria-label="再生速度を下げる"
								onClick={onDecreaseFps}
								disabled={fps <= 5}
								className="rounded p-1 text-ink-3 transition-colors hover:bg-hover hover:text-ink-2 disabled:cursor-not-allowed disabled:text-ink-3/40"
							>
								<Minus size={14} />
							</button>
							<span className="min-w-[3.5rem] text-center font-mono text-[11px] text-ink-2 tabular-nums">
								{fps} fps
							</span>
							<button
								type="button"
								aria-label="再生速度を上げる"
								onClick={onIncreaseFps}
								disabled={fps >= 30}
								className="rounded p-1 text-ink-3 transition-colors hover:bg-hover hover:text-ink-2 disabled:cursor-not-allowed disabled:text-ink-3/40"
							>
								<Plus size={14} />
							</button>
						</div>
						<div className="mt-2 flex flex-col gap-0.5 border-t border-white/[0.06] pt-2">
							<RowButton
								icon={<X size={16} />}
								label="この画像を閉じる"
								ariaLabel="選択クリア"
								tone="danger"
								onClick={handleClearSelected}
							/>
							<RowButton
								icon={<XCircle size={16} />}
								label="すべての画像を閉じる"
								ariaLabel="全クリア"
								tone="danger"
								onClick={handleClearAll}
							/>
						</div>
					</div>
				)}
			</div>

			{/* 並べて比べる（画像読込前でも選べる） */}
			<Section title="並べて比べる">
				<div className="grid grid-cols-4 gap-1">
					{(
						[
							{
								type: LAYOUT_TYPE.ONE_BY_ONE,
								icon: Square,
								tip: "1×1",
								text: "1枚",
							},
							{
								type: LAYOUT_TYPE.TWO_BY_ONE,
								icon: Columns2,
								tip: "2×1",
								text: "左右",
							},
							{
								type: LAYOUT_TYPE.ONE_BY_TWO,
								icon: LayoutPanelTop,
								tip: "1×2",
								text: "上下",
							},
							{
								type: LAYOUT_TYPE.TWO_BY_TWO,
								icon: Grid2X2,
								tip: "2×2",
								text: "4枚",
							},
						] as const
					).map(({ type, icon: Icon, tip, text }) => (
						<TileButton
							key={type}
							icon={<Icon size={16} />}
							label={text}
							ariaLabel={tip}
							active={layout === type}
							onClick={() => onSetLayout(type)}
						/>
					))}
				</div>
				{layout !== LAYOUT_TYPE.ONE_BY_ONE && (
					<div className="mt-2 flex flex-col gap-0.5">
						{onFitAllPanes && (
							<RowButton
								icon={<Maximize size={16} />}
								label="すべて全体表示"
								ariaLabel="全ペイン合わせる"
								onClick={onFitAllPanes}
							/>
						)}
						{onToggleSyncWwWc && (
							<RowButton
								icon={<Sun size={16} />}
								label="明るさをそろえる"
								ariaLabel="コントラスト同期"
								active={syncWwWc ?? false}
								onClick={onToggleSyncWwWc}
							/>
						)}
						{onToggleSyncZoom && (
							<RowButton
								icon={<ZoomIn size={16} />}
								label="拡大位置をそろえる"
								ariaLabel="ズーム同期"
								active={syncZoom ?? false}
								onClick={onToggleSyncZoom}
							/>
						)}
					</div>
				)}
			</Section>
		</aside>
	);
};
