// @vitest-environment happy-dom
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useMeasurement } from "../use-measurement";

describe("useMeasurement", () => {
	it("initially has no measurements", () => {
		const { result } = renderHook(() => useMeasurement(null));
		expect(result.current.measurements).toEqual([]);
		expect(result.current.activePoints).toEqual([]);
		expect(result.current.activeTool).toBeNull();
	});

	it("addPoint does nothing when no tool is active", () => {
		const { result } = renderHook(() => useMeasurement(null));
		act(() => {
			result.current.addPoint({ x: 10, y: 20 });
		});
		expect(result.current.measurements).toEqual([]);
		expect(result.current.activePoints).toEqual([]);
	});

	it("creates a distance measurement after 2 points", () => {
		const { result } = renderHook(() => useMeasurement(null));

		act(() => {
			result.current.startDistanceTool();
		});
		expect(result.current.activeTool).toBe("distance");

		act(() => {
			result.current.addPoint({ x: 0, y: 0 });
		});

		act(() => {
			result.current.addPoint({ x: 3, y: 4 });
		});

		expect(result.current.measurements).toHaveLength(1);
		expect(result.current.measurements[0].type).toBe("distance");
		const m = result.current.measurements[0];
		if (m.type === "distance") {
			expect(m.distanceMm).toBe(5);
			expect(m.points).toHaveLength(2);
		}
		// activePoints reset after measurement completes
		expect(result.current.activePoints).toEqual([]);
	});

	it("creates an angle measurement after 3 points", () => {
		const { result } = renderHook(() => useMeasurement(null));

		act(() => {
			result.current.startAngleTool();
		});
		expect(result.current.activeTool).toBe("angle");

		act(() => {
			result.current.addPoint({ x: 1, y: 0 });
		});
		act(() => {
			result.current.addPoint({ x: 0, y: 0 });
		});
		act(() => {
			result.current.addPoint({ x: 0, y: 1 });
		});

		expect(result.current.measurements).toHaveLength(1);
		expect(result.current.measurements[0].type).toBe("angle");
		const m = result.current.measurements[0];
		if (m.type === "angle") {
			expect(m.angleDeg).toBeCloseTo(90, 5);
			expect(m.points).toHaveLength(3);
		}
	});

	it("applies pixel spacing to distance measurement", () => {
		const { result } = renderHook(() =>
			useMeasurement([0.5, 0.5] as [number, number]),
		);

		act(() => {
			result.current.startDistanceTool();
		});
		act(() => {
			result.current.addPoint({ x: 0, y: 0 });
		});
		act(() => {
			result.current.addPoint({ x: 6, y: 8 });
		});

		expect(result.current.measurements).toHaveLength(1);
		const m = result.current.measurements[0];
		if (m.type === "distance") {
			// dx=6*0.5=3, dy=8*0.5=4 → 5
			expect(m.distanceMm).toBe(5);
		}
	});

	it("removeMeasurement deletes a single measurement by id", () => {
		const { result } = renderHook(() => useMeasurement(null));

		// Create two measurements
		act(() => result.current.startDistanceTool());
		act(() => result.current.addPoint({ x: 0, y: 0 }));
		act(() => result.current.addPoint({ x: 1, y: 0 }));

		act(() => result.current.startDistanceTool());
		act(() => result.current.addPoint({ x: 0, y: 0 }));
		act(() => result.current.addPoint({ x: 0, y: 2 }));

		expect(result.current.measurements).toHaveLength(2);

		const idToRemove = result.current.measurements[0].id;
		act(() => {
			result.current.removeMeasurement(idToRemove);
		});

		expect(result.current.measurements).toHaveLength(1);
		expect(result.current.measurements[0].id).not.toBe(idToRemove);
	});

	it("clearAll removes all measurements and active points", () => {
		const { result } = renderHook(() => useMeasurement(null));

		// Create a measurement
		act(() => result.current.startDistanceTool());
		act(() => result.current.addPoint({ x: 0, y: 0 }));
		act(() => result.current.addPoint({ x: 5, y: 0 }));

		expect(result.current.measurements).toHaveLength(1);

		act(() => {
			result.current.clearAll();
		});

		expect(result.current.measurements).toEqual([]);
		expect(result.current.activePoints).toEqual([]);
		expect(result.current.activeTool).toBeNull();
	});

	it("cancelTool resets activeTool and activePoints", () => {
		const { result } = renderHook(() => useMeasurement(null));

		act(() => result.current.startDistanceTool());
		act(() => result.current.addPoint({ x: 1, y: 1 }));

		act(() => result.current.cancelTool());

		expect(result.current.activeTool).toBeNull();
		expect(result.current.activePoints).toEqual([]);
	});
});
