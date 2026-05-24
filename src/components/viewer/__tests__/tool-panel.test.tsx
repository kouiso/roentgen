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

	it("does not clear all DICOM when confirmation is canceled", () => {
		vi.spyOn(window, "confirm").mockReturnValue(false);
		const onClearAll = vi.fn();
		render(<ToolPanel {...makeProps({ onClearAll })} />);

		fireEvent.click(screen.getByRole("button", { name: "全クリア" }));

		expect(window.confirm).toHaveBeenCalledWith(
			"全 DICOM をクリアします。よろしいですか？",
		);
		expect(onClearAll).not.toHaveBeenCalled();
	});

	it("clears all DICOM after confirmation", () => {
		vi.spyOn(window, "confirm").mockReturnValue(true);
		const onClearAll = vi.fn();
		render(<ToolPanel {...makeProps({ onClearAll })} />);

		fireEvent.click(screen.getByRole("button", { name: "全クリア" }));

		expect(onClearAll).toHaveBeenCalledOnce();
	});

	it("does not clear measurements when confirmation is canceled", () => {
		vi.spyOn(window, "confirm").mockReturnValue(false);
		const onClearMeasurements = vi.fn();
		render(
			<ToolPanel
				{...makeProps({ hasMeasurements: true, onClearMeasurements })}
			/>,
		);

		fireEvent.click(screen.getByRole("button", { name: "計測クリア" }));

		expect(window.confirm).toHaveBeenCalledWith(
			"すべての計測をクリアします。よろしいですか？",
		);
		expect(onClearMeasurements).not.toHaveBeenCalled();
	});

	it("clears measurements after confirmation", () => {
		vi.spyOn(window, "confirm").mockReturnValue(true);
		const onClearMeasurements = vi.fn();
		render(
			<ToolPanel
				{...makeProps({ hasMeasurements: true, onClearMeasurements })}
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
				{...makeProps({ hasAnnotations: true, onClearAnnotations })}
			/>,
		);

		fireEvent.click(screen.getByRole("button", { name: "注釈クリア" }));

		expect(window.confirm).toHaveBeenCalledWith(
			"すべての注釈をクリアします。よろしいですか？",
		);
		expect(onClearAnnotations).not.toHaveBeenCalled();
	});

	it("clears annotations after confirmation", () => {
		vi.spyOn(window, "confirm").mockReturnValue(true);
		const onClearAnnotations = vi.fn();
		render(
			<ToolPanel
				{...makeProps({ hasAnnotations: true, onClearAnnotations })}
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
});
