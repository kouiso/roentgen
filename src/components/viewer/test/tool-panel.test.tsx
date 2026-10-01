// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LAYOUT_TYPE } from "@/types/layout";
import { VIEWER_CONTROL_TYPE } from "@/types/viewer";
import { ToolPanel, type ToolPanelProps } from "../tool-panel";

const makeProps = (
	overrides: Partial<ToolPanelProps> = {},
): ToolPanelProps => ({
	activeMode: VIEWER_CONTROL_TYPE.PAN,
	onModeChange: vi.fn(),
	onFitSize: vi.fn(),
	onOneToOne: vi.fn(),
	onToggleInvert: vi.fn(),
	onReset: vi.fn(),
	onRotateCW: vi.fn(),
	onRotateCCW: vi.fn(),
	onFlipH: vi.fn(),
	onFlipV: vi.fn(),
	showOverlay: true,
	onToggleOverlay: vi.fn(),
	showDirection: true,
	onToggleDirection: vi.fn(),
	species: "equine",
	onToggleSpecies: vi.fn(),
	onSetWwWc: vi.fn(),
	isPlaying: false,
	fps: 10,
	onTogglePlay: vi.fn(),
	onIncreaseFps: vi.fn(),
	onDecreaseFps: vi.fn(),
	onClearMeasurements: vi.fn(),
	hasMeasurements: false,
	activeAnnotationTool: null,
	onStartTextTool: vi.fn(),
	onStartArrowTool: vi.fn(),
	onStartRectTool: vi.fn(),
	onStartEllipseTool: vi.fn(),
	onStartFreehandTool: vi.fn(),
	onClearAnnotations: vi.fn(),
	hasAnnotations: false,
	isInverted: false,
	onClearSelected: vi.fn(),
	onClearAll: vi.fn(),
	onScreenshot: vi.fn(),
	onPrint: vi.fn(),
	isFullscreen: false,
	onToggleFullscreen: vi.fn(),
	layout: LAYOUT_TYPE.ONE_BY_ONE,
	onSetLayout: vi.fn(),
	viewerReady: true,
	...overrides,
});

describe("ToolPanel", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("does not clear all images when confirmation is canceled", () => {
		vi.spyOn(window, "confirm").mockReturnValue(false);
		const onClearAll = vi.fn();
		render(<ToolPanel {...makeProps({ onClearAll })} />);

		// 全部閉じる操作は誤タップを避けるため「くわしい設定」の中に置いている
		fireEvent.click(screen.getByRole("button", { name: /くわしい設定/ }));
		fireEvent.click(screen.getByRole("button", { name: "全クリア" }));

		expect(window.confirm).toHaveBeenCalledWith(
			"開いている画像をすべて閉じます。よろしいですか？",
		);
		expect(onClearAll).not.toHaveBeenCalled();
	});

	it("clears all images after confirmation", () => {
		vi.spyOn(window, "confirm").mockReturnValue(true);
		const onClearAll = vi.fn();
		render(<ToolPanel {...makeProps({ onClearAll })} />);

		// 全部閉じる操作は誤タップを避けるため「くわしい設定」の中に置いている
		fireEvent.click(screen.getByRole("button", { name: /くわしい設定/ }));
		fireEvent.click(screen.getByRole("button", { name: "全クリア" }));

		expect(onClearAll).toHaveBeenCalledOnce();
	});

	it("does not clear measurements when confirmation is canceled", () => {
		vi.spyOn(window, "confirm").mockReturnValue(false);
		const onClearMeasurements = vi.fn();
		render(
			<ToolPanel
				{...makeProps({
					hasMeasurements: true,
					onClearMeasurements,
				})}
			/>,
		);

		fireEvent.click(screen.getByRole("button", { name: "計測クリア" }));

		expect(window.confirm).toHaveBeenCalledWith(
			"測った線をすべて消します。よろしいですか？",
		);
		expect(onClearMeasurements).not.toHaveBeenCalled();
	});

	it("clears measurements after confirmation", () => {
		vi.spyOn(window, "confirm").mockReturnValue(true);
		const onClearMeasurements = vi.fn();
		render(
			<ToolPanel
				{...makeProps({
					hasMeasurements: true,
					onClearMeasurements,
				})}
			/>,
		);

		fireEvent.click(screen.getByRole("button", { name: "計測クリア" }));

		expect(onClearMeasurements).toHaveBeenCalledOnce();
	});

	it("does not clear annotations when confirmation is canceled", () => {
		vi.spyOn(window, "confirm").mockReturnValue(false);
		const onClearAnnotations = vi.fn();
		render(
			<ToolPanel
				{...makeProps({
					hasAnnotations: true,
					onClearAnnotations,
				})}
			/>,
		);

		fireEvent.click(screen.getByRole("button", { name: "注釈クリア" }));

		expect(window.confirm).toHaveBeenCalledWith(
			"書き込みをすべて消します。よろしいですか？",
		);
		expect(onClearAnnotations).not.toHaveBeenCalled();
	});

	it("clears annotations after confirmation", () => {
		vi.spyOn(window, "confirm").mockReturnValue(true);
		const onClearAnnotations = vi.fn();
		render(
			<ToolPanel
				{...makeProps({
					hasAnnotations: true,
					onClearAnnotations,
				})}
			/>,
		);

		fireEvent.click(screen.getByRole("button", { name: "注釈クリア" }));

		expect(onClearAnnotations).toHaveBeenCalledOnce();
	});

	it("starts the freehand annotation tool from the annotation controls", () => {
		const onStartFreehandTool = vi.fn();
		render(<ToolPanel {...makeProps({ onStartFreehandTool })} />);

		fireEvent.click(screen.getByRole("button", { name: "フリーハンド" }));

		expect(onStartFreehandTool).toHaveBeenCalledOnce();
	});

	it("marks the freehand annotation tool as active", () => {
		render(
			<ToolPanel
				{...makeProps({
					activeAnnotationTool: "freehand",
				})}
			/>,
		);

		expect(
			screen
				.getByRole("button", { name: "フリーハンド" })
				.getAttribute("aria-pressed"),
		).toBe("true");
	});

	it("exposes named FPS stepper controls", () => {
		const onDecreaseFps = vi.fn();
		const onIncreaseFps = vi.fn();
		render(<ToolPanel {...makeProps({ onDecreaseFps, onIncreaseFps })} />);

		// シリーズ再生は複数枚の連続撮影でしか使わないため「くわしい設定」の中にある
		fireEvent.click(screen.getByRole("button", { name: /くわしい設定/ }));

		fireEvent.click(screen.getByRole("button", { name: "再生速度を下げる" }));
		fireEvent.click(screen.getByRole("button", { name: "再生速度を上げる" }));

		expect(onDecreaseFps).toHaveBeenCalledOnce();
		expect(onIncreaseFps).toHaveBeenCalledOnce();
	});

	it("disables FPS steppers at their bounds", () => {
		const { rerender } = render(<ToolPanel {...makeProps({ fps: 5 })} />);

		// シリーズ再生は複数枚の連続撮影でしか使わないため「くわしい設定」の中にある
		fireEvent.click(screen.getByRole("button", { name: /くわしい設定/ }));

		expect(
			screen
				.getByRole("button", { name: "再生速度を下げる" })
				.hasAttribute("disabled"),
		).toBe(true);

		rerender(<ToolPanel {...makeProps({ fps: 30 })} />);

		expect(
			screen
				.getByRole("button", { name: "再生速度を上げる" })
				.hasAttribute("disabled"),
		).toBe(true);
	});
	it("applies owner presets relative to the image's own window", () => {
		const onSetWwWc = vi.fn();
		render(
			<ToolPanel
				{...makeProps({
					onSetWwWc,
					baseWW: 10000,
					baseWC: 8000,
					photometricInterpretation: "MONOCHROME2",
				})}
			/>,
		);

		fireEvent.click(screen.getByRole("button", { name: "骨を見やすく" }));

		// 絶対値（WW 2500 / WC 500）ではなく、その画像の窓を基準に骨側へ寄せる
		expect(onSetWwWc).toHaveBeenCalledWith(6000, 10000);
	});

	it("disables owner presets until the image window is known", () => {
		render(<ToolPanel {...makeProps()} />);

		expect(
			screen
				.getByRole("button", { name: "骨を見やすく" })
				.hasAttribute("disabled"),
		).toBe(true);
	});
});
