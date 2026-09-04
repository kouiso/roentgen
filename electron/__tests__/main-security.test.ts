import { access } from "node:fs/promises";
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
		initialize: vi.fn((_options?: { preload?: boolean }) => undefined),
		transports: {
			file: {
				level: "info",
				maxSize: 0,
				format: "",
				getFile: () => ({ path: "/tmp/main.log" }),
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

describe("read-directory-recursive allow-list", () => {
	it("永続ログへ患者ディレクトリを残さん", async () => {
		const { resolveAllowedReadPath } = await import("../main");
		const log = (await import("electron-log/main")).default;
		const requestedPath = join(tmpdir(), "患者A", "missing.dcm");
		vi.mocked(log.warn).mockClear();

		await expect(resolveAllowedReadPath(requestedPath, [])).rejects.toThrow(
			"ファイルが見つかりません",
		);
		expect(log.warn).toHaveBeenCalledWith(
			"Blocked missing file access: missing.dcm",
		);
		expect(vi.mocked(log.warn).mock.calls.flat().join(" ")).not.toContain(
			"患者A",
		);
	});

	it("rejects arbitrary paths outside dialog, userData, and tmp roots", async () => {
		const { resolveAllowedRecursiveReadPath } = await import("../main");
		const arbitraryPath = await findExistingSystemPath();

		await expect(
			resolveAllowedRecursiveReadPath(arbitraryPath),
		).rejects.toThrow("許可されていないファイルパス");
	});
});
