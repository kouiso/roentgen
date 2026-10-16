import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

export function electronCommand(platform, environment) {
	const command = ["pnpm", "test:e2e", "--", "--project=electron"];
	// なぜ: 既存 wrapper の WSL 拒否と環境初期化を通し Linux の画面条件も固定する。
	return platform === "linux" && !environment.DISPLAY
		? [
				"xvfb-run",
				"--auto-servernum",
				"--server-args=-screen 0 1280x720x24",
				...command,
			]
		: command;
}
export function commandPlan(
	profile,
	platform = process.platform,
	environment = process.env,
) {
	const checks = {
		lint: ["pnpm", "lint"],
		typecheck: ["pnpm", "exec", "tsc", "--noEmit"],
		test: ["pnpm", "test"],
		build: ["pnpm", "build"],
		renderer: ["pnpm", "test:e2e", "--", "--project=renderer"],
		electron: electronCommand(platform, environment),
	};
	const quality = ["lint", "typecheck", "test"];
	const profiles = {
		quality,
		fast: [...quality, "build"],
		full: [...quality, "build", "renderer", "electron"],
	};
	const selected = profiles[profile] ?? (checks[profile] ? [profile] : null);
	if (!selected) return null;
	return selected.map((phase) => checks[phase]);
}
function run(profile) {
	const selected = commandPlan(profile);
	if (!selected) {
		console.error("Unknown CI phase");
		process.exit(2);
	}
	for (const [command, ...args] of selected) {
		const result = spawnSync(command, args, {
			stdio: "inherit",
			shell: process.platform === "win32",
		});
		if (result.error) console.error(result.error.message);
		if (result.status !== 0) process.exit(result.status ?? 1);
	}
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
	run(process.argv[2]);
