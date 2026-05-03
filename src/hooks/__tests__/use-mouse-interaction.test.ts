// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { VIEWER_CONTROL_TYPE } from "@/types/viewer";
import { useMouseInteraction } from "../use-mouse-interaction";

function makeProps(
	overrides?: Partial<Parameters<typeof useMouseInteraction>[0]>,
) {
	return {
		containerId: "test-container",
		activeMode: VIEWER_CONTROL_TYPE.WW_WC as Parameters<
			typeof useMouseInteraction
		>[0]["activeMode"],
		onModeChange: vi.fn(),
		adjustWwWc: vi.fn(),
		zoomBy: vi.fn(),
		panBy: vi.fn(),
		currentWindowWidth: 400,
		onNextFrame: vi.fn(),
		onPrevFrame: vi.fn(),
		enabled: true,
		...overrides,
	};
}

describe("useMouseInteraction", () => {
	let container: HTMLDivElement;

	beforeEach(() => {
		container = document.createElement("div");
		container.id = "test-container";
		const osdContainer = document.createElement("div");
		osdContainer.className = "openseadragon-container";
		const osdCanvas = document.createElement("div");
		osdCanvas.className = "openseadragon-canvas";
		const canvas = document.createElement("canvas");
		osdCanvas.appendChild(canvas);
		osdContainer.appendChild(osdCanvas);
		container.appendChild(osdContainer);
		// Set clientWidth for pan calculations
		Object.defineProperty(container, "clientWidth", {
			value: 800,
			configurable: true,
		});
		document.body.appendChild(container);
	});

	afterEach(() => {
		document.body.removeChild(container);
	});

	it("registers event listeners when enabled", () => {
		const spy = vi.spyOn(container, "addEventListener");
		const props = makeProps();
		renderHook(() => useMouseInteraction(props));

		const registeredEvents = spy.mock.calls.map((c) => c[0]);
		expect(registeredEvents).toContain("mousedown");
		expect(registeredEvents).toContain("mousemove");
		expect(registeredEvents).toContain("mouseup");
		expect(registeredEvents).toContain("mouseleave");
		expect(registeredEvents).toContain("wheel");
		expect(registeredEvents).toContain("contextmenu");
	});

	it("does not register listeners when disabled", () => {
		const spy = vi.spyOn(container, "addEventListener");
		const props = makeProps({ enabled: false });
		renderHook(() => useMouseInteraction(props));

		expect(spy).not.toHaveBeenCalled();
	});

	it("adjusts WW/WC with window-width scaling on left-button drag in WW_WC mode", () => {
		const props = makeProps({
			activeMode: VIEWER_CONTROL_TYPE.WW_WC,
			currentWindowWidth: 4000,
		});
		renderHook(() => useMouseInteraction(props));

		// Mouse down (left button)
		container.dispatchEvent(
			new MouseEvent("mousedown", {
				button: 0,
				buttons: 1,
				clientX: 100,
				clientY: 100,
				bubbles: true,
			}),
		);

		// Mouse move (drag right and up)
		container.dispatchEvent(
			new MouseEvent("mousemove", { clientX: 110, clientY: 90, bubbles: true }),
		);

		// scale = currentWindowWidth / containerWidth + 1 = 4000 / 800 + 1 = 6
		expect(props.adjustWwWc).toHaveBeenCalledWith(60, 60);
	});

	it("zooms on left-button drag in ZOOM mode", () => {
		const props = makeProps({ activeMode: VIEWER_CONTROL_TYPE.ZOOM });
		renderHook(() => useMouseInteraction(props));

		container.dispatchEvent(
			new MouseEvent("mousedown", {
				button: 0,
				buttons: 1,
				clientX: 100,
				clientY: 100,
				bubbles: true,
			}),
		);
		container.dispatchEvent(
			new MouseEvent("mousemove", { clientX: 100, clientY: 80, bubbles: true }),
		);

		// deltaY=-20 → zoomBy(1 - (-20)*0.005) = zoomBy(1.1)
		expect(props.zoomBy).toHaveBeenCalledWith(1.1);
	});

	it("pans on left-button drag in PAN mode", () => {
		const props = makeProps({ activeMode: VIEWER_CONTROL_TYPE.PAN });
		renderHook(() => useMouseInteraction(props));

		container.dispatchEvent(
			new MouseEvent("mousedown", {
				button: 0,
				buttons: 1,
				clientX: 100,
				clientY: 100,
				bubbles: true,
			}),
		);
		container.dispatchEvent(
			new MouseEvent("mousemove", {
				clientX: 120,
				clientY: 110,
				bubbles: true,
			}),
		);

		// deltaX=20, deltaY=10 → panBy(-20/800, -10/800)
		expect(props.panBy).toHaveBeenCalledWith(-20 / 800, -10 / 800);
	});

	it("applies grab cursor to OSD layers in PAN mode", () => {
		const props = makeProps({ activeMode: VIEWER_CONTROL_TYPE.PAN });
		renderHook(() => useMouseInteraction(props));

		const osdContainer = container.querySelector(".openseadragon-container");
		const osdCanvas = container.querySelector(".openseadragon-canvas");
		const canvas = container.querySelector("canvas");

		expect(container.style.cursor).toBe("grab");
		expect(osdContainer).not.toBeNull();
		expect(osdCanvas).not.toBeNull();
		expect(canvas).not.toBeNull();
		expect((osdContainer as HTMLElement).style.cursor).toBe("grab");
		expect((osdCanvas as HTMLElement).style.cursor).toBe("grab");
		expect((canvas as HTMLCanvasElement).style.cursor).toBe("grab");
	});

	it("switches cursor to grabbing while dragging in PAN mode", () => {
		const props = makeProps({ activeMode: VIEWER_CONTROL_TYPE.PAN });
		renderHook(() => useMouseInteraction(props));

		container.dispatchEvent(
			new MouseEvent("mousedown", {
				button: 0,
				buttons: 1,
				clientX: 100,
				clientY: 100,
				bubbles: true,
			}),
		);

		const osdCanvas = container.querySelector(".openseadragon-canvas");
		expect(container.style.cursor).toBe("grabbing");
		expect((osdCanvas as HTMLElement).style.cursor).toBe("grabbing");

		container.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));

		expect(container.style.cursor).toBe("grab");
		expect((osdCanvas as HTMLElement).style.cursor).toBe("grab");
	});

	it("cycles mode on left+right simultaneous press (buttons=3)", () => {
		const props = makeProps({ activeMode: VIEWER_CONTROL_TYPE.WW_WC });
		renderHook(() => useMouseInteraction(props));

		container.dispatchEvent(
			new MouseEvent("mousedown", {
				button: 0,
				buttons: 3,
				clientX: 100,
				clientY: 100,
				bubbles: true,
			}),
		);

		// WW_WC → ZOOM (next in cycle)
		expect(props.onModeChange).toHaveBeenCalledWith(VIEWER_CONTROL_TYPE.ZOOM);
	});

	it("cycles from PAN back to WW_WC", () => {
		const props = makeProps({ activeMode: VIEWER_CONTROL_TYPE.PAN });
		renderHook(() => useMouseInteraction(props));

		container.dispatchEvent(
			new MouseEvent("mousedown", {
				button: 0,
				buttons: 3,
				clientX: 100,
				clientY: 100,
				bubbles: true,
			}),
		);

		expect(props.onModeChange).toHaveBeenCalledWith(VIEWER_CONTROL_TYPE.WW_WC);
	});

	it("stops dragging on mouseup", () => {
		const props = makeProps({ activeMode: VIEWER_CONTROL_TYPE.WW_WC });
		renderHook(() => useMouseInteraction(props));

		// Start drag
		container.dispatchEvent(
			new MouseEvent("mousedown", {
				button: 0,
				buttons: 1,
				clientX: 100,
				clientY: 100,
				bubbles: true,
			}),
		);

		// Mouse up
		container.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));

		// Move after mouseup should not trigger anything
		container.dispatchEvent(
			new MouseEvent("mousemove", {
				clientX: 200,
				clientY: 200,
				bubbles: true,
			}),
		);

		expect(props.adjustWwWc).not.toHaveBeenCalled();
	});

	it("stops dragging on window mouseup outside the container", () => {
		const props = makeProps({ activeMode: VIEWER_CONTROL_TYPE.WW_WC });
		renderHook(() => useMouseInteraction(props));

		container.dispatchEvent(
			new MouseEvent("mousedown", {
				button: 0,
				buttons: 1,
				clientX: 100,
				clientY: 100,
				bubbles: true,
			}),
		);

		window.dispatchEvent(new MouseEvent("mouseup"));

		container.dispatchEvent(
			new MouseEvent("mousemove", {
				clientX: 200,
				clientY: 200,
				bubbles: true,
			}),
		);

		expect(props.adjustWwWc).not.toHaveBeenCalled();
	});

	it("resets cursor to grab on mouseleave while dragging in PAN mode", () => {
		const props = makeProps({ activeMode: VIEWER_CONTROL_TYPE.PAN });
		renderHook(() => useMouseInteraction(props));

		container.dispatchEvent(
			new MouseEvent("mousedown", {
				button: 0,
				buttons: 1,
				clientX: 100,
				clientY: 100,
				bubbles: true,
			}),
		);
		expect(container.style.cursor).toBe("grabbing");

		container.dispatchEvent(new MouseEvent("mouseleave", { bubbles: true }));
		expect(container.style.cursor).toBe("grab");
	});

	it("resets cursor to default when switching from PAN to WW_WC mode", () => {
		const props = makeProps({ activeMode: VIEWER_CONTROL_TYPE.PAN });
		const { rerender } = renderHook(
			(p: Parameters<typeof useMouseInteraction>[0]) => useMouseInteraction(p),
			{ initialProps: props },
		);

		expect(container.style.cursor).toBe("grab");

		rerender({ ...props, activeMode: VIEWER_CONTROL_TYPE.WW_WC });
		expect(container.style.cursor).toBe("default");
	});

	it("stops dragging on mouseleave", () => {
		const props = makeProps({ activeMode: VIEWER_CONTROL_TYPE.WW_WC });
		renderHook(() => useMouseInteraction(props));

		container.dispatchEvent(
			new MouseEvent("mousedown", {
				button: 0,
				buttons: 1,
				clientX: 100,
				clientY: 100,
				bubbles: true,
			}),
		);
		container.dispatchEvent(new MouseEvent("mouseleave", { bubbles: true }));

		container.dispatchEvent(
			new MouseEvent("mousemove", {
				clientX: 200,
				clientY: 200,
				bubbles: true,
			}),
		);

		expect(props.adjustWwWc).not.toHaveBeenCalled();
	});

	it("scrolls through frames on wheel", () => {
		const props = makeProps();
		renderHook(() => useMouseInteraction(props));

		// Scroll down → next frame
		container.dispatchEvent(
			new WheelEvent("wheel", { deltaY: 100, bubbles: true, cancelable: true }),
		);
		expect(props.onNextFrame).toHaveBeenCalledOnce();

		// Scroll up → prev frame
		container.dispatchEvent(
			new WheelEvent("wheel", {
				deltaY: -100,
				bubbles: true,
				cancelable: true,
			}),
		);
		expect(props.onPrevFrame).toHaveBeenCalledOnce();
	});

	it("prevents context menu on right click", () => {
		const props = makeProps();
		renderHook(() => useMouseInteraction(props));

		const event = new MouseEvent("contextmenu", {
			bubbles: true,
			cancelable: true,
		});
		const spy = vi.spyOn(event, "preventDefault");
		container.dispatchEvent(event);
		expect(spy).toHaveBeenCalled();
	});

	it("does not trigger drag when both buttons pressed", () => {
		const props = makeProps({ activeMode: VIEWER_CONTROL_TYPE.WW_WC });
		renderHook(() => useMouseInteraction(props));

		// Both buttons
		container.dispatchEvent(
			new MouseEvent("mousedown", {
				button: 0,
				buttons: 3,
				clientX: 100,
				clientY: 100,
				bubbles: true,
			}),
		);

		// Move should not trigger adjustWwWc since bothButtons was detected
		container.dispatchEvent(
			new MouseEvent("mousemove", {
				clientX: 200,
				clientY: 200,
				bubbles: true,
			}),
		);

		expect(props.adjustWwWc).not.toHaveBeenCalled();
	});
});
