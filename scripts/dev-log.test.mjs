import { spawn } from "node:child_process";
import {
	existsSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	rmSync,
	statSync,
	utimesSync,
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
	processStartToken,
	pruneLogs,
	recoverStaleActiveLogs,
	runTee,
	sanitizeLogText,
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
		).toBe("error [DICOM] Bearer *** [REDACTED]");
		expect(sanitizeLogText("error /Users/x/患者 太郎/img.dcm")).toBe(
			"error [DICOM]",
		);
		expect(sanitizeLogText("error C:\\Users\\John Doe\\horse\\x.dcm")).toBe(
			"error [DICOM]",
		);
	});

	it("永続コピーでは各種トークンと長大行を伏せる", () => {
		const sanitized = sanitizeLogText(
			`FIGD_SECRET X-Figma-Token: abc access_token=xyz github_pat_123 ${"x".repeat(9000)}`,
		);
		expect(sanitized).not.toMatch(/SECRET|abc|xyz|github_pat_123/);
		expect(sanitized).toMatch(/\[truncated\]$/);
	});

	it("JSON形式のtokenとPHIを伏せ、URLを壊さない", () => {
		const sanitized = sanitizeLogText(
			'{"access_token":"secret value","PatientName":"山田 太郎 続柄"} https://example.test/a/b?q=1&token=figd_URL_SECRET',
		);
		expect(sanitized).not.toMatch(/secret value|山田|太郎|続柄|URL_SECRET/);
		expect(sanitized).toContain("https://example.test/a/b?q=1");
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
		const text = sanitizeLogText(
			'open 患者 太郎/study image.dicom {"PatientName":"山田 \\"太郎\\" 続柄"} token=generic-token api_key=generic-api refresh_token=generic-refresh client_secret=generic-client https://user:url-password@example.test/患者/秘密.dcm)',
		);
		for (const secret of [
			"generic-token",
			"generic-api",
			"generic-refresh",
			"generic-client",
			"url-password",
		]) {
			expect(text).not.toContain(secret);
		}
		expect(text).not.toMatch(/患者|太郎|山田|続柄|秘密|\.dcm|\.dicom/i);
		expect(text).toContain("[DICOM]");
		expect(text).toMatch(/\[DICOM\]$/);
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
	});

	it("TTYのSIGINTでも子が終了しなければ猶予後に強制終了する", async () =>
		withTempDir(async (dir) => {
			const done = runTee({
				command: process.execPath,
				args: [
					"-e",
					'process.on("SIGINT", () => {}); setInterval(() => {}, 1000);',
				],
				cwd: dir,
				env: process.env,
				logDir: dir,
				stdin: { isTTY: true },
				signalGraceMs: 50,
			});
			await new Promise((resolveWait) => setTimeout(resolveWait, 300));
			process.emit("SIGINT");
			const { code } = await done;

			expect(code).toBe(130);
		}));

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

	it("createLineWriter は分割UTF-8を壊さず、改行なしの残余を上限内に保つ", () => {
		const out = [];
		const writer = createLineWriter(
			(text) => out.push(text),
			"out",
			() => "10:00:00",
			32,
		);
		const encoded = Buffer.from("患者\n");
		writer.write(encoded.subarray(0, 2));
		writer.write(encoded.subarray(2));
		writer.write("x".repeat(100));
		writer.write("discarded until newline\nstill works\n");
		writer.flush();

		expect(out[0]).toContain("患者");
		expect(out.join("")).not.toContain("�");
		expect(out[1]).toMatch(/\[truncated\]$/m);
		expect(out.some((line) => line.endsWith("still works\n"))).toBe(true);
		expect(out.join("")).not.toContain("discarded");
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
			expect(text).toContain("error [DICOM]");
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

	it("runTee は SIGHUP を専用process groupへ転送して129を返す", async () =>
		withTempDir(async (dir) => {
			const done = runTee({
				command: process.execPath,
				args: [
					"-e",
					'process.on("SIGHUP", () => process.exit(129)); process.stdout.write("ready\\n"); setInterval(() => {}, 1000);',
				],
				cwd: dir,
				env: process.env,
				logDir: dir,
			});
			await new Promise((resolveWait) => setTimeout(resolveWait, 300));
			process.emit("SIGHUP");
			const { code } = await done;
			expect(code).toBe(129);
		}));

	it("runTee のシグナル転送は孫プロセス (turbo → Electron の形) まで届く", async () =>
		withTempDir(async (dir) => {
			const pidPath = join(dir, "grandchild.pid");
			const script = [
				'const { spawn } = require("node:child_process");',
				'const { writeFileSync } = require("node:fs");',
				'const grandchild = spawn("sleep", ["12345"], { stdio: "ignore" });',
				`writeFileSync(${JSON.stringify(pidPath)}, String(grandchild.pid));`,
				'process.on("SIGINT", () => process.exit(130));',
				"setInterval(() => {}, 1000);",
			].join(" ");
			let grandchildPid = 0;
			const done = runTee({
				command: process.execPath,
				args: ["-e", script],
				cwd: dir,
				env: process.env,
				logDir: dir,
				stdin: { isTTY: false },
			});
			for (let count = 0; count < 200 && !existsSync(pidPath); count += 1) {
				await new Promise((resolveWait) => setTimeout(resolveWait, 10));
			}
			if (!existsSync(pidPath)) {
				process.emit("SIGINT");
				await done;
				throw new Error("孫PIDの準備が時間内に完了しなかった");
			}
			grandchildPid = Number(readFileSync(pidPath, "utf8"));
			process.emit("SIGINT");
			const { code } = await done;

			expect(code).toBe(130);
			expect(() => process.kill(grandchildPid, 0)).toThrow(
				expect.objectContaining({ code: "ESRCH" }),
			);
		}));

	it("TTYで直下の子が130終了しても、SIGINTを無視する孫を残さない", async () =>
		withTempDir(async (dir) => {
			const pidPath = join(dir, "grandchild.pid");
			const grandchild =
				'process.on("SIGINT", () => {}); setInterval(() => {}, 1000);';
			const child = [
				'const { spawn } = require("node:child_process");',
				'const { writeFileSync } = require("node:fs");',
				`const grandchild = spawn(process.execPath, ["-e", ${JSON.stringify(grandchild)}], { stdio: "ignore" });`,
				`writeFileSync(${JSON.stringify(pidPath)}, String(grandchild.pid));`,
				'process.on("SIGINT", () => process.exit(130));',
				"setInterval(() => {}, 1000);",
			].join(" ");
			let started;
			let grandchildPid = 0;
			const done = runTee({
				command: process.execPath,
				args: ["-e", child],
				cwd: dir,
				env: process.env,
				logDir: dir,
				stdin: { isTTY: true },
				signalGraceMs: 50,
				onStarted: (info) => {
					started = info;
				},
			});
			for (let count = 0; count < 200 && !existsSync(pidPath); count += 1) {
				await new Promise((resolveWait) => setTimeout(resolveWait, 10));
			}
			if (!existsSync(pidPath)) {
				process.kill(started.child.pid, "SIGKILL");
				await done;
				throw new Error("孫PIDの準備が時間内に完了しなかった");
			}
			grandchildPid = Number(readFileSync(pidPath, "utf8"));
			process.emit("SIGINT");
			const { code } = await done;

			expect(code).toBe(130);
			let grandchildAlive = true;
			for (let count = 0; count < 100 && grandchildAlive; count += 1) {
				try {
					process.kill(grandchildPid, 0);
					await new Promise((resolveWait) => setTimeout(resolveWait, 10));
				} catch {
					grandchildAlive = false;
				}
			}
			if (grandchildAlive) process.kill(grandchildPid, "SIGKILL");
			expect(grandchildAlive, "SIGINTを無視した孫が残っている").toBe(false);
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

	it("ログディレクトリへ書けなくても子コマンドは実行する", async () =>
		withTempDir(async (dir) => {
			const blocked = join(dir, "blocked");
			writeFileSync(blocked, "file");
			const { code } = await runTee({
				command: process.execPath,
				args: ["-e", "process.exit(0)"],
				cwd: dir,
				env: process.env,
				logDir: blocked,
			});
			expect(code).toBe(0);
		}));

	it("quota lockを取れなくても子は実行し、loggingを成功扱いしない", async () =>
		withTempDir(async (dir) => {
			writeFileSync(
				join(dir, ".dev-log-quota.lock"),
				JSON.stringify({ pid: process.pid }),
			);
			const result = await runTee({
				command: process.execPath,
				args: ["-e", 'process.stdout.write("child-ran\\n")'],
				cwd: dir,
				env: process.env,
				logDir: dir,
				quotaLockTimeoutMs: 30,
			});
			expect(result.code).toBe(0);
			expect(result.loggingEnabled).toBe(false);
			expect(existsSync(result.logPath)).toBe(false);
		}));

	it("同一秒の並行起動は別ファイルを確保する", async () =>
		withTempDir(async (dir) => {
			const start = (marker) =>
				runTee({
					command: process.execPath,
					args: [
						"-e",
						`process.stdout.write(${JSON.stringify(`${marker}\n`)})`,
					],
					cwd: dir,
					env: process.env,
					logDir: dir,
				});
			const [first, second] = await Promise.all([
				start("first"),
				start("second"),
			]);
			expect(first.logPath).not.toBe(second.logPath);
			expect(readFileSync(first.logPath, "utf8")).toContain("first");
			expect(readFileSync(second.logPath, "utf8")).toContain("second");
		}));

	it(
		"20並列でもactive名を衝突・残留させず、総量上限を超えない",
		async () =>
			withTempDir(async (dir) => {
				const previousMaxListeners = process.getMaxListeners();
				process.setMaxListeners(30);
				const results = await Promise.all(
					Array.from({ length: 20 }, (_, index) =>
						runTee({
							command: process.execPath,
							args: [
								"-e",
								`process.stdout.write(${JSON.stringify(`worker-${index}\n`)})`,
							],
							cwd: dir,
							env: process.env,
							logDir: dir,
							maxTotalBytes: 300,
						}),
					),
				).finally(() => process.setMaxListeners(previousMaxListeners));
				expect(new Set(results.map(({ logPath }) => logPath)).size).toBe(20);
				expect(
					readdirSync(dir).filter((name) => name.endsWith(".active")),
				).toHaveLength(0);
				expect(
					readdirSync(dir).filter(
						(name) => name.endsWith(".owner") || name.endsWith(".lock"),
					),
				).toHaveLength(0);
				const finalLogs = readdirSync(dir).filter((name) =>
					/^dev-.*\.log$/.test(name),
				);
				expect(finalLogs.length).toBeLessThanOrEqual(10);
				const total = finalLogs.reduce(
					(sum, name) => sum + statSync(join(dir, name)).size,
					0,
				);
				expect(total).toBeLessThanOrEqual(300);
			}),
		15_000,
	);

	it("所有権不明のactiveでquotaが尽きたら0B finalを成功扱いせず、自分のactiveを消す", async () =>
		withTempDir(async (dir) => {
			writeFileSync(
				join(dir, "dev-20260902-100000.log.active"),
				"x".repeat(90),
			);
			const result = await runTee({
				command: process.execPath,
				args: ["-e", 'process.stdout.write("new output\\n")'],
				cwd: dir,
				env: process.env,
				logDir: dir,
				maxTotalBytes: 100,
			});
			const total = readdirSync(dir)
				.filter((name) => /^dev-.*\.log(?:\.active)?$/.test(name))
				.reduce((sum, name) => sum + statSync(join(dir, name)).size, 0);
			expect(total).toBeLessThanOrEqual(100);
			expect(result.loggingEnabled).toBe(false);
			expect(existsSync(result.logPath)).toBe(false);
			expect(
				readdirSync(dir).filter((name) => name.endsWith(".active")),
			).toEqual(["dev-20260902-100000.log.active"]);
		}));

	it("active logの上限後も子コマンドを完走する", async () =>
		withTempDir(async (dir) => {
			const result = await runTee({
				command: process.execPath,
				args: ["-e", 'process.stdout.write("x".repeat(1000))'],
				cwd: dir,
				env: process.env,
				logDir: dir,
				maxLogBytes: 100,
			});
			expect(result.code).toBe(0);
			expect(result.loggingEnabled).toBe(false);
			expect(existsSync(result.logPath)).toBe(false);
		}));

	it("死んだownerのactiveをfinalへ昇格し、PID再利用と生存ownerを区別する", () =>
		withTempDir((dir) => {
			const stale = join(dir, "dev-20260902-100000.log.active");
			const staleFinal = stale.slice(0, -".active".length);
			writeFileSync(stale, "stale");
			writeFileSync(
				`${stale}.owner`,
				JSON.stringify({ pid: process.pid, startToken: "other" }),
			);
			expect(
				recoverStaleActiveLogs(
					dir,
					() => true,
					() => "current",
				),
			).toEqual([staleFinal]);
			expect(readFileSync(staleFinal, "utf8")).toBe("stale");
			expect(existsSync(stale)).toBe(false);

			const live = join(dir, "dev-20260902-100001.log.active");
			writeFileSync(live, "live");
			writeFileSync(`${live}.owner`, JSON.stringify({ pid: process.pid }));
			expect(recoverStaleActiveLogs(dir, () => true)).toEqual([]);
			expect(existsSync(live)).toBe(true);
		}));

	it("ownerが空のままcrashしたactiveも猶予後にfinalへ昇格する", () =>
		withTempDir((dir) => {
			const active = join(dir, "dev-20260902-100000.log.active");
			const final = active.slice(0, -".active".length);
			writeFileSync(active, "before crash\n");
			writeFileSync(`${active}.owner`, "");
			const old = new Date(Date.now() - 2000);
			utimesSync(active, old, old);

			expect(
				recoverStaleActiveLogs(
					dir,
					() => false,
					() => null,
					0,
				),
			).toEqual([final]);
			expect(readFileSync(final, "utf8")).toBe("before crash\n");
			expect(existsSync(`${active}.owner`)).toBe(false);
		}));

	it("active公開前にcrashした孤立ownerを猶予後に回収する", () =>
		withTempDir((dir) => {
			const ownerPath = join(dir, "dev-20260902-100000.log.active.owner");
			writeFileSync(ownerPath, JSON.stringify({ pid: 999_999 }));
			const old = new Date(Date.now() - 2000);
			utimesSync(ownerPath, old, old);

			recoverStaleActiveLogs(
				dir,
				() => false,
				() => null,
				0,
			);
			expect(existsSync(ownerPath)).toBe(false);
		}));

	it("独立Node間でもquota確認とwriteを原子化する", async () =>
		withTempDir(async (dir) => {
			const barrier = join(dir, "go");
			const moduleUrl = new URL("./dev-log.mjs", import.meta.url).href;
			const worker = [
				'import { existsSync } from "node:fs";',
				`const { runTee } = await import(${JSON.stringify(moduleUrl)});`,
				`while (!existsSync(${JSON.stringify(barrier)})) await new Promise((r) => setTimeout(r, 5));`,
				`await runTee({ command: process.execPath, args: ["-e", ${JSON.stringify('process.stdout.write("x".repeat(250) + "\\n")')}], cwd: ${JSON.stringify(dir)}, env: process.env, logDir: ${JSON.stringify(dir)}, maxTotalBytes: 1000 });`,
			].join("\n");
			const workers = Array.from({ length: 8 }, () =>
				spawn(process.execPath, ["--input-type=module", "-e", worker], {
					stdio: "ignore",
				}),
			);
			writeFileSync(barrier, "go");
			const codes = await Promise.all(
				workers.map(
					(child) =>
						new Promise((resolve) =>
							child.once("exit", (code) => resolve(code)),
						),
				),
			);
			expect(codes).toEqual(Array(8).fill(0));
			const logs = readdirSync(dir).filter((name) =>
				/^dev-.*\.log(?:\.active)?$/.test(name),
			);
			const total = logs.reduce(
				(sum, name) => sum + statSync(join(dir, name)).size,
				0,
			);
			expect(total).toBeLessThanOrEqual(1000);
		}));

	it("WindowsのPID開始時刻はPowerShell失敗時にWMICへfallbackする", () => {
		const calls = [];
		const token = processStartToken(
			42,
			(command) => {
				calls.push(command);
				return command === "powershell.exe"
					? { status: 1, stdout: "" }
					: {
							status: 0,
							stdout: "CreationDate=20260904010203.000000-420\n",
						};
			},
			"win32",
		);
		expect(token).toBe("20260904010203.000000-420");
		expect(calls).toEqual(["powershell.exe", "wmic"]);
	});

	it("旧実装が残した空lockは猶予後に安全回収する", async () =>
		withTempDir(async (dir) => {
			const lockPath = join(dir, ".dev-log-quota.lock");
			writeFileSync(lockPath, "");
			const old = new Date(Date.now() - 2000);
			utimesSync(lockPath, old, old);
			const result = await runTee({
				command: process.execPath,
				args: ["-e", 'process.stdout.write("recovered\\n")'],
				cwd: dir,
				env: process.env,
				logDir: dir,
			});
			expect(result.loggingEnabled).toBe(true);
			expect(readFileSync(result.logPath, "utf8")).toContain("recovered");
		}));

	it("子が自発SIGTERM終了したら143を返す", async () =>
		withTempDir(async (dir) => {
			const result = await runTee({
				command: process.execPath,
				args: ["-e", 'process.kill(process.pid, "SIGTERM")'],
				cwd: dir,
				env: process.env,
				logDir: dir,
			});
			expect(result.code).toBe(143);
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

	it("printSummary はログ無効時にgreen summaryを出さない", () =>
		withTempDir((dir) => {
			const logPath = join(dir, "missing.log");
			const out = [];
			printSummary(logPath, join(dir, "missing-digest.mjs"), (text) =>
				out.push(text),
			);
			expect(out).toEqual([`dev log unavailable → ${logPath}\n`]);
			expect(out.join("")).not.toContain("✓");
		}));

	it("quotaで途中欠落したログはfinalを残すがgreen summaryを出さない", async () =>
		withTempDir(async (dir) => {
			const result = await runTee({
				command: process.execPath,
				args: [
					"-e",
					'process.stdout.write("first\\n" + "x".repeat(1000) + "\\n")',
				],
				cwd: dir,
				env: process.env,
				logDir: dir,
				maxLogBytes: 100,
			});
			expect(result.loggingEnabled).toBe(false);
			expect(existsSync(result.logPath)).toBe(true);
			const out = [];
			printSummary(
				result.logPath,
				join(dir, "missing-digest.mjs"),
				(text) => out.push(text),
				false,
			);
			expect(out).toEqual([`dev log incomplete → ${result.logPath}\n`]);
			expect(out.join("")).not.toContain("✓");
		}));
});
