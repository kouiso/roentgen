// @vitest-environment happy-dom
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../App";

const driveState = vi.hoisted(() => ({
	credentialsAvailable: false as boolean | null,
	available: true,
}));

vi.mock("../hooks/use-dicom-loader", () => ({
	useDicomLoader: () => ({
		loadState: { status: "idle" },
		dicomFiles: [],
		loadFiles: vi.fn(),
		clearFiles: vi.fn(),
		removeFile: vi.fn(),
		cancelLoad: vi.fn(),
		setImageDataRegistrar: vi.fn(),
	}),
}));

vi.mock("../hooks/use-google-drive", () => ({
	useGoogleDrive: () => ({
		auth: { status: "unauthenticated" },
		sync: { status: "idle" },
		credentialsAvailable: driveState.credentialsAvailable,
		login: vi.fn(),
		logout: vi.fn(),
		syncToSeed: vi.fn(),
		available: driveState.available,
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

describe("App Drive setup guidance", () => {
	beforeEach(() => {
		driveState.credentialsAvailable = false;
		driveState.available = true;
		vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
			callback(0);
			return 1;
		});
		vi.stubGlobal("cancelAnimationFrame", vi.fn());
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("shows setup steps when Drive credentials are missing", () => {
		render(<App />);

		const setupButton = screen.getByRole("button", { name: "Drive未設定" });
		expect(setupButton.getAttribute("aria-expanded")).toBe("false");

		fireEvent.click(setupButton);

		expect(setupButton.getAttribute("aria-expanded")).toBe("true");
		expect(
			screen.getByText("Google Drive連携の準備が未完了です"),
		).not.toBeNull();
		expect(screen.getByText("gdrive-credentials.json")).not.toBeNull();
		expect(
			screen.getByText(
				"配置後にアプリを再起動するとDrive接続ボタンが有効になります。",
			),
		).not.toBeNull();
	});
});
