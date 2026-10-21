// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LAYOUT_TYPE } from "@/types/layout";
import { VIEWER_CONTROL_TYPE } from "@/types/viewer";
import { StatusBar } from "../status-bar";

const renderBar = (overrides: Partial<Parameters<typeof StatusBar>[0]> = {}) =>
	render(
		<StatusBar
			activeMode={VIEWER_CONTROL_TYPE.WW_WC}
			layout={LAYOUT_TYPE.ONE_BY_ONE}
			activePaneIndex={0}
			paneCount={1}
			viewerReady
			{...overrides}
		/>,
	);

describe("StatusBar", () => {
	it("never shows the WW/WC abbreviations in the always-visible bar", () => {
		const { container } = renderBar({ isInverted: true });

		expect(container.textContent).not.toMatch(/WW|WC/);
		expect(screen.getByText("ドラッグで明るさを調整")).toBeTruthy();
	});

	it("shows the invert badge only while the image is inverted", () => {
		const { rerender } = renderBar({ isInverted: false });
		expect(screen.queryByText("白黒反転中")).toBeNull();

		rerender(
			<StatusBar
				activeMode={VIEWER_CONTROL_TYPE.WW_WC}
				layout={LAYOUT_TYPE.ONE_BY_ONE}
				activePaneIndex={0}
				paneCount={1}
				viewerReady
				isInverted
			/>,
		);
		expect(screen.getByText("白黒反転中")).toBeTruthy();
	});

	it("hides the invert badge before an image is ready", () => {
		renderBar({ isInverted: true, viewerReady: false });

		expect(screen.queryByText("白黒反転中")).toBeNull();
	});
});
