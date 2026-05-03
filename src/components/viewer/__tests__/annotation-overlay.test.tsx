// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Annotation } from "@/types/annotation";
import { AnnotationOverlay } from "../annotation-overlay";

const makeViewport = () => ({
	getZoom: () => 1,
	getCenter: () => ({ x: 50, y: 50 }),
	getHomeBounds: () => ({ x: 0, y: 0, width: 100, height: 100 }),
	addHandler: vi.fn(),
	removeHandler: vi.fn(),
});

const baseProps = {
	activePoints: [],
	pendingTextPosition: null,
	imageWidth: 100,
	imageHeight: 100,
	containerId: "osd-annotation-test",
	onRemoveAnnotation: vi.fn(),
	onSubmitTextAnnotation: vi.fn(),
	onCancelPendingText: vi.fn(),
	visible: true,
};

const renderOverlay = (
	props: Omit<
		ComponentProps<typeof AnnotationOverlay>,
		keyof typeof baseProps
	> &
		Partial<typeof baseProps>,
) => {
	const host = document.createElement("div");
	host.id = baseProps.containerId;
	document.body.appendChild(host);
	return render(<AnnotationOverlay {...baseProps} {...props} />, {
		container: host,
	});
};

describe("AnnotationOverlay", () => {
	beforeEach(() => {
		vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(
			DOMRect.fromRect({ x: 0, y: 0, width: 200, height: 200 }),
		);
	});

	afterEach(() => {
		vi.restoreAllMocks();
		document.body.innerHTML = "";
	});

	it("renders text annotations with a gold label", () => {
		const annotations: Annotation[] = [
			{
				id: "a-text",
				type: "text",
				position: { x: 10, y: 20 },
				text: "骨折疑い",
			},
		];

		renderOverlay({
			annotations,
			viewport: makeViewport(),
		});

		expect(screen.getByRole("img", { name: "注釈オーバーレイ" })).toBeTruthy();
		expect(screen.getByText("骨折疑い").getAttribute("fill")).toBe("#FFD700");
	});

	it("renders arrow annotations with an arrowhead marker", () => {
		const annotations: Annotation[] = [
			{
				id: "a-arrow",
				type: "arrow",
				start: { x: 10, y: 20 },
				end: { x: 30, y: 40 },
			},
		];
		const { container } = renderOverlay({
			annotations,
			viewport: makeViewport(),
		});

		const line = container.querySelector("line");
		expect(line?.getAttribute("stroke")).toBe("#FFD700");
		expect(line?.getAttribute("marker-end")).toBe("url(#annotation-arrowhead)");
	});

	it("renders rectangle ROI annotations with dashed stroke", () => {
		const annotations: Annotation[] = [
			{
				id: "a-rect",
				type: "rect",
				topLeft: { x: 10, y: 20 },
				bottomRight: { x: 40, y: 60 },
			},
		];
		const { container } = renderOverlay({
			annotations,
			viewport: makeViewport(),
		});

		const rect = container.querySelector("rect[stroke='#FFD700']");
		expect(rect?.getAttribute("stroke-dasharray")).toBe("6,4");
		expect(rect?.getAttribute("fill")).toBe("transparent");
	});

	it("renders ellipse ROI annotations with dashed stroke", () => {
		const annotations: Annotation[] = [
			{
				id: "a-ellipse",
				type: "ellipse",
				center: { x: 40, y: 50 },
				radiusX: 20,
				radiusY: 10,
			},
		];
		const { container } = renderOverlay({
			annotations,
			viewport: makeViewport(),
		});

		const ellipse = container.querySelector("ellipse");
		expect(ellipse?.getAttribute("stroke")).toBe("#FFD700");
		expect(ellipse?.getAttribute("stroke-dasharray")).toBe("6,4");
	});

	it("subscribes to OSD viewport events without polling", () => {
		const setIntervalSpy = vi.spyOn(globalThis, "setInterval");
		const viewport = makeViewport();
		const annotations: Annotation[] = [
			{
				id: "a-arrow",
				type: "arrow",
				start: { x: 10, y: 20 },
				end: { x: 30, y: 40 },
			},
		];

		renderOverlay({
			annotations,
			viewport,
		});

		expect(setIntervalSpy).not.toHaveBeenCalled();
		expect(viewport.addHandler).toHaveBeenCalledWith(
			"viewport-change",
			expect.any(Function),
		);
		expect(viewport.addHandler).toHaveBeenCalledWith(
			"animation",
			expect.any(Function),
		);
		expect(viewport.addHandler).toHaveBeenCalledWith(
			"animation-finish",
			expect.any(Function),
		);
		expect(viewport.addHandler).toHaveBeenCalledWith(
			"update-viewport",
			expect.any(Function),
		);
	});

	it("submits and cancels pending text input from keyboard", () => {
		const onSubmitTextAnnotation = vi.fn();
		const onCancelPendingText = vi.fn();

		renderOverlay({
			annotations: [],
			pendingTextPosition: { x: 10, y: 20 },
			viewport: makeViewport(),
			onSubmitTextAnnotation,
			onCancelPendingText,
		});

		const input = screen.getByRole("textbox", { name: "注釈テキスト" });
		fireEvent.change(input, { target: { value: "蹄骨" } });
		fireEvent.keyDown(input, { key: "Enter" });
		expect(onSubmitTextAnnotation).toHaveBeenCalledWith("蹄骨");

		fireEvent.keyDown(input, { key: "Escape" });
		expect(onCancelPendingText).toHaveBeenCalledOnce();
	});
});
