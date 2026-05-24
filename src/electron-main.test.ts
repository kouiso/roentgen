import { mkdir, mkdtemp, realpath, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({
	app: {
		isPackaged: false,
		getPath: () => tmpdir(),
		whenReady: () => new Promise<never>(() => undefined),
		on: vi.fn(),
		quit: vi.fn(),
	},
	BrowserWindow: {
		getAllWindows: () => [],
	},
	crashReporter: {
		start: vi.fn(),
	},
	dialog: {
		showOpenDialog: vi.fn(),
		showSaveDialog: vi.fn(),
	},
	ipcMain: {
		handle: vi.fn(),
	},
	session: {
		defaultSession: {
			webRequest: {
				onHeadersReceived: vi.fn(),
			},
		},
	},
}));

vi.mock("@sentry/electron/main", () => ({
	init: vi.fn(),
}));

vi.mock("electron-log/main", () => ({
	default: {
		initialize: vi.fn(),
		transports: {
			file: {
				maxSize: 0,
				format: "",
			},
		},
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
	},
}));

vi.mock("../electron/sentry", () => ({
	initSentryIfConsented: vi.fn(),
	isCrashReportingEnabled: () => false,
	setCrashReportingEnabled: vi.fn(),
}));

describe("electron main read-file path guard", () => {
	it("S1/L1: allows only real paths inside an allowed root", async () => {
		const { resolveAllowedReadPath } = await import("../electron/main");
		const root = await mkdtemp(join(tmpdir(), "roentgen-allowed-"));
		const allowedDir = join(root, "dicom-files");
		const siblingDir = join(root, "dicom-files-evil");
		const outsideDir = join(root, "outside");
		await mkdir(allowedDir);
		await mkdir(siblingDir);
		await mkdir(outsideDir);

		const legit = join(allowedDir, "image.dcm");
		const sibling = join(siblingDir, "secret.dcm");
		const outside = join(outsideDir, "secret.dcm");
		const link = join(allowedDir, "linked-secret.dcm");
		await writeFile(legit, "dicom");
		await writeFile(sibling, "secret");
		await writeFile(outside, "outside");
		await symlink(outside, link);

		await expect(resolveAllowedReadPath(legit, [allowedDir])).resolves.toBe(
			await realpath(legit),
		);
		await expect(
			resolveAllowedReadPath(join(allowedDir, "..", "outside", "secret.dcm"), [
				allowedDir,
			]),
		).rejects.toThrow("許可されていないファイルパス");
		await expect(resolveAllowedReadPath(sibling, [allowedDir])).rejects.toThrow(
			"許可されていないファイルパス",
		);
		await expect(resolveAllowedReadPath(link, [allowedDir])).rejects.toThrow(
			"許可されていないファイルパス",
		);
	});
});

describe("electron main open-file import", () => {
	it("collects DICOM file paths from OS open arguments", async () => {
		const { collectOpenDicomFilePaths } = await import("../electron/main");
		const cwd = await mkdtemp(join(tmpdir(), "roentgen-open-file-"));

		expect(
			collectOpenDicomFilePaths(
				[
					"--flag",
					"image-001.dcm",
					"image-002.DICOM",
					"notes.txt",
					"image-001.dcm",
				],
				cwd,
			),
		).toEqual([resolve(cwd, "image-001.dcm"), resolve(cwd, "image-002.DICOM")]);
	});
});

describe("electron main DICOM directory scan", () => {
	it("recursively returns DICOM files with supported extensions", async () => {
		const { findDicomFilePathsRecursive } = await import("../electron/main");
		const root = await mkdtemp(join(tmpdir(), "roentgen-dicom-scan-"));
		const nestedDir = join(root, "2026-03-28", "series-a");
		await mkdir(nestedDir, { recursive: true });

		const dcmFile = join(root, "image-001.dcm");
		const upperDcmFile = join(nestedDir, "image-002.DCM");
		const dicomFile = join(nestedDir, "image-003.dicom");
		const upperDicomFile = join(nestedDir, "image-004.DICOM");
		const textFile = join(nestedDir, "notes.txt");
		await writeFile(dcmFile, "dicom");
		await writeFile(upperDcmFile, "dicom");
		await writeFile(dicomFile, "dicom");
		await writeFile(upperDicomFile, "dicom");
		await writeFile(textFile, "not dicom");

		const results = await findDicomFilePathsRecursive(root, [root]);

		await expect(
			Promise.all(results.map((path) => realpath(path))),
		).resolves.toEqual([
			await realpath(join(root, "2026-03-28", "series-a", "image-002.DCM")),
			await realpath(join(root, "2026-03-28", "series-a", "image-003.dicom")),
			await realpath(join(root, "2026-03-28", "series-a", "image-004.DICOM")),
			await realpath(join(root, "image-001.dcm")),
		]);
	});

	it("does not follow symlinked DICOM files outside the allowed root", async () => {
		const { findDicomFilePathsRecursive } = await import("../electron/main");
		const root = await mkdtemp(join(tmpdir(), "roentgen-dicom-symlink-"));
		const outsideDir = join(root, "..", "roentgen-dicom-outside");
		await mkdir(outsideDir, { recursive: true });

		const outsideFile = join(outsideDir, "secret.dcm");
		const linkedFile = join(root, "linked-secret.dcm");
		await writeFile(outsideFile, "secret");
		await symlink(outsideFile, linkedFile);

		await expect(findDicomFilePathsRecursive(root, [root])).resolves.toEqual(
			[],
		);
	});
});
