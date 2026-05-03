// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import type { ViewerWorldInfo } from "@/types/viewer";
import { INITIAL_WORLD_INFO } from "@/types/viewer";
import { useViewerControls } from "../use-viewer-controls";

// Helper to render the hook with a real useState
function renderViewerControls(
	viewportOverrides?: Partial<{
		getZoom: () => number;
		zoomTo: (z: number) => void;
		zoomBy: (f: number) => void;
		panBy: (d: { x: number; y: number }) => void;
		fitBounds: (r: unknown) => void;
		getHomeBounds: () => {
			x: number;
			y: number;
			width: number;
			height: number;
		};
	}>,
) {
	const mockViewport = {
		getZoom: vi.fn(() => 1),
		zoomTo: vi.fn(),
		zoomBy: vi.fn(),
		panBy: vi.fn(),
		fitBounds: vi.fn(),
		getHomeBounds: vi.fn(() => ({ x: 0, y: 0, width: 1, height: 1 })),
		...viewportOverrides,
	};

	const { result } = renderHook(() => {
		const [worldInfo, setWorldInfo] = useState<ViewerWorldInfo>({
			...INITIAL_WORLD_INFO,
			windowWidth: 400,
			windowCenter: 40,
		});
		const controls = useViewerControls({
			setWorldInfo,
			getViewport: () => mockViewport,
		});
		return { worldInfo, controls };
	});

	return { result, mockViewport };
}

describe("useViewerControls", () => {
	it("setWwWc updates windowWidth and windowCenter", () => {
		const { result } = renderViewerControls();

		act(() => result.current.controls.setWwWc(500, 50));
		expect(result.current.worldInfo.windowWidth).toBe(500);
		expect(result.current.worldInfo.windowCenter).toBe(50);
	});

	it("setWwWc enforces minimum windowWidth of 1", () => {
		const { result } = renderViewerControls();

		act(() => result.current.controls.setWwWc(0, 50));
		expect(result.current.worldInfo.windowWidth).toBe(1);

		act(() => result.current.controls.setWwWc(-10, 50));
		expect(result.current.worldInfo.windowWidth).toBe(1);
	});

	it("adjustWwWc applies delta to current values", () => {
		const { result } = renderViewerControls();

		// Start: WW=400, WC=40
		act(() => result.current.controls.adjustWwWc(100, 10));
		expect(result.current.worldInfo.windowWidth).toBe(500);
		expect(result.current.worldInfo.windowCenter).toBe(50);
	});

	it("adjustWwWc enforces minimum windowWidth of 1", () => {
		const { result } = renderViewerControls();

		// Start: WW=400 → subtract 500 → should clamp to 1
		act(() => result.current.controls.adjustWwWc(-500, 0));
		expect(result.current.worldInfo.windowWidth).toBe(1);
	});

	it("toggleInvert flips invert state", () => {
		const { result } = renderViewerControls();

		expect(result.current.worldInfo.invert).toBe(false);

		act(() => result.current.controls.toggleInvert());
		expect(result.current.worldInfo.invert).toBe(true);

		act(() => result.current.controls.toggleInvert());
		expect(result.current.worldInfo.invert).toBe(false);
	});

	it("fitSize calls viewport.fitBounds with home bounds", () => {
		const { result, mockViewport } = renderViewerControls();

		act(() => result.current.controls.fitSize());
		expect(mockViewport.getHomeBounds).toHaveBeenCalled();
		expect(mockViewport.fitBounds).toHaveBeenCalledWith({
			x: 0,
			y: 0,
			width: 1,
			height: 1,
		});
	});

	it("oneToOneSize calls viewport.zoomTo(1)", () => {
		const { result, mockViewport } = renderViewerControls();

		act(() => result.current.controls.oneToOneSize());
		expect(mockViewport.zoomTo).toHaveBeenCalledWith(1);
	});

	it("zoomBy calls viewport.zoomBy with factor", () => {
		const { result, mockViewport } = renderViewerControls();

		act(() => result.current.controls.zoomBy(1.5));
		expect(mockViewport.zoomBy).toHaveBeenCalledWith(1.5);
	});

	it("panBy calls viewport.panBy with delta", () => {
		const { result, mockViewport } = renderViewerControls();

		act(() => result.current.controls.panBy(10, 20));
		expect(mockViewport.panBy).toHaveBeenCalledWith({ x: 10, y: 20 });
	});

	it("resetImage restores WW/WC and resets transforms", () => {
		const { result, mockViewport } = renderViewerControls();

		// Modify state first
		act(() => result.current.controls.toggleInvert());
		act(() => result.current.controls.rotate(90));

		// Reset
		act(() => result.current.controls.resetImage(400, 40));

		expect(result.current.worldInfo.windowWidth).toBe(400);
		expect(result.current.worldInfo.windowCenter).toBe(40);
		expect(result.current.worldInfo.invert).toBe(false);
		expect(result.current.worldInfo.rotation).toBe(0);
		expect(result.current.worldInfo.flipHorizontal).toBe(false);
		expect(result.current.worldInfo.flipVertical).toBe(false);
		expect(mockViewport.fitBounds).toHaveBeenCalled();
	});

	it("rotate adds degrees to current rotation (mod 360)", () => {
		const { result } = renderViewerControls();

		act(() => result.current.controls.rotate(90));
		expect(result.current.worldInfo.rotation).toBe(90);

		act(() => result.current.controls.rotate(90));
		expect(result.current.worldInfo.rotation).toBe(180);

		act(() => result.current.controls.rotate(90));
		expect(result.current.worldInfo.rotation).toBe(270);

		act(() => result.current.controls.rotate(90));
		expect(result.current.worldInfo.rotation).toBe(0);
	});

	it("rotate handles negative degrees", () => {
		const { result } = renderViewerControls();

		act(() => result.current.controls.rotate(-90));
		expect(result.current.worldInfo.rotation).toBe(270);

		act(() => result.current.controls.rotate(-450));
		expect(result.current.worldInfo.rotation).toBe(180);
	});

	it("toggleFlipHorizontal flips horizontal state", () => {
		const { result } = renderViewerControls();

		expect(result.current.worldInfo.flipHorizontal).toBe(false);

		act(() => result.current.controls.toggleFlipHorizontal());
		expect(result.current.worldInfo.flipHorizontal).toBe(true);

		act(() => result.current.controls.toggleFlipHorizontal());
		expect(result.current.worldInfo.flipHorizontal).toBe(false);
	});

	it("toggleFlipVertical flips vertical state", () => {
		const { result } = renderViewerControls();

		expect(result.current.worldInfo.flipVertical).toBe(false);

		act(() => result.current.controls.toggleFlipVertical());
		expect(result.current.worldInfo.flipVertical).toBe(true);

		act(() => result.current.controls.toggleFlipVertical());
		expect(result.current.worldInfo.flipVertical).toBe(false);
	});

	it("fitSize does nothing when viewport is null", () => {
		const { result } = renderHook(() => {
			const [, setWorldInfo] = useState<ViewerWorldInfo>(INITIAL_WORLD_INFO);
			const controls = useViewerControls({
				setWorldInfo,
				getViewport: () => null,
			});
			return { controls };
		});

		// Should not throw
		act(() => result.current.controls.fitSize());
	});

	it("zoomBy does nothing when viewport is null", () => {
		const { result } = renderHook(() => {
			const [, setWorldInfo] = useState<ViewerWorldInfo>(INITIAL_WORLD_INFO);
			const controls = useViewerControls({
				setWorldInfo,
				getViewport: () => null,
			});
			return { controls };
		});

		// Should not throw
		act(() => result.current.controls.zoomBy(2));
	});

	it("panBy does nothing when viewport is null", () => {
		const { result } = renderHook(() => {
			const [, setWorldInfo] = useState<ViewerWorldInfo>(INITIAL_WORLD_INFO);
			const controls = useViewerControls({
				setWorldInfo,
				getViewport: () => null,
			});
			return { controls };
		});

		// Should not throw
		act(() => result.current.controls.panBy(10, 10));
	});
});
