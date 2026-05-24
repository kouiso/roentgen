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
const dicomFilesMock = vi.hoisted(() => ({
	value: [] as { imageId: string }[],
}));

vi.mock("../hooks/use-dicom-loader", () => ({
	useDicomLoader: () => ({
		loadState: { status: "idle" },
		dicomFiles: dicomFilesMock.value,
		loadFiles: loadFilesMock,
		clearFiles: clearFilesMock,
		removeFile: vi.fn(),
		cancelLoad: vi.fn(),
		setImageDataRegistrar: vi.fn(),
	}),
}));

vi.mock("../hooks/use-google-drive", () => ({
	useGoogleDrive: () => ({
		auth: { status: "unauthenticated" },
		sync: { status: "idle" },
		credentialsAvailable: true,
		login: vi.fn(),
		logout: vi.fn(),
		syncToSeed: vi.fn(),
		available: false,
	}),
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
		dicomFilesMock.value = [];
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

	it("does not clear header DICOM files when confirmation is canceled", () => {
		vi.spyOn(window, "confirm").mockReturnValue(false);
		dicomFilesMock.value = [{ imageId: "roentgen:/tmp/dev.dcm" }];

		render(<App />);

		fireEvent.click(screen.getByRole("button", { name: "クリア" }));

		expect(window.confirm).toHaveBeenCalledWith(
			"全 DICOM をクリアします。よろしいですか？",
		);
		expect(clearFilesMock).not.toHaveBeenCalled();
	});

	it("clears header DICOM files after confirmation", () => {
		vi.spyOn(window, "confirm").mockReturnValue(true);
		dicomFilesMock.value = [{ imageId: "roentgen:/tmp/dev.dcm" }];

		render(<App />);

		fireEvent.click(screen.getByRole("button", { name: "クリア" }));

		expect(clearFilesMock).toHaveBeenCalledOnce();
	});
});
