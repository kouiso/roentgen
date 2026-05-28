import {
	mkdir,
	mkdtemp,
	readdir,
	readFile,
	realpath,
	symlink,
	writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
	it("rejects invalid IPC path payloads before resolving files", async () => {
		const { resolveAllowedReadPath } = await import("../electron/main");

		await expect(resolveAllowedReadPath(undefined, [])).rejects.toThrow(
			"ファイルパスが不正です",
		);
		await expect(resolveAllowedReadPath("", [])).rejects.toThrow(
			"ファイルパスが不正です",
		);
		await expect(resolveAllowedReadPath("image.dcm\0.txt", [])).rejects.toThrow(
			"ファイルパスが不正です",
		);
	});

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

describe("electron main annotation persistence", () => {
	it("writes annotation storage through a temporary file before replacing final JSON", async () => {
		const { saveAnnotationStorageFile } = await import("../electron/main");
		const storageDir = await mkdtemp(join(tmpdir(), "roentgen-annotations-"));
		const studyUid = "1.2.826.0.1.3680043.8.498.1";
		const payload = {
			version: 1,
			studyInstanceUid: studyUid,
			annotations: [{ id: "a1", type: "text", text: "蹄骨" }],
			measurements: [],
		};

		const filePath = await saveAnnotationStorageFile(
			studyUid,
			payload,
			storageDir,
		);

		await expect(readFile(filePath, "utf-8")).resolves.toBe(
			JSON.stringify(payload, null, 2),
		);
		await expect(readdir(storageDir)).resolves.toEqual([`${studyUid}.json`]);
	});

	it("handles concurrent saves for the same study without leaving temporary files", async () => {
		const { saveAnnotationStorageFile } = await import("../electron/main");
		const storageDir = await mkdtemp(join(tmpdir(), "roentgen-annotations-"));
		const studyUid = "1.2.826.0.1.3680043.8.498.2";
		const payloads = Array.from({ length: 8 }, (_, index) => ({
			version: 1,
			studyInstanceUid: studyUid,
			annotations: [{ id: `a${index}`, type: "text", text: `note-${index}` }],
			measurements: [],
		}));

		const savedPaths = await Promise.all(
			payloads.map((payload) =>
				saveAnnotationStorageFile(studyUid, payload, storageDir),
			),
		);

		expect(new Set(savedPaths)).toEqual(
			new Set([join(storageDir, `${studyUid}.json`)]),
		);
		const savedPayload = JSON.parse(await readFile(savedPaths[0], "utf-8"));
		expect(payloads).toContainEqual(savedPayload);
		await expect(readdir(storageDir)).resolves.toEqual([`${studyUid}.json`]);
	});

	it("rejects invalid StudyInstanceUID before writing annotation storage", async () => {
		const { saveAnnotationStorageFile } = await import("../electron/main");
		const storageDir = await mkdtemp(join(tmpdir(), "roentgen-annotations-"));

		await expect(
			saveAnnotationStorageFile("../escape", {}, storageDir),
		).rejects.toThrow("StudyInstanceUIDが不正です");
		await expect(readdir(storageDir)).resolves.toEqual([]);
	});
});
