import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const cornerstoneMock = vi.hoisted(() => ({
	loadImage: vi.fn(),
	registerImageLoader: vi.fn(),
	renderToCanvas: vi.fn(),
	imageLoader: {
		purge: vi.fn(),
	},
	imageCache: {
		removeImageLoadObject: vi.fn(),
	},
}));

describe("useCornerstone init singleton", () => {
	beforeEach(() => {
		vi.resetModules();
		vi.clearAllMocks();
	});

	afterEach(() => {
		vi.doUnmock("cornerstone-core");
		vi.doUnmock("cornerstone-wado-image-loader");
		vi.doUnmock("dicom-parser");
	});

	it("C3: rejects all parallel waiters after the first init failure and retries cleanly", async () => {
		let cornerstoneImportCount = 0;
		vi.doMock("cornerstone-core", () => {
			cornerstoneImportCount++;
			if (cornerstoneImportCount === 1) {
				throw new Error("first cornerstone import failed");
			}
			return { default: cornerstoneMock };
		});
		vi.doMock("cornerstone-wado-image-loader", () => ({
			default: {
				external: {},
				configure: vi.fn(),
			},
		}));
		vi.doMock("dicom-parser", () => ({
			default: {
				parseDicom: vi.fn(),
			},
		}));

		const { initializeCornerstone } = await import("../use-cornerstone");

		const firstAttempt = await Promise.allSettled([
			initializeCornerstone(),
			initializeCornerstone(),
		]);

		expect(firstAttempt).toEqual([
			expect.objectContaining({ status: "rejected" }),
			expect.objectContaining({ status: "rejected" }),
		]);

		await expect(
			Promise.all([initializeCornerstone(), initializeCornerstone()]),
		).resolves.toEqual([undefined, undefined]);
		expect(cornerstoneImportCount).toBe(2);
		expect(cornerstoneMock.registerImageLoader).toHaveBeenCalledTimes(1);
	});
});
