import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
	chmodSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
const root = fileURLToPath(new URL("../../", import.meta.url));
const entry = join(root, ".github/ci/run.mjs");
function trace(profile, fail = "") {
	const dir = mkdtempSync(join(tmpdir(), "roentgen-ci-contract-"));
	try {
		for (const name of ["pnpm", "xvfb-run"]) {
			const p = join(dir, name);
			writeFileSync(
				p,
				`#!${process.execPath}\nconst fs=require('node:fs');const cmd=[${JSON.stringify(name)},...process.argv.slice(2)];fs.appendFileSync(process.env.TRACE,JSON.stringify(cmd)+'\\n');if(cmd.join(' ')===process.env.FAIL)process.exit(37);\n`,
			);
			chmodSync(p, 0o700);
		}
		const result = spawnSync(process.execPath, [entry, profile], {
			cwd: dir,
			env: {
				...process.env,
				PATH: `${dir}:${process.env.PATH}`,
				TRACE: join(dir, "trace"),
				FAIL: fail,
			},
			encoding: "utf8",
		});
		let commands = [];
		try {
			commands = readFileSync(join(dir, "trace"), "utf8")
				.trim()
				.split("\n")
				.filter(Boolean)
				.map(JSON.parse);
		} catch {}
		return { ...result, commands };
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
}
const quality = [
	["pnpm", "lint"],
	["pnpm", "exec", "tsc", "--noEmit"],
	["pnpm", "test"],
];
test("fast keeps full lint/typecheck/unit/build checks", () => {
	const r = trace("fast");
	assert.equal(r.status, 0, r.stderr);
	assert.deepEqual(r.commands, [...quality, ["pnpm", "build"]]);
});
test("full includes renderer and desktop checks after only one build", () => {
	const r = trace("full");
	assert.equal(r.status, 0, r.stderr);
	assert.deepEqual(r.commands.slice(0, 5), [
		...quality,
		["pnpm", "build"],
		["pnpm", "test:e2e", "--", "--project=renderer"],
	]);
	assert.equal(
		r.commands.filter((c) => c.join(" ") === "pnpm build").length,
		1,
	);
	assert.ok(r.commands.at(-1).includes("--project=electron"));
	assert.ok(r.commands.at(-1).includes("test:e2e"));
});
test("first failure propagates exactly and stops later checks", () => {
	for (const command of [
		"pnpm lint",
		"pnpm exec tsc --noEmit",
		"pnpm test",
		"pnpm build",
		"pnpm test:e2e -- --project=renderer",
	]) {
		const r = trace("full", command);
		assert.equal(r.status, 37);
		assert.equal(r.commands.at(-1).join(" "), command);
	}
	assert.equal(trace("unknown").status, 2);
});
test("Linux display setup preserves screen dimensions and existing WSL-safe wrapper", async () => {
	const { electronCommand } = await import("./run.mjs");
	assert.deepEqual(electronCommand("linux", {}), [
		"xvfb-run",
		"--auto-servernum",
		"--server-args=-screen 0 1280x720x24",
		"pnpm",
		"test:e2e",
		"--",
		"--project=electron",
	]);
	for (const [platform, env] of [
		["darwin", {}],
		["linux", { DISPLAY: ":1" }],
		["win32", {}],
	])
		assert.deepEqual(electronCommand(platform, env), [
			"pnpm",
			"test:e2e",
			"--",
			"--project=electron",
		]);
});
test("cloud retains matrix and all phases use shared entry", () => {
	const w = readFileSync(join(root, ".github/workflows/ci.yml"), "utf8");
	assert.match(w, /check-type: \[lint, typecheck, test\]/);
	for (const phase of ["lint", "typecheck", "test", "build", "electron"])
		assert.ok(w.includes(`node .github/ci/run.mjs ${phase}`));
	const t = readFileSync(join(root, "Taskfile.yml"), "utf8");
	assert.ok(t.includes("pnpm install --frozen-lockfile"));
	assert.ok(t.includes("node .github/ci/run.mjs fast"));
	assert.ok(t.includes("node .github/ci/run.mjs full"));
});
test("release prerequisite replaces only duplicate Linux validation and retains publication gates", () => {
	const w = readFileSync(join(root, ".github/workflows/release.yml"), "utf8");
	assert.match(w, /cancel-in-progress: false/);
	assert.ok(w.includes("node .github/ci/run.mjs quality"));
	assert.ok(w.includes("node .github/ci/run.mjs renderer"));
	const linux = w.split("  build-linux:")[1];
	assert.match(linux, /needs: quality-gates/);
	assert.ok(!linux.includes("Verify headless gates"));
	assert.ok(!linux.includes("Install Playwright Chromium"));
	assert.ok(!linux.includes("Renderer headless E2E"));
	for (const command of [
		"pnpm build",
		"pnpm dist --linux --publish never",
		"pnpm release:checksums",
		"pnpm release:gate",
	])
		assert.ok(linux.includes(command));
	assert.equal(w.match(/needs: \[quality-gates, build-linux\]/g)?.length, 2);
	assert.equal(w.match(/fail_on_unmatched_files: true/g)?.length, 3);
});
