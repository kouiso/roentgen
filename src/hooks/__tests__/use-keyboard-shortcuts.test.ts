// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useKeyboardShortcuts } from "../use-keyboard-shortcuts";

function makeActions() {
	return {
		nextFrame: vi.fn(),
		prevFrame: vi.fn(),
		setModeWwWc: vi.fn(),
		setModeZoom: vi.fn(),
		setModePan: vi.fn(),
		fitSize: vi.fn(),
		toggleInvert: vi.fn(),
		resetImage: vi.fn(),
		toggleCinePlay: vi.fn(),
		setWwWcPreset: vi.fn(),
		toggleFullscreen: vi.fn(),
		printImage: vi.fn(),
		setModeMeasureDistance: vi.fn(),
		setModeMeasureAngle: vi.fn(),
		clearMeasurements: vi.fn(),
	};
}

function fireKey(key: string, init: KeyboardEventInit = {}) {
	window.dispatchEvent(
		new KeyboardEvent("keydown", { key, bubbles: true, ...init }),
	);
}

describe("useKeyboardShortcuts", () => {
	it("does not fire actions when disabled", () => {
		const actions = makeActions();
		renderHook(() => useKeyboardShortcuts(actions, false));

		fireKey("w");
		expect(actions.setModeWwWc).not.toHaveBeenCalled();
	});

	it("calls prevFrame on ArrowUp", () => {
		const actions = makeActions();
		renderHook(() => useKeyboardShortcuts(actions, true));
		fireKey("ArrowUp");
		expect(actions.prevFrame).toHaveBeenCalledOnce();
	});

	it("calls prevFrame on ArrowLeft", () => {
		const actions = makeActions();
		renderHook(() => useKeyboardShortcuts(actions, true));
		fireKey("ArrowLeft");
		expect(actions.prevFrame).toHaveBeenCalledOnce();
	});

	it("calls nextFrame on ArrowDown", () => {
		const actions = makeActions();
		renderHook(() => useKeyboardShortcuts(actions, true));
		fireKey("ArrowDown");
		expect(actions.nextFrame).toHaveBeenCalledOnce();
	});

	it("calls nextFrame on ArrowRight", () => {
		const actions = makeActions();
		renderHook(() => useKeyboardShortcuts(actions, true));
		fireKey("ArrowRight");
		expect(actions.nextFrame).toHaveBeenCalledOnce();
	});

	it("calls setModeWwWc on 'w'", () => {
		const actions = makeActions();
		renderHook(() => useKeyboardShortcuts(actions, true));
		fireKey("w");
		expect(actions.setModeWwWc).toHaveBeenCalledOnce();
	});

	it("calls setModeZoom on 'z'", () => {
		const actions = makeActions();
		renderHook(() => useKeyboardShortcuts(actions, true));
		fireKey("z");
		expect(actions.setModeZoom).toHaveBeenCalledOnce();
	});

	it("calls setModePan on 'p'", () => {
		const actions = makeActions();
		renderHook(() => useKeyboardShortcuts(actions, true));
		fireKey("p");
		expect(actions.setModePan).toHaveBeenCalledOnce();
	});

	it("calls fitSize on 'f'", () => {
		const actions = makeActions();
		renderHook(() => useKeyboardShortcuts(actions, true));
		fireKey("f");
		expect(actions.fitSize).toHaveBeenCalledOnce();
	});

	it("calls toggleInvert on 'i'", () => {
		const actions = makeActions();
		renderHook(() => useKeyboardShortcuts(actions, true));
		fireKey("i");
		expect(actions.toggleInvert).toHaveBeenCalledOnce();
	});

	it("calls resetImage on 'r'", () => {
		const actions = makeActions();
		renderHook(() => useKeyboardShortcuts(actions, true));
		fireKey("r");
		expect(actions.resetImage).toHaveBeenCalledOnce();
	});

	it("calls toggleCinePlay on Space", () => {
		const actions = makeActions();
		renderHook(() => useKeyboardShortcuts(actions, true));
		fireKey(" ");
		expect(actions.toggleCinePlay).toHaveBeenCalledOnce();
	});

	it("calls setModeMeasureDistance on 'd'", () => {
		const actions = makeActions();
		renderHook(() => useKeyboardShortcuts(actions, true));
		fireKey("d");
		expect(actions.setModeMeasureDistance).toHaveBeenCalledOnce();
	});

	it("calls setModeMeasureAngle on 'a'", () => {
		const actions = makeActions();
		renderHook(() => useKeyboardShortcuts(actions, true));
		fireKey("a");
		expect(actions.setModeMeasureAngle).toHaveBeenCalledOnce();
	});

	it("calls clearMeasurements on Delete", () => {
		const actions = makeActions();
		renderHook(() => useKeyboardShortcuts(actions, true));
		fireKey("Delete");
		expect(actions.clearMeasurements).toHaveBeenCalledOnce();
	});

	it("calls clearMeasurements on Backspace", () => {
		const actions = makeActions();
		renderHook(() => useKeyboardShortcuts(actions, true));
		fireKey("Backspace");
		expect(actions.clearMeasurements).toHaveBeenCalledOnce();
	});

	it("calls toggleFullscreen on F11", () => {
		const actions = makeActions();
		renderHook(() => useKeyboardShortcuts(actions, true));
		fireKey("F11");
		expect(actions.toggleFullscreen).toHaveBeenCalledOnce();
	});

	it("calls printImage on Ctrl+P", () => {
		const actions = makeActions();
		renderHook(() => useKeyboardShortcuts(actions, true));
		fireKey("p", { ctrlKey: true });
		expect(actions.printImage).toHaveBeenCalledOnce();
		expect(actions.setModePan).not.toHaveBeenCalled();
	});

	it("calls printImage on Cmd+P", () => {
		const actions = makeActions();
		renderHook(() => useKeyboardShortcuts(actions, true));
		fireKey("p", { metaKey: true });
		expect(actions.printImage).toHaveBeenCalledOnce();
		expect(actions.setModePan).not.toHaveBeenCalled();
	});

	it("calls setWwWcPreset with index for number keys 1-7", () => {
		const actions = makeActions();
		renderHook(() => useKeyboardShortcuts(actions, true));

		for (let i = 1; i <= 7; i++) {
			fireKey(String(i));
		}

		expect(actions.setWwWcPreset).toHaveBeenCalledTimes(7);
		expect(actions.setWwWcPreset).toHaveBeenNthCalledWith(1, 0);
		expect(actions.setWwWcPreset).toHaveBeenNthCalledWith(7, 6);
	});

	it("does not fire for number keys outside 1-7", () => {
		const actions = makeActions();
		renderHook(() => useKeyboardShortcuts(actions, true));
		fireKey("0");
		fireKey("8");
		fireKey("9");
		expect(actions.setWwWcPreset).not.toHaveBeenCalled();
	});
});
