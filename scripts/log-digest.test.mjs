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
		).toBe("Authorization: Bearer *** img.dcm [REDACTED]");
		expect(normalizeMessage("failed /Users/x/患者 太郎/img.dcm")).toBe(
			"failed img.dcm",
		);
		expect(normalizeMessage("failed C:\\Users\\John Doe\\horse\\x.dcm")).toBe(
			"failed x.dcm",
		);
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
		expect(parseSince("soon", now)).toBe(null);
		expect(parseSince(undefined, now)).toBe(null);
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

	it("パスは空白入りでも Windows でも basename だけにする", () => {
		const backslash = String.fromCharCode(92);
		const windows = `open C:${backslash}Users${backslash}John Doe${backslash}x.dcm`;
		expect(normalizeMessage("failed /Users/k/患者 太郎/img.dcm")).toBe(
			"failed img.dcm",
		);
		expect(normalizeMessage(windows)).toBe("open x.dcm");
		expect(normalizeMessage("plain 1/2 done")).toBe("plain #/# done");
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
