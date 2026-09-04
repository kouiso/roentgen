import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("electron-log/main", () => ({
	default: {
		error: vi.fn(),
		warn: vi.fn(),
		info: vi.fn(),
		debug: vi.fn(),
	},
}));

import log from "electron-log/main";
import {
	attachRendererConsoleForwarding,
	attachWindowLifecycleLogging,
	basenameOf,
	sanitizeRendererConsoleMessage,
	scrubPaths,
	toLogLevel,
} from "../renderer-log";

type Listener = (...args: unknown[]) => void;

const createFakeWebContents = (): {
	webContents: Electron.WebContents;
	dispatch: (event: string, ...args: unknown[]) => void;
} => {
	const handlers = new Map<string, Listener[]>();
	const on = vi.fn((event: string, listener: Listener) => {
		handlers.set(event, [...(handlers.get(event) ?? []), listener]);
		return fake;
	});
	// テストでは on だけを使う。Electron の WebContents 全体は不要。
	const fake: unknown = { on };
	if (!isWebContents(fake)) throw new Error("fake webContents の生成に失敗");
	return {
		webContents: fake,
		dispatch: (event, ...args) => {
			for (const listener of handlers.get(event) ?? []) listener(...args);
		},
	};
};

const isWebContents = (value: unknown): value is Electron.WebContents =>
	typeof value === "object" &&
	value !== null &&
	"on" in value &&
	typeof value.on === "function";

const allLogArgs = (): string =>
	[log.error, log.warn, log.info, log.debug]
		.flatMap((fn) => vi.mocked(fn).mock.calls)
		.flat()
		.map((arg) => String(arg))
		.join("\n");

describe("toLogLevel", () => {
	it("maps Electron console levels to electron-log levels", () => {
		expect(toLogLevel("error")).toBe("error");
		expect(toLogLevel("warning")).toBe("warn");
		expect(toLogLevel("info")).toBe("info");
		expect(toLogLevel("debug")).toBe("debug");
	});

	it("falls back to info for unknown levels", () => {
		expect(toLogLevel("verbose")).toBe("info");
		expect(toLogLevel("")).toBe("info");
	});
});

describe("basenameOf", () => {
	it("returns the last segment of a POSIX path", () => {
		expect(basenameOf("/a/b/c.ts")).toBe("c.ts");
	});

	it("returns the last segment of a Windows path", () => {
		expect(basenameOf("C:\\a\\b\\c.ts")).toBe("c.ts");
	});

	it("strips query and hash from URLs", () => {
		expect(basenameOf("http://localhost:5173/src/x.tsx?t=123")).toBe("x.tsx");
		expect(basenameOf("http://localhost:5173/src/x.tsx#frag")).toBe("x.tsx");
	});

	it("returns empty string for empty input", () => {
		expect(basenameOf("")).toBe("");
	});
});

describe("scrubPaths", () => {
	it("replaces absolute paths with their basename and keeps the message", () => {
		const input =
			"failed to open /Users/x/患者A/img.dcm and C:\\data\\horse\\img.dcm now";
		expect(scrubPaths(input)).toBe("failed to open img.dcm and img.dcm now");
	});

	it("leaves text without paths untouched", () => {
		expect(scrubPaths("plain message 1/2 done")).toBe("plain message 1/2 done");
	});

	it("strips folder names that contain spaces (患者名の混入を防ぐ)", () => {
		expect(scrubPaths("failed /Users/kouiso/患者 太郎/img.dcm")).toBe(
			"failed img.dcm",
		);
		expect(scrubPaths("C:\\Users\\John Doe\\horse\\x.dcm missing")).toBe(
			"x.dcm missing",
		);
	});

	it("scrubs escaped Windows separators (JSON 化されたパス)", () => {
		expect(scrubPaths("open C:\\\\Users\\\\John Doe\\\\x.dcm failed")).toBe(
			"open x.dcm failed",
		);
	});

	it("does not swallow the words between two paths", () => {
		expect(scrubPaths("a /a/b and /c/d end")).toBe("a b and d end");
	});
});

describe("sanitizeRendererConsoleMessage", () => {
	it("formats the renderer text with basename and line number", () => {
		const result = sanitizeRendererConsoleMessage({
			level: "warning",
			message: "hello",
			sourceId: "http://localhost:5173/src/app.tsx?t=1",
			lineNumber: 42,
		});
		expect(result).toEqual({
			level: "warn",
			text: "[renderer] hello (app.tsx:42)",
		});
	});

	it("truncates text longer than 2048 chars and appends a suffix", () => {
		const result = sanitizeRendererConsoleMessage({
			level: "info",
			message: "a".repeat(5000),
			sourceId: "",
			lineNumber: 0,
		});
		expect(result.text.endsWith("…[truncated]")).toBe(true);
		expect(result.text.length).toBe(2048 + "…[truncated]".length);
		expect(result.text.startsWith("[renderer] aaaa")).toBe(true);
	});
});

describe("attachRendererConsoleForwarding", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("forwards console-message events with scrubbed source paths", () => {
		const { webContents, dispatch } = createFakeWebContents();
		attachRendererConsoleForwarding(webContents);

		dispatch("console-message", {
			level: "warning",
			message: "viewer failed for /Users/x/患者A/img.dcm",
			sourceId: "/Users/x/roentgen/src/viewer.tsx",
			lineNumber: 7,
		});

		expect(log.warn).toHaveBeenCalledTimes(1);
		expect(log.warn).toHaveBeenCalledWith(
			"[renderer] viewer failed for img.dcm (viewer.tsx:7)",
		);
		expect(allLogArgs()).not.toContain("/Users/x");
		expect(allLogArgs()).not.toContain("患者A");
	});
});

describe("attachWindowLifecycleLogging", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("ignores ERR_ABORTED (-3) — 遷移キャンセルは障害ではない", () => {
		const { webContents, dispatch } = createFakeWebContents();
		attachWindowLifecycleLogging(webContents);

		dispatch("did-fail-load", {}, -3, "ERR_ABORTED", "http://localhost/", true);

		expect(log.error).not.toHaveBeenCalled();
	});

	it("logs did-fail-load as error with the URL basename only", () => {
		const { webContents, dispatch } = createFakeWebContents();
		attachWindowLifecycleLogging(webContents);

		dispatch(
			"did-fail-load",
			{},
			-6,
			"ERR_FILE_NOT_FOUND",
			"file:///Users/x/app/dist/index.html",
			true,
		);

		expect(log.error).toHaveBeenCalledTimes(1);
		const args = allLogArgs();
		expect(args).toContain("did-fail-load");
		expect(args).toContain("-6");
		expect(args).toContain("ERR_FILE_NOT_FOUND");
		expect(args).toContain("index.html");
		expect(args).not.toContain("/Users/x");
	});

	it("logs render-process-gone as error with reason and exit code", () => {
		const { webContents, dispatch } = createFakeWebContents();
		attachWindowLifecycleLogging(webContents);

		dispatch("render-process-gone", {}, { reason: "crashed", exitCode: 11 });

		expect(log.error).toHaveBeenCalledTimes(1);
		const args = allLogArgs();
		expect(args).toContain("render-process-gone");
		expect(args).toContain("crashed");
		expect(args).toContain("11");
	});

	it("logs unresponsive as warn", () => {
		const { webContents, dispatch } = createFakeWebContents();
		attachWindowLifecycleLogging(webContents);

		dispatch("unresponsive");

		expect(log.warn).toHaveBeenCalledTimes(1);
		expect(log.error).not.toHaveBeenCalled();
		expect(allLogArgs()).toContain("unresponsive");
	});

	it("logs preload-error as error without the full preload path", () => {
		const { webContents, dispatch } = createFakeWebContents();
		attachWindowLifecycleLogging(webContents);

		dispatch(
			"preload-error",
			{},
			"/Users/x/app/dist-electron/preload.js",
			new Error("boom"),
		);

		expect(log.error).toHaveBeenCalledTimes(1);
		const args = allLogArgs();
		expect(args).toContain("preload.js");
		expect(args).toContain("boom");
		expect(args).not.toContain("/Users/x/app");
	});
});
