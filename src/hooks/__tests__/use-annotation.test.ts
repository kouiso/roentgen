// @vitest-environment happy-dom
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useAnnotation } from "../use-annotation";

describe("useAnnotation", () => {
	it("initially has no annotations", () => {
		const { result } = renderHook(() => useAnnotation());
		expect(result.current.annotations).toEqual([]);
		expect(result.current.activePoints).toEqual([]);
		expect(result.current.activeAnnotationTool).toBeNull();
		expect(result.current.pendingTextPosition).toBeNull();
	});

	it("addPoint does nothing when no tool is active", () => {
		const { result } = renderHook(() => useAnnotation());
		act(() => {
			result.current.addPoint({ x: 10, y: 20 });
		});
		expect(result.current.annotations).toEqual([]);
		expect(result.current.activePoints).toEqual([]);
	});

	it("creates a text annotation after pending text is submitted", () => {
		const { result } = renderHook(() => useAnnotation());

		act(() => result.current.startTextTool());
		act(() => result.current.addPoint({ x: 10, y: 20 }));

		expect(result.current.activeAnnotationTool).toBe("text");
		expect(result.current.pendingTextPosition).toEqual({ x: 10, y: 20 });
		expect(result.current.annotations).toEqual([]);

		act(() => result.current.submitTextAnnotation("  腫脹  "));

		expect(result.current.pendingTextPosition).toBeNull();
		expect(result.current.annotations).toHaveLength(1);
		const annotation = result.current.annotations[0];
		expect(annotation.type).toBe("text");
		if (annotation.type === "text") {
			expect(annotation.position).toEqual({ x: 10, y: 20 });
			expect(annotation.text).toBe("腫脹");
		}
	});

	it("cancels empty pending text without creating an annotation", () => {
		const { result } = renderHook(() => useAnnotation());

		act(() => result.current.startTextTool());
		act(() => result.current.addPoint({ x: 10, y: 20 }));
		act(() => result.current.submitTextAnnotation("   "));

		expect(result.current.pendingTextPosition).toBeNull();
		expect(result.current.annotations).toEqual([]);
	});

	it("creates an arrow annotation after 2 points", () => {
		const { result } = renderHook(() => useAnnotation());

		act(() => result.current.startArrowTool());
		act(() => result.current.addPoint({ x: 1, y: 2 }));
		act(() => result.current.addPoint({ x: 30, y: 40 }));

		expect(result.current.activeAnnotationTool).toBe("arrow");
		expect(result.current.activePoints).toEqual([]);
		expect(result.current.annotations).toHaveLength(1);
		const annotation = result.current.annotations[0];
		expect(annotation.type).toBe("arrow");
		if (annotation.type === "arrow") {
			expect(annotation.start).toEqual({ x: 1, y: 2 });
			expect(annotation.end).toEqual({ x: 30, y: 40 });
		}
	});

	it("creates a rectangle ROI from opposite corners", () => {
		const { result } = renderHook(() => useAnnotation());

		act(() => result.current.startRectTool());
		act(() => result.current.addPoint({ x: 80, y: 90 }));
		act(() => result.current.addPoint({ x: 20, y: 30 }));

		expect(result.current.annotations).toHaveLength(1);
		const annotation = result.current.annotations[0];
		expect(annotation.type).toBe("rect");
		if (annotation.type === "rect") {
			expect(annotation.topLeft).toEqual({ x: 20, y: 30 });
			expect(annotation.bottomRight).toEqual({ x: 80, y: 90 });
		}
	});

	it("creates an ellipse ROI from bounding box corners", () => {
		const { result } = renderHook(() => useAnnotation());

		act(() => result.current.startEllipseTool());
		act(() => result.current.addPoint({ x: 10, y: 20 }));
		act(() => result.current.addPoint({ x: 50, y: 80 }));

		expect(result.current.annotations).toHaveLength(1);
		const annotation = result.current.annotations[0];
		expect(annotation.type).toBe("ellipse");
		if (annotation.type === "ellipse") {
			expect(annotation.center).toEqual({ x: 30, y: 50 });
			expect(annotation.radiusX).toBe(20);
			expect(annotation.radiusY).toBe(30);
		}
	});

	it("creates a freehand annotation from drag points and filters tiny moves", () => {
		const { result } = renderHook(() => useAnnotation("sop-freehand"));

		act(() => result.current.startFreehandTool());
		act(() => result.current.beginFreehand({ x: 0, y: 0 }));
		act(() => result.current.appendFreehandPoint({ x: 0.5, y: 0 }));
		act(() => result.current.appendFreehandPoint({ x: 2, y: 0 }));
		act(() => result.current.appendFreehandPoint({ x: 2, y: 3 }));
		act(() => result.current.finishFreehand());

		expect(result.current.activeAnnotationTool).toBe("freehand");
		expect(result.current.activePoints).toEqual([]);
		expect(result.current.annotations).toHaveLength(1);
		const annotation = result.current.annotations[0];
		expect(annotation.type).toBe("freehand");
		if (annotation.type === "freehand") {
			expect(annotation.sopInstanceUid).toBe("sop-freehand");
			expect(annotation.strokeWidth).toBe(2);
			expect(annotation.points).toEqual([
				{ x: 0, y: 0 },
				{ x: 2, y: 0 },
				{ x: 2, y: 3 },
			]);
		}
	});

	it("does not create a freehand annotation from a single point", () => {
		const { result } = renderHook(() => useAnnotation());

		act(() => result.current.startFreehandTool());
		act(() => result.current.beginFreehand({ x: 10, y: 10 }));
		act(() => result.current.finishFreehand());

		expect(result.current.annotations).toEqual([]);
		expect(result.current.activePoints).toEqual([]);
	});

	it("removeAnnotation deletes a single annotation by id", () => {
		const { result } = renderHook(() => useAnnotation());

		act(() => result.current.startArrowTool());
		act(() => result.current.addPoint({ x: 0, y: 0 }));
		act(() => result.current.addPoint({ x: 1, y: 1 }));
		act(() => result.current.addPoint({ x: 2, y: 2 }));
		act(() => result.current.addPoint({ x: 3, y: 3 }));

		expect(result.current.annotations).toHaveLength(2);
		const idToRemove = result.current.annotations[0].id;

		act(() => result.current.removeAnnotation(idToRemove));

		expect(result.current.annotations).toHaveLength(1);
		expect(result.current.annotations[0].id).not.toBe(idToRemove);
	});

	it("clearAllAnnotations removes annotations, active points, and active tool", () => {
		const { result } = renderHook(() => useAnnotation());

		act(() => result.current.startArrowTool());
		act(() => result.current.addPoint({ x: 0, y: 0 }));
		act(() => result.current.addPoint({ x: 1, y: 1 }));

		expect(result.current.annotations).toHaveLength(1);

		act(() => result.current.clearAllAnnotations());

		expect(result.current.annotations).toEqual([]);
		expect(result.current.activePoints).toEqual([]);
		expect(result.current.activeAnnotationTool).toBeNull();
		expect(result.current.pendingTextPosition).toBeNull();
	});

	it("cancelTool resets active tool, active points, and pending text", () => {
		const { result } = renderHook(() => useAnnotation());

		act(() => result.current.startTextTool());
		act(() => result.current.addPoint({ x: 1, y: 1 }));
		act(() => result.current.cancelTool());

		expect(result.current.activeAnnotationTool).toBeNull();
		expect(result.current.activePoints).toEqual([]);
		expect(result.current.pendingTextPosition).toBeNull();
	});

	it("generates unique IDs for completed annotations", () => {
		const { result } = renderHook(() => useAnnotation());

		act(() => result.current.startArrowTool());
		act(() => result.current.addPoint({ x: 0, y: 0 }));
		act(() => result.current.addPoint({ x: 1, y: 1 }));
		act(() => result.current.addPoint({ x: 2, y: 2 }));
		act(() => result.current.addPoint({ x: 3, y: 3 }));

		const ids = result.current.annotations.map((annotation) => annotation.id);
		expect(new Set(ids).size).toBe(ids.length);
	});
});
