// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../App";

const loadTestDicomMock = vi.hoisted(() => vi.fn());

vi.mock("../hooks/use-dicom-loader", async () => {
	const React = await import("react");
	return {
		useDicomLoader: () => {
			const [dicomFiles, setDicomFiles] = React.useState<
				{ path: string; data: ArrayBuffer }[]
			>([]);
			return {
				loadState: { status: "idle" as const },
				dicomFiles,
				loadFiles: (files: { path: string; data: ArrayBuffer }[]) =>
					setDicomFiles(files),
				clearFiles: vi.fn(),
				removeFile: vi.fn(),
				cancelLoad: vi.fn(),
				setImageDataRegistrar: vi.fn(),
			};
		},
	};
});

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
	DicomViewer: () => (
		<div data-testid="dicom-viewer">
			<button type="button" aria-label="距離">
				距離
			</button>
		</div>
	),
}));

describe("v9 batch7 SBI: demo readiness", () => {
	beforeEach(() => {
		loadTestDicomMock.mockReset();
		loadTestDicomMock.mockResolvedValue([
			{ path: "/tmp/sample-safe.dcm", data: new ArrayBuffer(8) },
		]);
		vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
			callback(0);
			return 1;
		});
		vi.stubGlobal("cancelAnimationFrame", vi.fn());
		window.history.replaceState({}, "", "/demo");
		Object.defineProperty(window, "electronAPI", {
			configurable: true,
			value: { loadTestDicom: loadTestDicomMock },
		});
	});

	it("loads sample-safe viewer state on demo route and reaches measurement controls", async () => {
		render(<App />);

		await waitFor(() => {
			expect(loadTestDicomMock).toHaveBeenCalledTimes(1);
		});
		await waitFor(() => {
			expect(screen.getByTestId("dicom-viewer")).toBeTruthy();
		});
		expect(screen.getByRole("button", { name: "距離" })).toBeTruthy();
	});
});
