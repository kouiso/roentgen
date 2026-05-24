// @vitest-environment jsdom
import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../App";

const loadTestDicomMock = vi.hoisted(() => vi.fn());
const loadFilesMock = vi.hoisted(() => vi.fn());
const googleDriveMock = vi.hoisted(() => ({
	auth: { status: "unauthenticated" } as {
		status: "idle" | "checking" | "authenticated" | "unauthenticated";
		email?: string;
		error?: string;
	},
	sync: { status: "idle" } as {
		status: "idle" | "listing" | "downloading";
		progress?: { current: number; total: number };
		fileCount?: number;
	},
	credentialsAvailable: true as boolean | null,
	login: vi.fn(),
	logout: vi.fn(),
	syncToSeed: vi.fn(),
	available: false,
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
		googleDriveMock.auth = { status: "unauthenticated" };
		googleDriveMock.sync = { status: "idle" };
		googleDriveMock.credentialsAvailable = true;
		googleDriveMock.login.mockReset();
		googleDriveMock.logout.mockReset();
		googleDriveMock.syncToSeed.mockReset();
		googleDriveMock.available = false;
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

	it("shows Google Drive auth errors in the header", () => {
		googleDriveMock.available = true;
		googleDriveMock.auth = {
			status: "unauthenticated",
			error: "access_denied",
		};

		render(<App />);

		expect(screen.getByRole("alert").textContent).toBe(
			"Driveエラー: access_denied",
		);
	});
});
