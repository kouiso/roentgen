// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../App";
import type { DicomFileInfo, DicomLoadState } from "../types/dicom";

const appState = vi.hoisted(() => ({
	loadState: { status: "idle" } as DicomLoadState,
	dicomFiles: [] as DicomFileInfo[],
}));

const makeFileInfo = (fileName: string): DicomFileInfo => ({
	imageId: `dicomfile://${fileName}`,
	filePath: `/study/${fileName}`,
	fileName,
	frameIndex: 0,
	totalFrames: 1,
	rows: 64,
	columns: 64,
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
	pixelSpacing: [1, 1],
	imageOrientationPatient: null,
	imagePositionPatient: null,
	sliceThickness: null,
	sliceLocation: null,
	instanceNumber: null,
	modalityLutSequence: null,
	voiLutSequence: null,
	studyInstanceUID: null,
	seriesInstanceUID: null,
	overlayData: [],
	tags: {},
	thumbnailData: null,
});

vi.mock("../hooks/use-dicom-loader", () => ({
	useDicomLoader: () => ({
		loadState: appState.loadState,
		dicomFiles: appState.dicomFiles,
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

describe("App load feedback", () => {
	beforeEach(() => {
		appState.loadState = { status: "idle" };
		appState.dicomFiles = [];
		vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
			callback(0);
			return 1;
		});
		vi.stubGlobal("cancelAnimationFrame", vi.fn());
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("shows skipped file detail when loading fails", () => {
		appState.loadState = {
			status: "error",
			message: "レントゲン画像ではありません",
			skipped: [
				{
					filePath: "/tmp/report.pdf",
					reason: "not-dicom",
					detail: "レントゲン画像ではありません",
				},
			],
		};

		render(<App />);

		expect(
			screen.getAllByText("レントゲン画像ではありません").length,
		).toBeGreaterThan(0);
		expect(screen.getByText("report.pdf")).toBeTruthy();
	});

	it("keeps partial import warnings visible above the viewer", () => {
		appState.dicomFiles = [makeFileInfo("image-1.dcm")];
		appState.loadState = {
			status: "loaded",
			files: appState.dicomFiles,
			skipped: [
				{
					filePath: "/tmp/broken.dcm",
					reason: "corrupt",
					detail: "ファイルが破損しているため読み込めませんでした",
				},
			],
		};

		render(<App />);

		expect(screen.getByTestId("dicom-viewer")).toBeTruthy();
		expect(screen.getByText("1件のファイルをスキップしました")).toBeTruthy();
		expect(screen.getByText("broken.dcm")).toBeTruthy();
		expect(
			screen.getByText("ファイルが破損しているため読み込めませんでした"),
		).toBeTruthy();
	});
});
