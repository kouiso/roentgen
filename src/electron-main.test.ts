import { mkdir, mkdtemp, realpath, symlink, writeFile } from "node:fs/promises";
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
