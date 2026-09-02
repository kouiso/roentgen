#!/usr/bin/env node
import { spawn, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { createServer } from "node:net";

const positiveNumberEnv = (value, fallback) => {
	const parsed = Number(value);
	return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};
const SMOKE_MS = positiveNumberEnv(
	process.env.ROENTGEN_RUNTIME_SMOKE_MS,
	30_000,
);
const WINDOW_READY_MS = positiveNumberEnv(
	process.env.ROENTGEN_RUNTIME_WINDOW_READY_MS,
	20_000,
);
const WINDOW_READY_TEXT = "Window created";
const require = createRequire(import.meta.url);
const WSL_REFUSAL_MESSAGE =
	"Refusing to run ROENTGEN runtime smoke in WSL because Electron/AppImage windows can steal focus. Run runtime smoke on macmini-lan.";

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

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const createLogBuffer = () => {
	const chunks = [];
	const watchers = new Set();
	const text = () => chunks.join("");
	const push = (chunk) => {
		chunks.push(String(chunk));
		const output = text();
		for (const watcher of watchers) watcher(output);
	};
	const waitFor = (needle, timeoutMs) => {
		let resolveWait;
		let timer;
		let settled = false;
		const check = (output) => {
			if (output.includes(needle)) settle(true);
		};
		const settle = (found) => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			watchers.delete(check);
			resolveWait(found);
		};
		const promise = new Promise((resolve) => {
			resolveWait = resolve;
			if (text().includes(needle)) {
				settle(true);
				return;
			}
			watchers.add(check);
			timer = setTimeout(() => settle(false), timeoutMs);
		});
		return { promise, stop: () => settle(false) };
	};
	return { chunks, push, text, waitFor };
};

const waitForHttp = async (url, timeoutMs) => {
	const start = Date.now();
	while (Date.now() - start < timeoutMs) {
		try {
			const response = await fetch(url);
			if (response.ok) return;
		} catch {
			// server still starting
		}
		await sleep(250);
	}
	throw new Error(`Renderer server did not become ready: ${url}`);
};

const hasCommand = (command) =>
	spawnSync("bash", ["-lc", `command -v ${command}`], {
		stdio: "ignore",
	}).status === 0;

const isWsl = () => {
	try {
		return readFileSync("/proc/sys/kernel/osrelease", "utf8")
			.toLowerCase()
			.includes("microsoft");
	} catch {
		return false;
	}
};

const assertElectronDesktopAllowed = () => {
	if (isWsl()) throw new Error(WSL_REFUSAL_MESSAGE);
};

const shouldUseXvfb = () => !process.env.DISPLAY;

const spawnManaged = (command, args, options) =>
	spawn(command, args, {
		...options,
		detached: process.platform !== "win32",
	});

const hasExited = (child) =>
	child.exitCode !== null || child.signalCode !== null;

const signalProcessTree = (child, signal) => {
	if (!child || hasExited(child)) return;
	try {
		if (process.platform === "win32") {
			child.kill(signal);
			return;
		}
		process.kill(-child.pid, signal);
	} catch {
		try {
			child.kill(signal);
		} catch {
			// already stopped
		}
	}
};

const stopProcess = async (child) => {
	if (!child || hasExited(child)) return false;
	signalProcessTree(child, "SIGTERM");
	const exited = await Promise.race([
		new Promise((resolve) => child.once("exit", () => resolve(true))),
		sleep(3000).then(() => false),
	]);
	if (!exited && !hasExited(child)) {
		signalProcessTree(child, "SIGKILL");
		await Promise.race([
			new Promise((resolve) => child.once("exit", resolve)),
			sleep(1000),
		]);
	}
	return true;
};

const run = async () => {
	assertElectronDesktopAllowed();
	if (process.argv.includes("--preflight")) {
		console.log("Roentgen runtime smoke preflight: Electron desktop run allowed");
		return;
	}

	const electronExecutable = require("electron");
	const port = String(await findOpenPort());
	const rendererUrl = `http://127.0.0.1:${port}`;
	const commonEnv = {
		...process.env,
		ELECTRON_RUN_AS_NODE: "",
	};
	const vite = spawnManaged(
		"pnpm",
		[
			"exec",
			"vite",
			"--config",
			"e2e/vite-renderer.config.ts",
			"--host",
			"127.0.0.1",
			"--port",
			port,
			"--strictPort",
		],
		{ env: commonEnv, stdio: ["ignore", "pipe", "pipe"] },
	);
	const viteLog = createLogBuffer();
	vite.stdout.on("data", viteLog.push);
	vite.stderr.on("data", viteLog.push);
	const viteExit = new Promise((resolve) =>
		vite.once("exit", (code, signal) => resolve({ code, signal })),
	);

	let electron;
	try {
		await waitForHttp(rendererUrl, 20_000);
		const electronArgs = [
			"--no-sandbox",
			"--disable-gpu",
			"--disable-dev-shm-usage",
			"dist-electron/main.js",
		];
		const env = {
			...commonEnv,
			NODE_ENV: "development",
			VITE_DEV_SERVER_URL: rendererUrl,
			ROENTGEN_TEST_DICOM_DIR: "public",
		};

		if (shouldUseXvfb() && hasCommand("xvfb-run")) {
			electron = spawnManaged(
				"xvfb-run",
				["-a", electronExecutable, ...electronArgs],
				{
					env,
					stdio: ["ignore", "pipe", "pipe"],
				},
			);
		} else {
			electron = spawnManaged(electronExecutable, electronArgs, {
				env,
				stdio: ["ignore", "pipe", "pipe"],
			});
		}

		const electronLog = createLogBuffer();
		electron.stdout.on("data", electronLog.push);
		electron.stderr.on("data", electronLog.push);

		const electronExit = new Promise((resolve) =>
			electron.once("exit", (code, signal) =>
				resolve({ code, signal, early: true, processName: "electron" }),
			),
		);

		const windowReady = electronLog.waitFor(
			WINDOW_READY_TEXT,
			Math.min(WINDOW_READY_MS, SMOKE_MS),
		);
		const startup = await Promise.race([
			viteExit.then((exit) => ({
				...exit,
				early: true,
				processName: "renderer",
			})),
			electronExit,
			windowReady.promise.then((found) => ({ found })),
		]);

		if (startup.early) {
			windowReady.stop();
			if (startup.processName === "renderer") {
				throw new Error(
					`Roentgen renderer server exited before ${WINDOW_READY_TEXT} (code=${startup.code}, signal=${startup.signal})\n${viteLog.text()}`,
				);
			}
			throw new Error(
				`Roentgen runtime exited before ${WINDOW_READY_TEXT} (code=${startup.code}, signal=${startup.signal})\n${electronLog.text()}`,
			);
		}

		if (!startup.found) {
			throw new Error(
				`Roentgen runtime did not report ${WINDOW_READY_TEXT} within ${Math.min(WINDOW_READY_MS, SMOKE_MS)}ms\n${electronLog.text()}`,
			);
		}

		const earlyExit = await Promise.race([
			viteExit.then((exit) => ({
				...exit,
				early: true,
				processName: "renderer",
			})),
			electronExit,
			sleep(SMOKE_MS).then(() => ({ early: false })),
		]);

		if (earlyExit.early) {
			if (earlyExit.processName === "renderer") {
				throw new Error(
					`Roentgen renderer server exited before ${SMOKE_MS}ms (code=${earlyExit.code}, signal=${earlyExit.signal})\n${viteLog.text()}`,
				);
			}
			throw new Error(
				`Roentgen runtime exited before ${SMOKE_MS}ms (code=${earlyExit.code}, signal=${earlyExit.signal})\n${electronLog.text()}`,
			);
		}

		console.log(
			`Roentgen runtime smoke: PASS (${WINDOW_READY_TEXT}, ${SMOKE_MS}ms alive)`,
		);
	} finally {
		await stopProcess(electron);
		const stoppedVite = await stopProcess(vite);
		if (!stoppedVite && vite.exitCode && vite.exitCode !== 0) {
			console.error(viteLog.text());
		}
	}
};

run().catch((error) => {
	console.error(error);
	process.exit(1);
});
