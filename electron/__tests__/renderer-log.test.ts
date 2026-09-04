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
	redactSecrets,
	sanitizeLogArgument,
	sanitizeLogText,
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

describe("sanitizeLogText", () => {
	it("フルパスと認証情報を同時に伏せる", () => {
		expect(
			sanitizeLogText(
				"failed /Users/x/患者A/img.dcm Authorization: Bearer eyJ.secret ghp_abcdef123456",
			),
		).toBe("failed [DICOM] Authorization: *** [REDACTED]");
		expect(redactSecrets("plain text")).toBe("plain text");
	});

	it("JSON PHIと複数語の患者名を値全体で伏せる", () => {
		const text = sanitizeLogText(
			'{"PatientName":"山田 太郎 続柄","access_token":"secret value"}, PatientID=患者番号 日本語, status=failed',
		);
		expect(text).not.toMatch(/山田|太郎|続柄|患者番号|日本語|secret value/);
		expect(text).toContain("status=failed");
	});

	it("相対、空白、UNCのDICOMパスと拡張子を原文ごと伏せる", () => {
		const samples = [
			"open ../患者 太郎/study/scan.dcm failed",
			"open .//患者 次郎//study image.dicom failed",
			"open folder/患者 三郎/画像.dcm failed",
			"open \\\\server\\share\\患者 四郎\\秘密.dicom failed",
			"open 患者五郎.dicom failed",
		];
		for (const sample of samples) {
			const text = sanitizeLogText(sample);
			expect(text).toContain("[DICOM]");
			expect(text).not.toMatch(
				/患者|scan|study image|画像|秘密|五郎|\.dcm|\.dicom/i,
			);
		}
	});

	it("通常URLの構造を保ち、DICOM URL全体を伏せる", () => {
		const normalUrl = sanitizeLogText(
			"GET https://example.test/a/b?q=1&token=figd_URL_SECRET",
		);
		expect(normalUrl).not.toContain("URL_SECRET");
		expect(normalUrl).toContain("https://example.test/a/b?q=1");
		const dicomUrl = sanitizeLogText("GET https://example.test/患者/秘密.dcm");
		expect(dicomUrl).toBe("GET [DICOM]");
	});

	it("DICOM末尾のUnicode句読点と記号を残してパス全体を伏せる", () => {
		expect(sanitizeLogText("患者/山田.dcm!")).toBe("[DICOM]!");
		expect(sanitizeLogText("患者/山田.dcm、次")).toBe("[DICOM]、次");
		expect(sanitizeLogText("患者/山田.dcm。次")).toBe("[DICOM]。次");
		expect(sanitizeLogText("患者/山田.dicom！次")).toBe("[DICOM]！次");
		expect(sanitizeLogText("患者/山田.dicom？次")).toBe("[DICOM]？次");
		expect(sanitizeLogText("患者/山田.dcm）")).toBe("[DICOM]）");
		expect(sanitizeLogText("患者/山田.dcm】")).toBe("[DICOM]】");
		expect(sanitizeLogText("患者/山田.dcm」")).toBe("[DICOM]」");
		expect(sanitizeLogText("患者/山田.dcm…")).toBe("[DICOM]…");
		expect(sanitizeLogText("https://example.test/患者/山田.dicom）")).toBe(
			"[DICOM]",
		);
		expect(sanitizeLogText("https://example.test/患者/山田.dicom！？")).toBe(
			"[DICOM]",
		);
		for (const boundary of ["》", "〙", "〟", "※", "★", "©", "→", "〜"]) {
			expect(boundary).toMatch(/^[\p{P}\p{S}]$/u);
			expect(sanitizeLogText(`患者/山田.dcm${boundary}`)).toBe(
				`[DICOM]${boundary}`,
			);
			expect(
				sanitizeLogText(`https://example.test/患者/山田.dicom${boundary}`),
			).toBe("[DICOM]");
		}
	});

	it("emoji sequenceやformat文字でもDICOM URL token全体を伏せる", () => {
		for (const url of [
			"https://example.test/患者/山田.dcm⚠️",
			"https://example.test/患者/山田.dcm©️",
			"https://example.test/患者/山田.dicom👩‍⚕️",
			"https://example.test/患者/山田.dcm\u200B次",
			"https://example.test/患者/山田.dicom\u0301次",
			"https://example.test/%E6%82%A3%E8%80%85/%E5%B1%B1%E7%94%B0%2Edcm%E2%80%8B",
		]) {
			expect(sanitizeLogText(url)).toBe("[DICOM]");
		}
		expect(sanitizeLogText("患者/山田.dcm\u200B次")).toBe("[DICOM]\u200B次");
		expect(sanitizeLogText("患者/山田.dicom\u0301次")).toBe("[DICOM]\u0301次");
		expect(sanitizeLogText("患者/山田.dcm続")).toBe("患者/山田.dcm続");
		expect(sanitizeLogText("https://example.test/患者/山田.dcm2")).toBe(
			"https://example.test/患者/山田.dcm2",
		);
	});

	it("空白DICOM、escaped PHI、汎用secret、URL passwordを原文ごと伏せる", () => {
		const secrets = [
			"generic-token",
			"generic-api",
			"generic-refresh",
			"generic-client",
			"url-password",
		];
		const text = sanitizeLogText(
			'open 患者 太郎/study image.dicom {"PatientName":"山田 \\"太郎\\" 続柄"} token=generic-token api_key=generic-api refresh_token=generic-refresh client_secret=generic-client https://user:url-password@example.test/患者/秘密.dcm)',
		);
		for (const secret of secrets) expect(text).not.toContain(secret);
		expect(text).not.toMatch(/患者|太郎|山田|続柄|秘密|\.dcm|\.dicom/i);
		expect(text).toContain("[DICOM]");
		for (const sample of [
			"/Users/x/患者 太郎/山田 花子.dicom",
			"../患者 太郎/山田 花子 image.dicom",
			"患者/山田.dcm.",
			"https://example.test/患者/山田.dicom]",
			"患者:太郎/山田.dcm:",
			"https://example.test/患者/山田.dicom}!",
			"患者/山田.dcm!",
			"患者/山田.dcm。次",
			"患者/山田.dicom！？",
			"https://example.test/患者/山田.dicom！？",
		]) {
			const sanitized = sanitizeLogText(sample);
			expect(sanitized).not.toMatch(/患者|山田|花子|\.dcm|\.dicom/i);
			expect(sanitized).toContain("[DICOM]");
		}
		expect(text).toMatch(/\[DICOM\]\s*$/);
	});

	it("undefinedとSymbolの引数でもthrowしない", () => {
		expect(sanitizeLogArgument(undefined)).toBe("undefined");
		expect(sanitizeLogArgument(Symbol("safe"))).toBe("Symbol(safe)");
	});

	it("循環null-prototypeとstring化例外でもloggerを止めない", () => {
		const cyclic = Object.create(null) as Record<string, unknown>;
		cyclic.self = cyclic;
		const hostile = {
			toJSON: () => {
				throw new Error("json failed");
			},
			toString: () => {
				throw new Error("string failed");
			},
		};
		expect(sanitizeLogArgument(cyclic)).toBe("[unserializable]");
		expect(sanitizeLogArgument(hostile)).toBe("[unserializable]");
		expect(sanitizeLogArgument("still alive")).toBe("still alive");
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
		expect(result.text.length).toBe(2048);
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
			"[renderer] viewer failed for [DICOM] (viewer.tsx:7)",
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
			new Error("boom at /Users/x/患者A/secret.dcm"),
		);

		expect(log.error).toHaveBeenCalledTimes(1);
		const args = allLogArgs();
		expect(args).toContain("preload.js");
		expect(args).toContain("boom");
		expect(args).toContain("[DICOM]");
		expect(args).not.toContain("/Users/x/app");
		expect(args).not.toContain("患者A");
	});
});
