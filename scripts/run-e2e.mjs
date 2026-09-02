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
	const selectedProjects = args.flatMap((arg, index) => {
		if (arg === "--project" && args[index + 1]) return [args[index + 1]];
		if (arg.startsWith("--project=")) return [arg.slice("--project=".length)];
		return [];
	});
	const likelyRunsElectron =
		selectedProjects.includes("electron") ||
		args.some((arg) => arg.includes("e2e/electron/")) ||
		selectedProjects.length === 0;
	const shouldUseXvfb = !isWsl() && likelyRunsElectron && !process.env.DISPLAY;
	if (isWsl() && likelyRunsElectron) {
		throw new Error(WSL_ELECTRON_REFUSAL_MESSAGE);
	}
	if (shouldUseXvfb && !hasCommand("xvfb-run")) {
		throw new Error("xvfb-run is required for Electron desktop tests without DISPLAY.");
	}
	const port = process.env.ROENTGEN_E2E_PORT || String(await findOpenPort());
	console.log(`Roentgen e2e: using renderer port ${port}`);
	const command = shouldUseXvfb ? "xvfb-run" : "pnpm";
	const childArgs = shouldUseXvfb
		? ["-a", "pnpm", "exec", "playwright", "test", ...args]
		: ["exec", "playwright", "test", ...args];
	const child = spawn(command, childArgs, {
		env: {
			...process.env,
			ELECTRON_RUN_AS_NODE: "",
			ROENTGEN_E2E_PORT: port,
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
