import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
	classifyDevMessage,
	dedupe,
	devFileDate,
	digest,
	electronLogDir,
	formatTable,
	normalizeMessage,
	parseDevLine,
	parseElectronLine,
	parseSince,
	readEntries,
	stripAnsi,
	summarize,
} from "./log-digest.mjs";

const at = (h, m, s) => new Date(2026, 8, 2, h, m, s).getTime();

describe("log-digest", () => {
	it("electronLogDir は OS ごとの electron-log 既定の置き場を返す", () => {
		const home = "/Users/me";
		expect(electronLogDir("Roentgen", { platform: "darwin", home })).toBe(
			"/Users/me/Library/Logs/Roentgen",
		);
		expect(electronLogDir("Roentgen", { platform: "linux", home })).toBe(
			"/Users/me/.config/Roentgen/logs",
		);
		expect(
			electronLogDir("Roentgen", {
				platform: "win32",
				home: "C:\\Users\\me",
				env: { APPDATA: "C:\\Users\\me\\AppData\\Roaming" },
			}),
		).toBe(join("C:\\Users\\me\\AppData\\Roaming", "Roentgen", "logs"));
	});

	it("parseElectronLine は ms の有無どちらの format も読む", () => {
		const withMs = parseElectronLine(
			"[2026-09-02 10:30:45.123] [warn] [renderer] slow (a.tsx:1)",
		);
		expect(withMs.level).toBe("warn");
		expect(withMs.message).toBe("[renderer] slow (a.tsx:1)");
		expect(withMs.time).toBe(at(10, 30, 45) + 123);

		const withoutMs = parseElectronLine(
			"[2026-09-02 10:30:45] [error] [gdrive] failed",
		);
		expect(withoutMs.level).toBe("error");
		expect(withoutMs.time).toBe(at(10, 30, 45));

		expect(parseElectronLine("not a log line")).toBe(null);
	});

	it("parseDevLine は \\r で区切り、ANSI と turbo 接頭辞を剥がして level を付ける", () => {
		const date = { y: "2026", mo: "09", d: "02" };
		const entries = parseDevLine(
			"[10:00:01] [err] @scope/pkg:dev: \u001b[31m✘ [ERROR] Cannot find module\u001b[0m\rbuilding...",
			date,
		);
		expect(entries.length).toBe(2);
		expect(entries[0].level).toBe("error");
		expect(entries[0].message).toBe("✘ [ERROR] Cannot find module");
		expect(entries[0].time).toBe(at(10, 0, 1));
		expect(entries[1].level).toBe("info");
		expect(entries[1].message).toBe("building...");
		expect(parseDevLine("garbage", date)).toEqual([]);
	});

	it("classifyDevMessage は行頭に固定し、行中の error は数えない", () => {
		expect(classifyDevMessage("error TS2322: Type 'x' is not assignable")).toBe(
			"error",
		);
		expect(classifyDevMessage("[ERROR] boom")).toBe("error");
		expect(classifyDevMessage("Error: ENOENT")).toBe("error");
		expect(classifyDevMessage("warning: unused import")).toBe("warn");
		expect(classifyDevMessage("[WARN] slow")).toBe("warn");
		expect(classifyDevMessage("[vite] Internal server error: failed")).toBe(
			"error",
		);
		expect(
			classifyDevMessage(
				"[vite] hmr update /src/component/ui/error-boundary.tsx",
			),
		).toBe("info");
		expect(classifyDevMessage("transforming error-boundary.tsx")).toBe("info");
		expect(classifyDevMessage("12:00:01 [vite] page reload")).toBe("info");
		expect(
			classifyDevMessage(
				"[0903/003025.705923:FATAL:electron_main_delegate.cc(216)] Running as root",
			),
		).toBe("error");
		expect(
			classifyDevMessage("[0903/003025.705923:WARNING:gpu.cc(1)] slow"),
		).toBe("warn");
		expect(classifyDevMessage("ELIFECYCLE  Command failed.")).toBe("info");
		expect(classifyDevMessage("FATAL: out of memory")).toBe("error");
		expect(classifyDevMessage("npm ERR! command failed")).toBe("error");
		expect(classifyDevMessage("npm error lifecycle failed")).toBe("error");
		expect(classifyDevMessage("pnpm ERR_PNPM_FETCH_500 request failed")).toBe(
			"error",
		);
		expect(
			classifyDevMessage("UnhandledPromiseRejectionWarning: Error: boom"),
		).toBe("error");
		expect(classifyDevMessage("(node:1) ExperimentalWarning: feature")).toBe(
			"warn",
		);
		expect(classifyDevMessage("npm errors are documented here")).toBe("info");
		expect(
			classifyDevMessage(
				"[26058:0903/004627.203911:ERROR:net/socket/ssl_client_socket_impl.cc:924] handshake failed",
			),
		).toBe("error");
	});

	it("stripAnsi / devFileDate", () => {
		expect(stripAnsi("\u001b[2K\u001b[1G\u001b[33mhi\u001b[0m")).toBe("hi");
		expect(devFileDate("/x/.logs/dev-20260902-103045.log")).toEqual({
			y: "2026",
			mo: "09",
			d: "02",
		});
		expect(devFileDate("/x/main.log")).toBe(null);
	});

	it("normalizeMessage は数値・ID・パスを伏せる", () => {
		expect(
			normalizeMessage(
				"failed /Users/me/proj/a.png after 1200ms id=deadbeefcafe 0x1f",
			),
		).toBe("failed a.png after #ms id=# 0x#");
		expect(
			normalizeMessage(
				"Authorization: Bearer eyJ.secret /Users/x/患者A/img.dcm ghp_abcdef123456",
			),
		).toBe("Authorization: *** [DICOM] [REDACTED]");
		expect(normalizeMessage("failed /Users/x/患者 太郎/img.dcm")).toBe(
			"failed [DICOM]",
		);
		expect(normalizeMessage("failed C:\\Users\\John Doe\\horse\\x.dcm")).toBe(
			"failed [DICOM]",
		);
	});

	it("normalizeMessage はJSON PHIと各種DICOMパスを原文ごと伏せる", () => {
		const message =
			'{"PatientName":"山田 太郎","access_token":"secret value"} ../患者 花子/study image.dicom \\\\server\\share\\患者次郎\\画像.dcm';
		const normalized = normalizeMessage(message);
		expect(normalized).not.toMatch(
			/山田|太郎|花子|次郎|画像|secret value|\.dcm|\.dicom/i,
		);
		expect(normalized).toContain("[DICOM]");
	});

	it("normalizeMessage は通常URLを壊さない", () => {
		expect(normalizeMessage("warning https://example.test/a/b?q=1")).toContain(
			"https://example.test/a/b?q=#",
		);
	});

	it("normalizeMessage はURL内のtokenも伏せる", () => {
		const normalized = normalizeMessage(
			"GET https://example.test/api?token=figd_SECRET&access_token=ghp_abcdef123456&next=ok",
		);
		expect(normalized).not.toMatch(/SECRET|ghp_abcdef123456/);
		expect(normalized).toContain("https://example.test/api");
		expect(normalized).toContain("next=ok");
	});

	it("DICOM末尾のUnicode句読点と記号を残してパス全体を伏せる", () => {
		expect(normalizeMessage("患者/山田.dcm!")).toBe("[DICOM]!");
		expect(normalizeMessage("患者/山田.dcm、次")).toBe("[DICOM]、次");
		expect(normalizeMessage("患者/山田.dcm。次")).toBe("[DICOM]。次");
		expect(normalizeMessage("患者/山田.dicom！次")).toBe("[DICOM]！次");
		expect(normalizeMessage("患者/山田.dicom？次")).toBe("[DICOM]？次");
		expect(normalizeMessage("患者/山田.dcm）")).toBe("[DICOM]）");
		expect(normalizeMessage("患者/山田.dcm】")).toBe("[DICOM]】");
		expect(normalizeMessage("患者/山田.dcm」")).toBe("[DICOM]」");
		expect(normalizeMessage("患者/山田.dcm…")).toBe("[DICOM]…");
		expect(normalizeMessage("https://example.test/患者/山田.dicom）")).toBe(
			"[DICOM]",
		);
		expect(normalizeMessage("https://example.test/患者/山田.dicom！？")).toBe(
			"[DICOM]",
		);
		for (const boundary of ["》", "〙", "〟", "※", "★", "©", "→", "〜"]) {
			expect(boundary).toMatch(/^[\p{P}\p{S}]$/u);
			expect(normalizeMessage(`患者/山田.dcm${boundary}`)).toBe(
				`[DICOM]${boundary}`,
			);
			expect(
				normalizeMessage(`https://example.test/患者/山田.dicom${boundary}`),
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
			expect(normalizeMessage(url)).toBe("[DICOM]");
		}
		expect(normalizeMessage("患者/山田.dcm\u200B次")).toBe("[DICOM]\u200B次");
		expect(normalizeMessage("患者/山田.dicom\u0301次")).toBe("[DICOM]\u0301次");
		expect(normalizeMessage("患者/山田.dcm続")).toBe("患者/山田.dcm続");
		expect(normalizeMessage("https://example.test/患者/山田.dcm2")).toBe(
			"https://example.test/患者/山田.dcm#",
		);
	});

	it("空白DICOM、escaped PHI、汎用secret、URL passwordを原文ごと伏せる", () => {
		const original =
			'open 患者 太郎/study image.dicom {"PatientName":"山田 \\"太郎\\" 続柄"} token=generic-token api_key=generic-api refresh_token=generic-refresh client_secret=generic-client https://user:url-password@example.test/患者/秘密.dcm)';
		const normalized = normalizeMessage(original);
		for (const secret of [
			"generic-token",
			"generic-api",
			"generic-refresh",
			"generic-client",
			"url-password",
		]) {
			expect(normalized).not.toContain(secret);
		}
		expect(normalized).not.toMatch(/患者|太郎|山田|続柄|秘密|\.dcm|\.dicom/i);
		expect(normalized).toContain("[DICOM]");
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
			const value = normalizeMessage(sample);
			expect(value).not.toMatch(/患者|山田|花子|\.dcm|\.dicom/i);
			expect(value).toContain("[DICOM]");
		}
		expect(normalized).toMatch(/\[DICOM\]$/);
	});

	it("dedupe は main.log と dev ログの同じ行を ±5 秒で 1 件に畳み、app を残す", () => {
		const entries = [
			{
				source: "app",
				time: at(10, 0, 0) + 200,
				level: "warn",
				message: "[main] slow 12ms",
			},
			{
				source: "dev",
				time: at(10, 0, 3),
				level: "warn",
				message: "[main] slow 12ms",
			},
			{
				source: "dev",
				time: at(10, 0, 9),
				level: "warn",
				message: "[main] slow 12ms",
			},
			{
				source: "dev",
				time: at(10, 0, 1),
				level: "error",
				message: "error TS1 x",
			},
		];
		const kept = dedupe(entries);
		expect(kept.map((e) => `${e.source}:${e.level}`)).toEqual([
			"app:warn",
			"dev:warn",
			"dev:error",
		]);
	});

	it("digest は warn/error だけを集計し、since と level で絞れる", () => {
		const entries = [
			{ source: "app", time: at(9, 0, 0), level: "info", message: "boot" },
			{ source: "app", time: at(9, 0, 1), level: "warn", message: "slow 10ms" },
			{
				source: "app",
				time: at(9, 30, 0),
				level: "warn",
				message: "slow 20ms",
			},
			{
				source: "app",
				time: at(9, 45, 0),
				level: "error",
				message: "fatal: boom",
			},
		];
		const rows = digest(entries);
		expect(rows.length).toBe(2);
		expect(rows[0].level).toBe("error");
		expect(rows[1].count).toBe(2);
		expect(rows[1].message).toBe("slow #ms");
		expect(rows[1].sample).toBe("slow #ms");
		expect(rows[1].first).toBe(at(9, 0, 1));
		expect(rows[1].last).toBe(at(9, 30, 0));

		expect(digest(entries, { since: at(9, 40, 0) }).length).toBe(1);
		expect(digest(entries, { minLevel: "error" }).length).toBe(1);
	});

	it("parseSince は相対と絶対の両方", () => {
		const now = at(12, 0, 0);
		expect(parseSince("30m", now)).toBe(now - 30 * 60_000);
		expect(parseSince("2h", now)).toBe(now - 2 * 3_600_000);
		expect(parseSince("1d", now)).toBe(now - 86_400_000);
		expect(parseSince("2026-09-02T09:00:00", now)).toBe(at(9, 0, 0));
		expect(parseSince("2024-02-29T09:00:00Z", now)).toBe(
			Date.UTC(2024, 1, 29, 9),
		);
		for (const invalid of [
			"2026-02-29T09:00:00Z",
			"2026-04-31T09:00:00Z",
			"2026-09-02T24:00:00Z",
			"2026-09-02T09:60:00Z",
			"2026-09-02T09:00:60Z",
			"2026-09-02T09:00:00+24:00",
			"2026-09-02T09:00:00+01:60",
			"9007199254740991d",
			"9007199254740992d",
		]) {
			expect(parseSince(invalid, now)).toBe(null);
		}
		expect(parseSince("soon", now)).toBe(null);
		expect(parseSince("5", now)).toBe(null);
		expect(parseSince(undefined, now)).toBe(null);
	});

	it("readEntries は削除競合したファイルを飛ばして次を読む", () => {
		const dir = mkdtempSync(join(tmpdir(), "roentgen-digest-race-"));
		try {
			const existing = join(dir, "dev-20260902-100000.log");
			writeFileSync(existing, "[10:00:00] [err] error: kept\n");
			const entries = readEntries({
				kind: "dev",
				paths: [join(dir, "dev-20260902-095959.log"), existing],
			});
			expect(entries).toHaveLength(1);
			expect(entries[0].message).toBe("error: kept");
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	it("readEntries は実ファイルから読み、summarize / formatTable が件数を出す", () => {
		const dir = mkdtempSync(join(tmpdir(), "roentgen-digest-"));
		try {
			const dev = join(dir, "dev-20260902-100000.log");
			writeFileSync(
				dev,
				[
					"[10:00:00] [out] vite ready",
					"[10:00:01] [err] error TS2322: bad type",
					"[10:00:02] [err] error TS2322: bad type",
					"[10:00:03] [out] warning: something",
					"",
				].join("\n"),
			);
			const rows = digest(readEntries({ kind: "dev", paths: [dev] }));
			expect(summarize(rows, "x.log")).toBe("✖ warn 1 / error 2 → x.log\n");
			const table = formatTable(rows);
			expect(table).toMatch(/^件数 \| level/);
			expect(table).toMatch(
				/2 \| error \| 09-02 10:00:01 \| 09-02 10:00:02 \| dev \| error TS#: bad type/,
			);
			expect(summarize([], "y")).toBe("✓ warn 0 / error 0 → y\n");
			expect(formatTable([])).toBe("warn / error はありません。\n");
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	it("日をまたいだ dev ログは翌日として扱う", () => {
		const dir = mkdtempSync(join(tmpdir(), "roentgen-digest-"));
		try {
			const dev = join(dir, "dev-20260902-235900.log");
			writeFileSync(
				dev,
				[
					"[23:59:59] [err] error before midnight",
					"[00:00:01] [err] error after midnight",
					"",
				].join("\n"),
			);
			const entries = readEntries({ kind: "dev", paths: [dev] });
			expect(entries).toHaveLength(2);
			expect(entries[1].time - entries[0].time).toBe(2000);
			expect(new Date(entries[1].time).getDate()).toBe(3);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});
});
