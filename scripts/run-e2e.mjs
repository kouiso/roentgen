#!/usr/bin/env node
import { spawn, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createServer } from "node:net";

const findOpenPort = () =>
	new Promise((resolve, reject) => {
		const server = createServer();
		server.once("error", reject);
		server.listen(0, "127.0.0.1", () => {
			const address = server.address();
			if (!address || typeof address === "string") {
				server.close(() => reject(new Error("Could not allocate TCP port")));
				return;
			}
			const { port } = address;
			server.close(() => resolve(port));
		});
	});

const isWsl = () => {
	try {
		return readFileSync("/proc/sys/kernel/osrelease", "utf8")
			.toLowerCase()
			.includes("microsoft");
	} catch {
		return false;
	}
};

const hasCommand = (command) =>
	spawnSync("bash", ["-lc", `command -v ${command}`], {
		stdio: "ignore",
	}).status === 0;

const WSL_ELECTRON_REFUSAL_MESSAGE =
	"Refusing to run ROENTGEN Electron desktop tests in WSL because Electron windows can steal focus. Run Electron GUI/e2e on macmini-lan; WSL is limited to renderer headless E2E.";

const run = async () => {
	const args = process.argv.slice(2);
	if (args[0] === "--") args.shift();
	// --project は複数値・globパターン（例: --project renderer electron / --project 'e*'）
	// を受け付けるため、次のフラグまでの全トークンを拾う。glob側は "electron" に一致するか
	// 判定できないので、判定不能なら安全側（Electronが走る可能性あり）に倒す。
	const selectedProjects = [];
	for (let i = 0; i < args.length; i++) {
		const arg = args[i];
		if (arg === "--project") {
			for (let j = i + 1; j < args.length && !args[j].startsWith("--"); j++) {
				selectedProjects.push(args[j]);
			}
		} else if (arg.startsWith("--project=")) {
			selectedProjects.push(arg.slice("--project=".length));
		}
	}
	const mayMatchElectron = (project) =>
		project === "electron" || /[*?]/.test(project);
	const likelyRunsElectron =
		selectedProjects.some(mayMatchElectron) ||
		args.some((arg) => arg.includes("e2e/electron/")) ||
		selectedProjects.length === 0;
	const shouldUseXvfb =
		process.platform === "linux" &&
		!isWsl() &&
		likelyRunsElectron &&
		!process.env.DISPLAY;
	if (isWsl() && likelyRunsElectron) {
		throw new Error(WSL_ELECTRON_REFUSAL_MESSAGE);
	}
	if (shouldUseXvfb && !hasCommand("xvfb-run")) {
		throw new Error("xvfb-run is required for Electron desktop tests without DISPLAY.");
	}
	const port =
		process.env.PLAYWRIGHT_RENDERER_PORT || String(await findOpenPort());
	console.log(`Roentgen e2e: using renderer port ${port}`);
	const command = shouldUseXvfb ? "xvfb-run" : "pnpm";
	const childArgs = shouldUseXvfb
		? ["-a", "pnpm", "exec", "playwright", "test", ...args]
		: ["exec", "playwright", "test", ...args];
	const child = spawn(command, childArgs, {
		env: {
			...process.env,
			ELECTRON_RUN_AS_NODE: "",
			PLAYWRIGHT_RENDERER_PORT: port,
		},
		shell: process.platform === "win32",
		stdio: "inherit",
	});

	child.on("exit", (code, signal) => {
		if (signal) {
			process.kill(process.pid, signal);
			return;
		}
		process.exit(code ?? 1);
	});
};

run().catch((error) => {
	console.error(error);
	process.exit(1);
});
