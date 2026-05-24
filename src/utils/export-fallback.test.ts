import { describe, expect, it, vi } from "vitest";
import { runBooleanExportWithFallback } from "./export-fallback";

describe("runBooleanExportWithFallback", () => {
	it("does not run fallback when the Electron operation succeeds", async () => {
		const fallback = vi.fn();

		const result = await runBooleanExportWithFallback(
			Promise.resolve(true),
			fallback,
		);

		expect(result).toBe(true);
		expect(fallback).not.toHaveBeenCalled();
	});

	it("runs fallback when the Electron operation returns false", async () => {
		const fallback = vi.fn();

		const result = await runBooleanExportWithFallback(
			Promise.resolve(false),
			fallback,
		);

		expect(result).toBe(false);
		expect(fallback).toHaveBeenCalledOnce();
	});

	it("runs fallback when the Electron operation rejects", async () => {
		const fallback = vi.fn();

		const result = await runBooleanExportWithFallback(
			Promise.reject(new Error("print failed")),
			fallback,
		);

		expect(result).toBe(false);
		expect(fallback).toHaveBeenCalledOnce();
	});
});
