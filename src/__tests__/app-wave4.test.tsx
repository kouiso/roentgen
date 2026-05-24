// @vitest-environment jsdom
import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../App";

const loadTestDicomMock = vi.hoisted(() => vi.fn());
const loadFilesMock = vi.hoisted(() => vi.fn());
const googleDriveState = vi.hoisted(() => ({
	auth: {
		status: "unauthenticated" as const,
		error: undefined as string | undefined,
	},
	available: false,
	credentialsAvailable: true as boolean | null,
}));

vi.mock("../hooks/use-dicom-loader", () => ({
	useDicomLoader: () => ({
		loadState: { status: "idle" },
		dicomFiles: [],
		loadFiles: loadFilesMock,
		clearFiles: vi.fn(),
		removeFile: vi.fn(),
		cancelLoad: vi.fn(),
		setImageDataRegistrar: vi.fn(),
	}),
}));

vi.mock("../hooks/use-google-drive", () => ({
	useGoogleDrive: () => ({
		auth: googleDriveState.auth,
		sync: { status: "idle" },
		credentialsAvailable: googleDriveState.credentialsAvailable,
		login: vi.fn(),
		logout: vi.fn(),
		syncToSeed: vi.fn(),
		available: googleDriveState.available,
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
		googleDriveState.auth = { status: "unauthenticated", error: undefined };
		googleDriveState.available = false;
		googleDriveState.credentialsAvailable = true;
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

	it("Google Driveエラーをヘッダーで表示する", () => {
		googleDriveState.available = true;
		googleDriveState.auth = {
			status: "unauthenticated",
			error: "access_denied",
		};

		render(<App />);

		const alert = screen.getByRole("alert");
		expect(alert.textContent).toContain("Driveエラー: access_denied");
		expect(alert.getAttribute("title")).toBe("Google Drive: access_denied");
	});
});
