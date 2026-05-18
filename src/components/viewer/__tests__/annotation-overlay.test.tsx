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

	it("renders persisted freehand annotations as rounded polylines", () => {
		const onRemoveAnnotation = vi.fn();
		const annotations: Annotation[] = [
			{
				id: "a-freehand",
				type: "freehand",
				color: "#00aaff",
				points: [
					{ x: 10, y: 10 },
					{ x: 20, y: 30 },
					{ x: 40, y: 35 },
				],
				strokeWidth: 3,
			},
		];
		const { container } = renderOverlay({
			annotations,
			viewport: makeViewport(),
			onRemoveAnnotation,
		});

		const polyline = container.querySelector("polyline");
		expect(polyline?.getAttribute("points")).toBe("20,20 40,60 80,70");
		expect(polyline?.getAttribute("fill")).toBe("none");
		expect(polyline?.getAttribute("stroke")).toBe("#00aaff");
		expect(polyline?.getAttribute("stroke-width")).toBe("3");
		expect(polyline?.getAttribute("stroke-linecap")).toBe("round");

		fireEvent.click(screen.getByRole("button", { name: "注釈削除" }));
		expect(onRemoveAnnotation).toHaveBeenCalledWith("a-freehand");
	});

	it("renders active freehand points as a live polyline", () => {
		const { container } = renderOverlay({
			annotations: [],
			activePoints: [
				{ x: 10, y: 10 },
				{ x: 20, y: 30 },
				{ x: 40, y: 35 },
			],
			viewport: makeViewport(),
		});

		const polyline = container.querySelector("polyline");
		expect(polyline?.getAttribute("points")).toBe("20,20 40,60 80,70");
		expect(polyline?.getAttribute("stroke")).toBe("#FFD700");
		expect(polyline?.getAttribute("stroke-dasharray")).toBeNull();
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

	it("does not remove an annotation when delete confirmation is canceled", () => {
		vi.spyOn(window, "confirm").mockReturnValue(false);
		const onRemoveAnnotation = vi.fn();
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
			onRemoveAnnotation,
		});

		fireEvent.click(screen.getByRole("button", { name: "注釈削除" }));

		expect(window.confirm).toHaveBeenCalledWith("この注釈を削除しますか？");
		expect(onRemoveAnnotation).not.toHaveBeenCalled();
	});

	it("restores the last deleted annotation with Ctrl+Z", () => {
		vi.spyOn(window, "confirm").mockReturnValue(true);
		const onRemoveAnnotation = vi.fn();
		const onRestoreAnnotation = vi.fn();
		const annotation: Annotation = {
			id: "a-text",
			type: "text",
			position: { x: 10, y: 20 },
			text: "骨折疑い",
		};
		renderOverlay({
			annotations: [annotation],
			viewport: makeViewport(),
			onRemoveAnnotation,
			onRestoreAnnotation,
		});

		fireEvent.click(screen.getByRole("button", { name: "注釈削除" }));
		fireEvent.keyDown(window, { key: "z", ctrlKey: true });

		expect(onRemoveAnnotation).toHaveBeenCalledWith("a-text");
		expect(onRestoreAnnotation).toHaveBeenCalledWith(annotation);
	});
});
