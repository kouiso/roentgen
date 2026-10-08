import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const sentryInitMock = vi.hoisted(() => vi.fn());
const crashReporterStartMock = vi.hoisted(() => vi.fn());
const electronState = vi.hoisted(() => ({ userDataPath: "" }));

vi.mock("electron", () => ({
	app: {
		isPackaged: false,
		getPath: () => electronState.userDataPath,
		whenReady: () => Promise.resolve(),
		on: vi.fn(),
		quit: vi.fn(),
	},
	BrowserWindow: class {
		static getAllWindows = () => [];
		constructor() {
			// 起動経路のうち Sentry 初期化までを検証したいので、ウィンドウ生成は失敗させて打ち切る
			throw new Error("BrowserWindow is not available in tests");
		}
	},
	crashReporter: {
		start: crashReporterStartMock,
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
	init: sentryInitMock,
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

const writePrefs = async (enabled: boolean) => {
	await writeFile(
		join(electronState.userDataPath, "crash-reporter-prefs.json"),
		JSON.stringify({ enabled }),
	);
};

const bootMainProcess = async () => {
	await import("../main");
	// crashReporter.start は Sentry 初期化の直後に呼ばれるため、起動処理がそこまで進んだ合図になる
	await vi.waitFor(() => expect(crashReporterStartMock).toHaveBeenCalled());
};

describe("main process Sentry consent gate", () => {
	beforeEach(async () => {
		vi.resetModules();
		sentryInitMock.mockReset();
		crashReporterStartMock.mockReset();
		electronState.userDataPath = await mkdtemp(
			join(tmpdir(), "roentgen-main-sentry-"),
		);
		process.env.SENTRY_DSN = "https://example@sentry.invalid/1";
	});

	it("does not initialize Sentry on startup when consent was never given", async () => {
		await bootMainProcess();

		expect(sentryInitMock).not.toHaveBeenCalled();
	});

	it("does not initialize Sentry on startup when consent is false", async () => {
		await writePrefs(false);

		await bootMainProcess();

		expect(sentryInitMock).not.toHaveBeenCalled();
	});

	it("initializes Sentry exactly once with PHI scrubbing after opt-in", async () => {
		await writePrefs(true);

		await bootMainProcess();

		expect(sentryInitMock).toHaveBeenCalledTimes(1);
		expect(sentryInitMock).toHaveBeenCalledWith(
			expect.objectContaining({
				dsn: "https://example@sentry.invalid/1",
				attachScreenshot: false,
				beforeSend: expect.any(Function),
			}),
		);
	});
});
