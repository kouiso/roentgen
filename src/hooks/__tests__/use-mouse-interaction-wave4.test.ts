// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { VIEWER_CONTROL_TYPE } from "@/types/viewer";
import { useMouseInteraction } from "../use-mouse-interaction";

const makeProps = () => ({
	containerId: "mouse-test",
	activeMode: VIEWER_CONTROL_TYPE.WW_WC,
	onModeChange: vi.fn(),
	adjustWwWc: vi.fn(),
	zoomBy: vi.fn(),
	panBy: vi.fn(),
	currentWindowWidth: 400,
	onNextFrame: vi.fn(),
	onPrevFrame: vi.fn(),
	enabled: true,
});

describe("useMouseInteraction Wave 4 polish", () => {
	beforeEach(() => {
		const container = document.createElement("div");
		container.id = "mouse-test";
		document.body.appendChild(container);
	});

	afterEach(() => {
		document.body.innerHTML = "";
	});

	it("L4: Shift+Left cycles modes through the same path as the left+right chord", () => {
		const chordProps = makeProps();
		const chordHook = renderHook(() => useMouseInteraction(chordProps));
		const container = document.getElementById("mouse-test");
		if (!container) throw new Error("mouse container was not created");

		container.dispatchEvent(
			new MouseEvent("mousedown", {
				button: 0,
				buttons: 3,
				bubbles: true,
			}),
		);
		chordHook.unmount();

		const shiftProps = makeProps();
		renderHook(() => useMouseInteraction(shiftProps));

		container.dispatchEvent(
			new MouseEvent("mousedown", {
				button: 0,
				buttons: 1,
				shiftKey: true,
				bubbles: true,
			}),
		);

		expect(chordProps.onModeChange).toHaveBeenCalledWith(
			VIEWER_CONTROL_TYPE.ZOOM,
		);
		expect(shiftProps.onModeChange).toHaveBeenCalledWith(
			VIEWER_CONTROL_TYPE.ZOOM,
		);
	});
});
