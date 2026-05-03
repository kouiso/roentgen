// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useViewerLayout } from "../use-viewer-layout";

describe("useViewerLayout", () => {
	it("starts with 1x1 layout", () => {
		const { result } = renderHook(() => useViewerLayout());
		expect(result.current.layout).toBe("1x1");
	});

	it("setOneByOne sets layout to 1x1", () => {
		const { result } = renderHook(() => useViewerLayout());

		act(() => result.current.setTwoByTwo());
		act(() => result.current.setOneByOne());
		expect(result.current.layout).toBe("1x1");
	});

	it("setTwoByOne sets layout to 2x1", () => {
		const { result } = renderHook(() => useViewerLayout());

		act(() => result.current.setTwoByOne());
		expect(result.current.layout).toBe("2x1");
	});

	it("setOneByTwo sets layout to 1x2", () => {
		const { result } = renderHook(() => useViewerLayout());

		act(() => result.current.setOneByTwo());
		expect(result.current.layout).toBe("1x2");
	});

	it("setTwoByTwo sets layout to 2x2", () => {
		const { result } = renderHook(() => useViewerLayout());

		act(() => result.current.setTwoByTwo());
		expect(result.current.layout).toBe("2x2");
	});

	it("setLayout allows direct layout setting", () => {
		const { result } = renderHook(() => useViewerLayout());

		act(() => result.current.setLayout("2x2"));
		expect(result.current.layout).toBe("2x2");

		act(() => result.current.setLayout("1x1"));
		expect(result.current.layout).toBe("1x1");
	});
});
