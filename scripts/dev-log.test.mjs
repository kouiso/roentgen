import { spawnSync } from "node:child_process";
import {
	mkdtempSync,
	readdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
	clockStamp,
	createLineWriter,
	fileStamp,
	printSummary,
	pruneLogs,
	runTee,
	sanitizeLogText,
	signalTree,
} from "./dev-log.mjs";

const withTempDir = (fn) => {
	const dir = mkdtempSync(join(tmpdir(), "roentgen-dev-log-"));
	const cleanup = () => rmSync(dir, { recursive: true, force: true });
	let result;
	try {
		result = fn(dir);
	} catch (error) {
		cleanup();
		throw error;
	}
	// async のときは終わるまで消さない (finally で即消すと子の書き込み先が消える)。
	if (result && typeof result.then === "function")
		return result.finally(cleanup);
	cleanup();
	return result;
};

describe("dev-log", () => {
	it("永続コピーではフルパスと認証情報を伏せる", () => {
		expect(
			sanitizeLogText(
				"error /Users/x/患者A/img.dcm Bearer eyJ.secret ghp_abcdef123456",
			),
		).toBe("error img.dcm Bearer *** [REDACTED]");
		expect(sanitizeLogText("error /Users/x/患者 太郎/img.dcm")).toBe(
			"error img.dcm",
		);
		expect(sanitizeLogText("error C:\\Users\\John Doe\\horse\\x.dcm")).toBe(
			"error x.dcm",
		);
	});

	it("clockStamp / fileStamp はゼロ埋めした固定幅", () => {
		const date = new Date(2026, 8, 2, 9, 5, 7);
		expect(clockStamp(date)).toBe("09:05:07");
		expect(fileStamp(date)).toBe("20260902-090507");
	});

	it("createLineWriter はチャンク途中で切れた行を結合し、時刻と stream 名を付ける", () => {
		const out = [];
		const writer = createLineWriter(
			(text) => out.push(text),
			"out",
			() => "10:00:00",
		);

		writer.write(Buffer.from("vite v6 ready"));
		writer.write(
			Buffer.from(" in 300ms\n  ➜  Local: http://localhost:5173/\npart"),
		);
		expect(out).toEqual([
			"[10:00:00] [out] vite v6 ready in 300ms\n",
			"[10:00:00] [out]   ➜  Local: http://localhost:5173/\n",
		]);

		writer.write(Buffer.from("ial\n"));
		expect(out[2]).toBe("[10:00:00] [out] partial\n");

		writer.write(Buffer.from("no newline at exit"));
		writer.flush();
		expect(out[3]).toBe("[10:00:00] [out] no newline at exit\n");
		writer.flush();
		expect(out.length).toBe(4);
	});

	it("createLineWriter は \\r と ANSI をそのまま残す (解析は digest の仕事)", () => {
		const out = [];
		const writer = createLineWriter(
			(text) => out.push(text),
			"err",
			() => "10:00:00",
		);
		writer.write("[33mwarning[0m 1\rwarning 2\n");
		expect(out[0]).toBe("[10:00:00] [err] [33mwarning[0m 1\rwarning 2\n");
	});

	it("pruneLogs は本数と合計バイトの上限を超えた分だけ古い順に消す", () =>
		withTempDir((dir) => {
			for (let i = 1; i <= 5; i += 1) {
				writeFileSync(join(dir, `dev-20260902-10000${i}.log`), "x".repeat(100));
			}
			writeFileSync(join(dir, "unrelated.log"), "keep me");

			const removedByCount = pruneLogs(dir, {
				maxFiles: 3,
				maxTotalBytes: 10_000,
			});
			expect(removedByCount.length).toBe(2);
			expect(readdirSync(dir).sort()).toEqual([
				"dev-20260902-100003.log",
				"dev-20260902-100004.log",
				"dev-20260902-100005.log",
				"unrelated.log",
			]);

			const removedByBytes = pruneLogs(dir, {
				maxFiles: 10,
				maxTotalBytes: 250,
			});
			expect(removedByBytes.map((p) => p.endsWith("100003.log"))).toEqual([
				true,
			]);
		}));

	it("createLineWriter はチャンクを跨いだ日本語を壊さない", () => {
		const written = [];
		const writer = createLineWriter(
			(text) => written.push(text),
			"out",
			() => "00:00:00",
		);
		const bytes = Buffer.from("警告: 失敗\n", "utf8");
		writer.write(bytes.subarray(0, 4));
		writer.write(bytes.subarray(4));
		writer.flush();

		expect(written).toEqual(["[00:00:00] [out] 警告: 失敗\n"]);
	});

	it("sanitizeLogText は UNC のパスも basename にする", () => {
		const b = String.fromCharCode(92);
		const unc = `open ${b}${b}server${b}share${b}患者 太郎${b}image.dcm failed`;
		expect(sanitizeLogText(unc)).toBe("open image.dcm failed");
	});

	it("signalTree は Windows では taskkill /T で木ごと落とす", () => {
		const calls = [];
		signalTree(4321, "SIGINT", "win32", (command, args) => {
			calls.push([command, args]);
			return { status: 0 };
		});

		expect(calls).toEqual([["taskkill", ["/pid", "4321", "/T", "/F"]]]);
	});

	it("pruneLogs は dir が無くても落ちない", () => {
		expect(pruneLogs("/nonexistent/roentgen-logs")).toEqual([]);
	});

	it("runTee は子の出力を画面とファイルの両方へ流し、終了コードを透過する", async () =>
		withTempDir(async (dir) => {
			const script =
				'process.stdout.write("hello\\n"); process.stderr.write("warning: careful\\n"); process.stdout.write("tail-no-newline"); process.exit(3);';
			const { code, logPath } = await runTee({
				command: process.execPath,
				args: ["-e", script],
				cwd: dir,
				env: process.env,
				logDir: dir,
				stdin: { isTTY: false },
			});

			expect(code).toBe(3);
			const lines = readFileSync(logPath, "utf8").trimEnd().split("\n");
			expect(lines.find((l) => l.includes("hello"))).toMatch(
				/^\[\d{2}:\d{2}:\d{2}\] \[out\] hello$/,
			);
			expect(lines.find((l) => l.includes("careful"))).toMatch(
				/^\[\d{2}:\d{2}:\d{2}\] \[err\] warning: careful$/,
			);
			// 残余バッファが flush される
			expect(lines.some((l) => l.endsWith("[out] tail-no-newline"))).toBe(true);
		}));

	it("runTee はファイル側だけ患者ディレクトリを伏せる", async () =>
		withTempDir(async (dir) => {
			const script = 'process.stderr.write("error /Users/x/患者A/img.dcm\\n");';
			const { logPath } = await runTee({
				command: process.execPath,
				args: ["-e", script],
				cwd: dir,
				env: process.env,
				logDir: dir,
				stdin: { isTTY: false },
			});

			const text = readFileSync(logPath, "utf8");
			expect(text).toContain("error img.dcm");
			expect(text).not.toContain("患者A");
		}));

	it("runTee は SIGINT を受けたら (非 TTY のとき) 子へ転送し、末尾行を落とさず終わる", async () =>
		withTempDir(async (dir) => {
			const script =
				'process.on("SIGINT", () => { process.stdout.write("bye\\n"); process.exit(130); }); process.stdout.write("started\\n"); setInterval(() => {}, 1000);';
			let started;
			const done = runTee({
				command: process.execPath,
				args: ["-e", script],
				cwd: dir,
				env: process.env,
				logDir: dir,
				stdin: { isTTY: false },
				onStarted: (info) => {
					started = info;
				},
			});
			await new Promise((resolveWait) => setTimeout(resolveWait, 400));
			// ラッパー自身が SIGINT を受けた状況を再現する (端末からではないので転送される)。
			process.emit("SIGINT");
			const { code, logPath } = await done;

			expect(code).toBe(130);
			expect(started.logPath).toBe(logPath);
			const text = readFileSync(logPath, "utf8");
			expect(text).toMatch(/\[out\] started\n/);
			expect(text).toMatch(/\[out\] bye\n/);
			// 子は終了している (孤児なし)
			expect(started.child.exitCode).toBe(130);
		}));

	it("runTee のシグナル転送は孫プロセス (turbo → Electron の形) まで届く", async () =>
		withTempDir(async (dir) => {
			// 子は SIGINT で自分だけ終わり、孫 (sleep) を残す。ラッパーが木ごと送るので孫も消えるはず。
			const script =
				'const { spawn } = require("node:child_process"); spawn("sleep", ["12345"], { stdio: "ignore" }); process.on("SIGINT", () => process.exit(130)); setInterval(() => {}, 1000);';
			const done = runTee({
				command: process.execPath,
				args: ["-e", script],
				cwd: dir,
				env: process.env,
				logDir: dir,
				stdin: { isTTY: false },
			});
			await new Promise((resolveWait) => setTimeout(resolveWait, 500));
			process.emit("SIGINT");
			const { code } = await done;
			await new Promise((resolveWait) => setTimeout(resolveWait, 300));

			expect(code).toBe(130);
			const survivors = spawnSync("pgrep", ["-f", "^sleep 12345$"], {
				encoding: "utf8",
			}).stdout.trim();
			expect(survivors).toBe("");
		}));

	it("runTee は起動できないコマンドでも解決し、理由をファイルに残す", async () =>
		withTempDir(async (dir) => {
			const { code, logPath } = await runTee({
				command: join(dir, "no-such-command"),
				args: [],
				cwd: dir,
				env: process.env,
				logDir: dir,
				stdin: { isTTY: false },
			});
			expect(code).toBe(1);
			expect(readFileSync(logPath, "utf8")).toMatch(/\[err\] failed to start/);
		}));

	it("printSummary は digest が無ければパスだけ出す", () =>
		withTempDir((dir) => {
			const logPath = join(dir, "dev-20260902-100000.log");
			writeFileSync(logPath, "");
			const out = [];
			printSummary(logPath, join(dir, "missing-digest.mjs"), (text) =>
				out.push(text),
			);
			expect(out).toEqual([`dev log → ${logPath}\n`]);
		}));
});
