#!/usr/bin/env node
/**
 * ログを残さない素の `vite` 起動。`pnpm dev` (scripts/dev-log.mjs) が壊れたときの逃げ道。
 *
 * シェルに頼らず Node で書いているのは、`unset ELECTRON_RUN_AS_NODE && vite` が
 * Windows の cmd.exe で動かないため (unset が無い)。ここは「dev が壊れたときの
 * 最後の手段」なので、動かない環境があってはならない。
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const env = { ...process.env };
// Claude Code などが立てる ELECTRON_RUN_AS_NODE が残っていると Electron が Node として起動する。
delete env.ELECTRON_RUN_AS_NODE;

// `pnpm dev:raw` 以外 (node で直に叩いた場合) でも動くよう、まず node_modules/.bin を見る。
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const localBin = join(
	repoRoot,
	"node_modules",
	".bin",
	process.platform === "win32" ? "vite.cmd" : "vite",
);
const viteBin = existsSync(localBin) ? localBin : "vite";

const child = spawn(viteBin, process.argv.slice(2), {
	cwd: repoRoot,
	env,
	stdio: "inherit",
	shell: process.platform === "win32",
});

child.on("exit", (code, signal) => {
	process.exitCode = code ?? (signal ? 1 : 0);
});
child.on("error", (error) => {
	process.stderr.write(`failed to start vite: ${error.message}\n`);
	process.exitCode = 1;
});
