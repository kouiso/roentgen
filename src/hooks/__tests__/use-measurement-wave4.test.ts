// @vitest-environment happy-dom
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useMeasurement } from "../use-measurement";

const UUID_PATTERN =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe("useMeasurement Wave 4 polish", () => {
	it("M4: emits unique UUID measurement IDs across simultaneous hook instances", () => {
		const first = renderHook(() => useMeasurement(null));
		const second = renderHook(() => useMeasurement(null));

		act(() => {
			first.result.current.startDistanceTool();
			second.result.current.startDistanceTool();
		});

		for (let i = 0; i < 100; i++) {
			act(() => {
				first.result.current.addPoint({ x: i, y: 0 });
				first.result.current.addPoint({ x: i + 1, y: 0 });
				second.result.current.addPoint({ x: i, y: 1 });
				second.result.current.addPoint({ x: i + 1, y: 1 });
			});
		}

		const ids = [
			...first.result.current.measurements.map((measurement) => measurement.id),
			...second.result.current.measurements.map(
				(measurement) => measurement.id,
			),
		];

		expect(ids).toHaveLength(200);
		expect(new Set(ids).size).toBe(200);
		expect(ids.every((id) => UUID_PATTERN.test(id))).toBe(true);
	});
});
