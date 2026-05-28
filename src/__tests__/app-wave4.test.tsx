// @vitest-environment jsdom
import {
	act,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../App";

const loadTestDicomMock = vi.hoisted(() => vi.fn());
const loadFilesMock = vi.hoisted(() => vi.fn());
const clearFilesMock = vi.hoisted(() => vi.fn());
const dicomFilesState = vi.hoisted(() => ({
	files: [] as { path: string; data: ArrayBuffer }[],
}));

vi.mock("../hooks/use-dicom-loader", () => ({
	useDicomLoader: () => ({
		loadState: { status: "idle" },
		dicomFiles: dicomFilesState.files,
		loadFiles: loadFilesMock,
		clearFiles: clearFilesMock,
		removeFile: vi.fn(),
		cancelLoad: vi.fn(),
		setImageDataRegistrar: vi.fn(),
	}),
}));

vi.mock("../hooks/use-google-drive", () => ({
	useGoogleDrive: () => googleDriveMock,
}));

vi.mock("../components/crash-reporter-toggle", () => ({
	CrashReporterToggle: () => <div data-testid="crash-reporter-toggle" />,
}));

vi.mock("../components/file-drop-zone", () => ({
	FileDropZone: () => <div data-testid="file-drop-zone" />,
}));

vi.mock("../components/viewer/dicom-viewer", () => ({
	DicomViewer: () => <div data-testid="dicom-viewer" />,
}));

describe("App Wave 4 polish", () => {
	let scheduledFrame: FrameRequestCallback | null;

	beforeEach(() => {
		loadTestDicomMock.mockReset();
		loadFilesMock.mockReset();
		clearFilesMock.mockReset();
		dicomFilesState.files = [];
		loadTestDicomMock.mockResolvedValue([
			{ path: "/tmp/dev.dcm", data: new ArrayBuffer(1) },
		]);
		scheduledFrame = null;
		vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
			scheduledFrame = callback;
			return 1;
		});
		vi.stubGlobal("cancelAnimationFrame", vi.fn());
		Object.defineProperty(window, "electronAPI", {
			configurable: true,
			value: {
				loadTestDicom: loadTestDicomMock,
			},
		});
	});

	afterEach(() => {
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
		Object.defineProperty(window, "electronAPI", {
			configurable: true,
			value: undefined,
		});
	});

	it("L2: does not autoload the dev DICOM before viewerReady becomes true", async () => {
		render(<App />);

		expect(loadTestDicomMock).not.toHaveBeenCalled();

		const frame = scheduledFrame;
		if (!frame) throw new Error("viewerReady frame was not scheduled");
		act(() => {
			frame(0);
		});

		await waitFor(() => {
			expect(loadTestDicomMock).toHaveBeenCalledTimes(1);
		});
	});

	it("requires confirmation before clearing all DICOM from the header", () => {
		dicomFilesState.files = [
			{ path: "/tmp/horse.dcm", data: new ArrayBuffer(1) },
		];
		vi.spyOn(window, "confirm").mockReturnValue(false);

		render(<App />);

		fireEvent.click(screen.getByRole("button", { name: "全 DICOM をクリア" }));

		expect(window.confirm).toHaveBeenCalledWith(
			"全 DICOM をクリアします。よろしいですか？",
		);
		expect(clearFilesMock).not.toHaveBeenCalled();
	});

	it("clears all DICOM from the header after confirmation", () => {
		dicomFilesState.files = [
			{ path: "/tmp/horse.dcm", data: new ArrayBuffer(1) },
		];
		vi.spyOn(window, "confirm").mockReturnValue(true);

		render(<App />);

		fireEvent.click(screen.getByRole("button", { name: "全 DICOM をクリア" }));

		expect(clearFilesMock).toHaveBeenCalledTimes(1);
	});
});
