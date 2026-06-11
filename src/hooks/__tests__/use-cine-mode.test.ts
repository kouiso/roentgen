// @vitest-environment happy-dom
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useCineMode } from "../use-cine-mode";

describe("useCineMode", () => {
	it("starts with isPlaying=false and fps=10", () => {
		const { result } = renderHook(() =>
			useCineMode({ nextFrame: vi.fn(), maxFrame: 10, currentFrame: 0 }),
		);
		expect(result.current.isPlaying).toBe(false);
		expect(result.current.fps).toBe(10);
	});

	it("togglePlay toggles isPlaying state", () => {
		const { result } = renderHook(() =>
			useCineMode({ nextFrame: vi.fn(), maxFrame: 10, currentFrame: 0 }),
		);

		act(() => result.current.togglePlay());
		expect(result.current.isPlaying).toBe(true);

		act(() => result.current.togglePlay());
		expect(result.current.isPlaying).toBe(false);
	});

	it("increaseFps increases by 5, capped at 30", () => {
		const { result } = renderHook(() =>
			useCineMode({ nextFrame: vi.fn(), maxFrame: 10, currentFrame: 0 }),
		);

		// Default is 10 → 15
		act(() => result.current.increaseFps());
		expect(result.current.fps).toBe(15);

		act(() => result.current.increaseFps());
		expect(result.current.fps).toBe(20);

		act(() => result.current.increaseFps());
		expect(result.current.fps).toBe(25);

		act(() => result.current.increaseFps());
		expect(result.current.fps).toBe(30);

		// Should not exceed 30
		act(() => result.current.increaseFps());
		expect(result.current.fps).toBe(30);
	});

	it("decreaseFps decreases by 5, minimum 5", () => {
		const { result } = renderHook(() =>
			useCineMode({ nextFrame: vi.fn(), maxFrame: 10, currentFrame: 0 }),
		);

		// Default is 10 → 5
		act(() => result.current.decreaseFps());
		expect(result.current.fps).toBe(5);

		// Should not go below 5
		act(() => result.current.decreaseFps());
		expect(result.current.fps).toBe(5);
	});

	it("setFps allows setting arbitrary fps", () => {
		const { result } = renderHook(() =>
			useCineMode({ nextFrame: vi.fn(), maxFrame: 10, currentFrame: 0 }),
		);

		act(() => result.current.setFps(20));
		expect(result.current.fps).toBe(20);
	});

	it("calls nextFrame periodically when playing", () => {
		vi.useFakeTimers();
		const nextFrame = vi.fn();

		const { result } = renderHook(() =>
			useCineMode({ nextFrame, maxFrame: 10, currentFrame: 0 }),
		);

		act(() => result.current.togglePlay());
		expect(result.current.isPlaying).toBe(true);

		// fps=10 → interval=100ms
		act(() => vi.advanceTimersByTime(100));
		expect(nextFrame).toHaveBeenCalled();

		act(() => vi.advanceTimersByTime(100));
		expect(nextFrame.mock.calls.length).toBeGreaterThanOrEqual(2);

		vi.useRealTimers();
	});

	it("does not start interval when maxFrame is 0", () => {
		vi.useFakeTimers();
		const nextFrame = vi.fn();

		const { result } = renderHook(() =>
			useCineMode({ nextFrame, maxFrame: 0, currentFrame: 0 }),
		);

		act(() => result.current.togglePlay());
		act(() => vi.advanceTimersByTime(500));

		expect(nextFrame).not.toHaveBeenCalled();

		vi.useRealTimers();
	});

	it("stops playing when currentFrame reaches maxFrame", () => {
		vi.useFakeTimers();
		const nextFrame = vi.fn();

		// currentFrame=10, maxFrame=10 → should auto-stop
		const { result } = renderHook(() =>
			useCineMode({ nextFrame, maxFrame: 10, currentFrame: 10 }),
		);

		act(() => result.current.togglePlay());
		act(() => vi.advanceTimersByTime(200));

		// Should have called setIsPlaying(false) because currentFrame >= maxFrame
		expect(result.current.isPlaying).toBe(false);

		vi.useRealTimers();
	});

	it("resets to frame 0 before playing from the last frame", () => {
		vi.useFakeTimers();
		const nextFrame = vi.fn();
		const setFrame = vi.fn();

		const { result } = renderHook(() =>
			useCineMode({
				nextFrame,
				setFrame,
				maxFrame: 10,
				currentFrame: 10,
			}),
		);

		act(() => result.current.togglePlay());

		expect(setFrame).toHaveBeenCalledWith(0);
		expect(result.current.isPlaying).toBe(true);

		act(() => vi.advanceTimersByTime(100));
		expect(nextFrame).toHaveBeenCalled();

		vi.useRealTimers();
	});
});
