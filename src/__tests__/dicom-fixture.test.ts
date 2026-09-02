// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { disposeCornerstoneHmrState } from "@/hooks/use-cornerstone";
import { useDicomLoader } from "@/hooks/use-dicom-loader";

const readFixture = (): ArrayBuffer => {
	const buffer = readFileSync(resolve(process.cwd(), "public/test.dcm"));
	return buffer.buffer.slice(
		buffer.byteOffset,
		buffer.byteOffset + buffer.byteLength,
	);
};

afterEach(() => {
	disposeCornerstoneHmrState();
});

describe("public/test.dcm regression fixture", () => {
	it("loads the checked-in DX fixture through useDicomLoader and registers image data", async () => {
		const registered = new Map<string, ArrayBuffer>();
		const { result } = renderHook(() => useDicomLoader());

		act(() => {
			result.current.setImageDataRegistrar((path, data) => {
				registered.set(path, data);
			});
		});

		await act(async () => {
			await result.current.loadFiles([
				{ path: "/fixture/public/test.dcm", data: readFixture() },
			]);
		});

		expect(result.current.loadState.status).toBe("loaded");
		expect(result.current.dicomFiles).toHaveLength(1);

		const file = result.current.dicomFiles[0];
		expect(file).toMatchObject({
			fileName: "test.dcm",
			rows: 1996,
			columns: 2396,
			bitsAllocated: 16,
			samplesPerPixel: 1,
			photometricInterpretation: "MONOCHROME2",
			totalFrames: 1,
			windowCenter: 8191,
			windowWidth: 16383,
		});
		expect(file?.tags.TransferSyntaxUID).toBe("1.2.840.10008.1.2.1");
		expect(file?.tags.Modality).toBe("DX");
		expect(file?.thumbnailData).toHaveLength(100 * 80 * 4);
		expect(registered.get("/fixture/public/test.dcm")?.byteLength).toBe(
			9_590_846,
		);

		if (result.current.loadState.status === "loaded") {
			expect(result.current.loadState.skipped).toEqual([]);
		}
	});
});
