// @vitest-environment happy-dom
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useViewerSlider } from "../use-viewer-slider";

describe("useViewerSlider", () => {
	it("starts with currentFrame=0 and maxFrame=0", () => {
		const { result } = renderHook(() => useViewerSlider());
		expect(result.current.sliderState.currentFrame).toBe(0);
		expect(result.current.sliderState.maxFrame).toBe(0);
	});

	it("setFrame updates currentFrame", () => {
		const { result } = renderHook(() => useViewerSlider());

		act(() => result.current.setFrame(5));
		expect(result.current.sliderState.currentFrame).toBe(5);
	});

	it("setMaxFrame updates maxFrame", () => {
		const { result } = renderHook(() => useViewerSlider());

		act(() => result.current.setMaxFrame(20));
		expect(result.current.sliderState.maxFrame).toBe(20);
	});

	it("nextFrame increments currentFrame by 1", () => {
		const { result } = renderHook(() => useViewerSlider());

		act(() => result.current.setMaxFrame(10));
		act(() => result.current.nextFrame());
		expect(result.current.sliderState.currentFrame).toBe(1);

		act(() => result.current.nextFrame());
		expect(result.current.sliderState.currentFrame).toBe(2);
	});

	it("nextFrame does not exceed maxFrame", () => {
		const { result } = renderHook(() => useViewerSlider());

		act(() => result.current.setMaxFrame(2));
		act(() => result.current.setFrame(2));
		act(() => result.current.nextFrame());

		expect(result.current.sliderState.currentFrame).toBe(2);
	});

	it("prevFrame decrements currentFrame by 1", () => {
		const { result } = renderHook(() => useViewerSlider());

		act(() => result.current.setMaxFrame(10));
		act(() => result.current.setFrame(5));
		act(() => result.current.prevFrame());

		expect(result.current.sliderState.currentFrame).toBe(4);
	});

	it("prevFrame does not go below 0", () => {
		const { result } = renderHook(() => useViewerSlider());

		act(() => result.current.prevFrame());
		expect(result.current.sliderState.currentFrame).toBe(0);
	});

	it("sequential next/prev operations work correctly", () => {
		const { result } = renderHook(() => useViewerSlider());

		act(() => result.current.setMaxFrame(10));

		// Go forward 3 times
		act(() => result.current.nextFrame());
		act(() => result.current.nextFrame());
		act(() => result.current.nextFrame());
		expect(result.current.sliderState.currentFrame).toBe(3);

		// Go back 1 time
		act(() => result.current.prevFrame());
		expect(result.current.sliderState.currentFrame).toBe(2);
	});
});
