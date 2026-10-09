import { access, mkdtemp, rm, writeFile } from "node:fs/promises";
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

vi.mock("../sentry", () => ({
	initSentryIfConsented: vi.fn(),
	isCrashReportingEnabled: () => false,
	setCrashReportingEnabled: vi.fn(),
}));

const findExistingSystemPath = async (): Promise<string> => {
	for (const path of ["/etc/hosts", "/etc/passwd", "/bin/sh"]) {
		try {
			await access(path);
			return path;
		} catch {
			// 次候補を確認する
		}
	}
	throw new Error("テスト用のシステムパスが見つかりません");
};

describe("file transfer to the renderer", () => {
	it("hands over a dedicated backing buffer without copying", async () => {
		const { toTransferableArrayBuffer } = await import("../main");
		const buffer = Buffer.allocUnsafeSlow(1024);

		expect(toTransferableArrayBuffer(buffer)).toBe(buffer.buffer);
	});

	it("copies only the visible bytes of a pooled buffer", async () => {
		const { toTransferableArrayBuffer } = await import("../main");
		const pooled = Buffer.from("roentgen");
		expect(pooled.buffer.byteLength).toBeGreaterThan(pooled.byteLength);

		const result = toTransferableArrayBuffer(pooled);

		expect(result).not.toBe(pooled.buffer);
		expect(Buffer.from(result).toString()).toBe("roentgen");
	});

	describe("readAllowedFileRange", () => {
		const withFile = async (
			run: (dirPath: string, filePath: string) => Promise<void>,
		) => {
			const dirPath = await mkdtemp(join(tmpdir(), "roentgen-range-"));
			const filePath = join(dirPath, "range.dcm");
			await writeFile(filePath, Buffer.from("0123456789"));
			try {
				await run(dirPath, filePath);
			} finally {
				await rm(dirPath, { recursive: true, force: true });
			}
		};

		it("returns the requested slice and a short tail at EOF", async () => {
			const { getAllowedFileSize, readAllowedFileRange } = await import(
				"../main"
			);
			await withFile(async (dirPath, filePath) => {
				expect(await getAllowedFileSize(filePath, [dirPath])).toBe(10);
				const middle = await readAllowedFileRange(filePath, 2, 4, [dirPath]);
				expect(Buffer.from(middle).toString()).toBe("2345");
				const tail = await readAllowedFileRange(filePath, 8, 4, [dirPath]);
				expect(Buffer.from(tail).toString()).toBe("89");
			});
		});

		it.each([
			[-1, 4],
			[0, 0],
			[1.5, 4],
			[0, 64 * 1024 * 1024 + 1],
			["0", 4],
		])("rejects invalid range offset=%s length=%s", async (offset, length) => {
			const { readAllowedFileRange } = await import("../main");
			await withFile(async (dirPath, filePath) => {
				await expect(
					readAllowedFileRange(filePath, offset, length, [dirPath]),
				).rejects.toThrow("読み込み範囲が不正です");
			});
		});

		it("rejects files outside the allowed paths", async () => {
			const { readAllowedFileRange } = await import("../main");
			const arbitraryPath = await findExistingSystemPath();

			await expect(
				readAllowedFileRange(arbitraryPath, 0, 4, []),
			).rejects.toThrow("許可されていないファイルパス");
		});
	});
});

describe("read-directory-recursive allow-list", () => {
	it("rejects arbitrary paths outside dialog, userData, and tmp roots", async () => {
		const { resolveAllowedRecursiveReadPath } = await import("../main");
		const arbitraryPath = await findExistingSystemPath();

		await expect(
			resolveAllowedRecursiveReadPath(arbitraryPath),
		).rejects.toThrow("許可されていないファイルパス");
	});
});
