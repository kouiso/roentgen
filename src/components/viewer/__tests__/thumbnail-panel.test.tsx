// @vitest-environment jsdom
import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ThumbnailPanel } from "@/components/viewer/thumbnail-panel";
import type { DicomFileInfo } from "@/types/dicom";

const makeFile = (
	index: number,
	overrides: Partial<DicomFileInfo> = {},
): DicomFileInfo => ({
	imageId: `image-${index}`,
	filePath: `/tmp/image-${index}.dcm`,
	fileName: `image-${index}.dcm`,
	frameIndex: index,
	totalFrames: 3,
	rows: 100,
	columns: 100,
	bitsAllocated: 16,
	bitsStored: 12,
	highBit: 11,
	pixelRepresentation: 0,
	samplesPerPixel: 1,
	photometricInterpretation: "MONOCHROME2",
	rescaleIntercept: 0,
	rescaleSlope: 1,
	windowCenter: 40,
	windowWidth: 400,
	pixelSpacing: null,
	imageOrientationPatient: null,
	imagePositionPatient: null,
	sliceThickness: null,
	sliceLocation: null,
	instanceNumber: index + 1,
	modalityLutSequence: null,
	voiLutSequence: null,
	studyInstanceUID: null,
	seriesInstanceUID: null,
	overlayData: [],
	tags: {},
	thumbnailData: null,
	...overrides,
});

describe("ThumbnailPanel", () => {
	beforeEach(() => {
		vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("exposes frame choices as a labelled listbox with selected option state", () => {
		render(
			<ThumbnailPanel
				files={[makeFile(0), makeFile(1), makeFile(2)]}
				currentIndex={1}
				onSelect={vi.fn()}
			/>,
		);

		const listbox = screen.getByRole("listbox", { name: "フレーム一覧" });
		expect(listbox.getAttribute("aria-orientation")).toBe("vertical");

		const options = within(listbox).getAllByRole("option");
		expect(options).toHaveLength(3);
		expect(options[0]?.getAttribute("aria-label")).toBe("フレーム 1 (1/3)");
		expect(options[0]?.getAttribute("aria-selected")).toBe("false");
		expect(options[0]?.getAttribute("tabindex")).toBe("-1");

		expect(options[1]?.getAttribute("aria-label")).toBe("フレーム 2 (2/3)");
		expect(options[1]?.getAttribute("aria-selected")).toBe("true");
		expect(options[1]?.getAttribute("aria-current")).toBe("true");
		expect(options[1]?.getAttribute("tabindex")).toBe("0");
	});

	it("uses the visible position when instance number is missing", () => {
		render(
			<ThumbnailPanel
				files={[makeFile(0), makeFile(1, { instanceNumber: null })]}
				currentIndex={0}
				onSelect={vi.fn()}
			/>,
		);

		expect(
			screen.getByRole("option", { name: "フレーム 2 (2/2)" }),
		).toBeTruthy();
	});

	it("selects and focuses adjacent frames from arrow keys", () => {
		const onSelect = vi.fn();
		render(
			<ThumbnailPanel
				files={[makeFile(0), makeFile(1), makeFile(2)]}
				currentIndex={1}
				onSelect={onSelect}
			/>,
		);

		const options = screen.getAllByRole("option");
		options[1]?.focus();

		fireEvent.keyDown(options[1] as HTMLElement, { key: "ArrowDown" });

		expect(onSelect).toHaveBeenCalledWith(2);
		expect(options[2]).toBe(document.activeElement);
	});

	it("selects first and last frames from Home and End keys", () => {
		const onSelect = vi.fn();
		render(
			<ThumbnailPanel
				files={[makeFile(0), makeFile(1), makeFile(2)]}
				currentIndex={1}
				onSelect={onSelect}
			/>,
		);

		const options = screen.getAllByRole("option");

		fireEvent.keyDown(options[1] as HTMLElement, { key: "Home" });
		fireEvent.keyDown(options[1] as HTMLElement, { key: "End" });

		expect(onSelect).toHaveBeenNthCalledWith(1, 0);
		expect(onSelect).toHaveBeenNthCalledWith(2, 2);
	});
});
