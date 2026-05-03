// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { OSDViewer } from "../use-cornerstone";
import { useOpenSeaDragon } from "../use-open-sea-dragon";

type MockViewer = OSDViewer & {
	handlers: Map<string, () => void>;
	destroy: ReturnType<typeof vi.fn>;
};

const osdState = vi.hoisted(() => ({
	viewers: [] as MockViewer[],
}));

vi.mock("openseadragon", () => ({
	default: vi.fn(() => {
		const handlers = new Map<string, () => void>();
		const viewer: MockViewer = {
			handlers,
			addHandler: (event, handler) => {
				handlers.set(event, () => handler({}));
			},
			removeAllHandlers: (event) => {
				handlers.delete(event);
			},
			world: { needsDraw: () => false },
			viewport: {
				getZoom: () => 1,
				zoomTo: vi.fn(),
				zoomBy: vi.fn(),
				panTo: vi.fn(),
				panBy: vi.fn(),
				fitBounds: vi.fn(),
				getHomeBounds: () => ({ x: 0, y: 0, width: 1, height: 1 }),
				getCenter: () => ({ x: 0, y: 0 }),
			},
			addTiledImage: vi.fn(),
			forceRedraw: vi.fn(),
			imageLoader: { clear: vi.fn() },
			destroy: vi.fn(),
		};
		osdState.viewers.push(viewer);
		return viewer;
	}),
}));

describe("useOpenSeaDragon Wave 4 polish", () => {
	beforeEach(() => {
		osdState.viewers = [];
		const container = document.createElement("div");
		container.id = "osd-test";
		document.body.appendChild(container);
		vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
			callback(0);
			return 1;
		});
		vi.stubGlobal(
			"ResizeObserver",
			class MockResizeObserver {
				observe = vi.fn();
				unobserve = vi.fn();
				disconnect = vi.fn();
			},
		);
		Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
			configurable: true,
			value: vi.fn(() => ({})),
		});
	});

	afterEach(() => {
		document.body.innerHTML = "";
		vi.unstubAllGlobals();
	});

	it("R5: calls onViewerCreated only after the OSD open event", async () => {
		const onViewerCreated = vi.fn();
		const { result } = renderHook(() =>
			useOpenSeaDragon({
				containerId: "osd-test",
				imageWidth: 10,
				imageHeight: 10,
				onViewerCreated,
			}),
		);

		await act(async () => {
			await result.current.initViewer();
		});

		const viewer = osdState.viewers[0];
		if (!viewer) throw new Error("viewer was not created");
		expect(onViewerCreated).not.toHaveBeenCalled();
		expect(result.current.tileReady).toBe(false);

		const open = viewer.handlers.get("open");
		if (!open) throw new Error("open handler was not registered");
		act(() => {
			open();
		});

		expect(result.current.tileReady).toBe(true);
		expect(onViewerCreated).toHaveBeenCalledWith(viewer);
	});

	it("S4: ignores stale open callbacks after a StrictMode-style recreate", async () => {
		const onViewerCreated = vi.fn();
		const onViewerDestroyed = vi.fn();
		const { result, rerender } = renderHook(
			({ imageWidth, imageHeight }) =>
				useOpenSeaDragon({
					containerId: "osd-test",
					imageWidth,
					imageHeight,
					onViewerCreated,
					onViewerDestroyed,
				}),
			{ initialProps: { imageWidth: 10, imageHeight: 10 } },
		);

		await act(async () => {
			await result.current.initViewer();
		});

		const firstViewer = osdState.viewers[0];
		if (!firstViewer) throw new Error("first viewer was not created");

		await act(async () => {
			rerender({ imageWidth: 20, imageHeight: 20 });
		});

		expect(firstViewer.destroy).toHaveBeenCalledTimes(1);
		expect(onViewerDestroyed).toHaveBeenCalledTimes(1);

		await act(async () => {
			await result.current.initViewer();
		});

		const secondViewer = osdState.viewers[1];
		if (!secondViewer) throw new Error("second viewer was not created");

		const staleOpen = firstViewer.handlers.get("open");
		if (!staleOpen) throw new Error("first open handler was not registered");
		act(() => {
			staleOpen();
		});

		expect(result.current.tileReady).toBe(false);
		expect(secondViewer.destroy).not.toHaveBeenCalled();

		const latestOpen = secondViewer.handlers.get("open");
		if (!latestOpen) throw new Error("second open handler was not registered");
		act(() => {
			latestOpen();
		});

		expect(result.current.tileReady).toBe(true);
		expect(onViewerCreated).toHaveBeenLastCalledWith(secondViewer);
	});
});
