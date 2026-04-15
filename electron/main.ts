import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { app, BrowserWindow, dialog, ipcMain, session } from "electron";
import log from "electron-log/main";
import {
	initSentryIfConsented,
	isCrashReportingEnabled,
	setCrashReportingEnabled,
} from "./sentry";

// ログ初期化 — PII除外のためDICOM患者タグはログしない
log.initialize();
log.transports.file.maxSize = 5 * 1024 * 1024; // 5MB
log.transports.file.format = "[{y}-{m}-{d} {h}:{i}:{s}] [{level}] {text}";

let mainWindow: BrowserWindow | null = null;

const allowedPaths = new Set<string>();

// --- ウィンドウ状態の永続化 ---

type WindowState = {
	width: number;
	height: number;
	x?: number;
	y?: number;
	wwwc?: { ww: number; wc: number };
};

const WINDOW_STATE_PATH = () =>
	join(app.getPath("userData"), "window-state.json");

const DEFAULT_WINDOW_STATE: WindowState = { width: 1400, height: 900 };

const loadWindowState = async (): Promise<WindowState> => {
	try {
		const raw = await readFile(WINDOW_STATE_PATH(), "utf-8");
		const parsed = JSON.parse(raw) as Partial<WindowState>;
		return {
			width: Math.max(800, parsed.width ?? DEFAULT_WINDOW_STATE.width),
			height: Math.max(600, parsed.height ?? DEFAULT_WINDOW_STATE.height),
			x: parsed.x,
			y: parsed.y,
			wwwc: parsed.wwwc,
		};
	} catch {
		return DEFAULT_WINDOW_STATE;
	}
};

const saveWindowState = async (
	win: BrowserWindow,
	wwwc?: { ww: number; wc: number },
): Promise<void> => {
	if (win.isMinimized() || win.isMaximized() || win.isFullScreen()) return;
	const bounds = win.getBounds();
	const state: WindowState = {
		width: bounds.width,
		height: bounds.height,
		x: bounds.x,
		y: bounds.y,
		wwwc,
	};
	try {
		await mkdir(app.getPath("userData"), { recursive: true });
		await writeFile(WINDOW_STATE_PATH(), JSON.stringify(state, null, 2));
	} catch (err) {
		log.warn("[window-state] 保存失敗:", err);
	}
};

// --- ウィンドウ作成 ---

let lastWwwc: { ww: number; wc: number } | undefined;

const createWindow = async () => {
	const state = await loadWindowState();
	lastWwwc = state.wwwc;

	mainWindow = new BrowserWindow({
		width: state.width,
		height: state.height,
		...(state.x !== undefined && state.y !== undefined
			? { x: state.x, y: state.y }
			: {}),
		minWidth: 800,
		minHeight: 600,
		backgroundColor: "#09090b",
		webPreferences: {
			preload: join(__dirname, "preload.js"),
			nodeIntegration: false,
			contextIsolation: true,
		},
	});

	const isDev = !!process.env.VITE_DEV_SERVER_URL;
	const scriptSrc = isDev
		? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
		: "script-src 'self'";
	const sentrySrc = isCrashReportingEnabled()
		? " https://*.ingest.sentry.io"
		: "";
	const connectSrc = isDev
		? `connect-src 'self' http://localhost:* ws://localhost:* https://accounts.google.com https://oauth2.googleapis.com https://www.googleapis.com${sentrySrc}`
		: `connect-src 'self' https://accounts.google.com https://oauth2.googleapis.com https://www.googleapis.com${sentrySrc}`;
	session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
		callback({
			responseHeaders: {
				...details.responseHeaders,
				"Content-Security-Policy": [
					`default-src 'self'; ${scriptSrc}; style-src 'self' 'unsafe-inline'; ${connectSrc}`,
				],
			},
		});
	});

	mainWindow.on("close", () => {
		if (mainWindow) saveWindowState(mainWindow, lastWwwc);
	});

	if (isDev) {
		mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
		mainWindow.webContents.openDevTools({ mode: "bottom" });
	} else {
		mainWindow.loadFile(join(__dirname, "../dist/index.html"));
	}
};

// Google Drive — 遅延読込でIPC登録
const registerGdriveHandlers = async () => {
	const gdrive = await import("./google-drive");

	ipcMain.handle("gdrive:auth-status", () => gdrive.getAuthStatus());
	ipcMain.handle("gdrive:authorize", () => gdrive.authorize());
	ipcMain.handle("gdrive:logout", async () => {
		await gdrive.logout();
		return { success: true };
	});
	ipcMain.handle("gdrive:list-dicom", (_e, folderId?: string) =>
		gdrive.listDicomFiles(folderId),
	);
	ipcMain.handle("gdrive:download", (_e, fileIds: string[]) =>
		gdrive.downloadDicomFiles(fileIds, (current, total) => {
			mainWindow?.webContents.send("gdrive:download-progress", {
				current,
				total,
			});
		}),
	);

	ipcMain.handle("gdrive:has-credentials", () => gdrive.hasCredentials());

	ipcMain.handle("gdrive:sync-to-seed", async () => {
		const seedDirPath = join(process.cwd(), "dicom-files");

		const result = await gdrive.syncToSeedDir(seedDirPath, (current, total) => {
			mainWindow?.webContents.send("gdrive:download-progress", {
				current,
				total,
			});
		});

		if (result.error) {
			return result;
		}

		// シードディレクトリから再読込（load-test-dicomと同ロジック）
		try {
			const { readdir: readdirFn, readFile: readFileFn } = await import(
				"node:fs/promises"
			);
			const { resolve: resolveFn } = await import("node:path");

			const entries = await readdirFn(seedDirPath);
			const dcmFiles = entries.filter((f: string) =>
				f.toLowerCase().endsWith(".dcm"),
			);
			const files: { path: string; data: ArrayBuffer }[] = [];

			for (const fileName of dcmFiles) {
				const filePath = join(seedDirPath, fileName);
				allowedPaths.add(resolveFn(filePath));
				const buffer = await readFileFn(filePath);
				files.push({
					path: filePath,
					data: buffer.buffer.slice(
						buffer.byteOffset,
						buffer.byteOffset + buffer.byteLength,
					),
				});
			}

			return { ...result, files };
		} catch (err) {
			return {
				...result,
				error:
					err instanceof Error ? err.message : "シードディレクトリ再読込失敗",
			};
		}
	});
};

app.whenReady().then(async () => {
	// Sentry — OPT-IN: only initializes if user previously consented
	await initSentryIfConsented();

	await createWindow();
	log.info("Window created");
	registerGdriveHandlers().catch((err) =>
		log.error("[gdrive] handler registration failed:", err),
	);

	app.on("activate", () => {
		if (BrowserWindow.getAllWindows().length === 0) {
			createWindow();
		}
	});
});

app.on("window-all-closed", () => {
	if (process.platform !== "darwin") {
		app.quit();
	}
});

ipcMain.handle("select-dicom-files", async () => {
	if (!mainWindow) return [];
	const result = await dialog.showOpenDialog(mainWindow, {
		title: "DICOMファイルを選択",
		filters: [
			{ name: "DICOM", extensions: ["dcm", "DCM", "dicom", "DICOM"] },
			{ name: "すべてのファイル", extensions: ["*"] },
		],
		properties: ["openFile", "multiSelections"],
	});
	if (result.canceled) return [];
	log.info(`Selected ${result.filePaths.length} files`);
	for (const filePath of result.filePaths) {
		allowedPaths.add(resolve(filePath));
	}
	return result.filePaths;
});

ipcMain.handle("read-file", async (_event, filePath: string) => {
	const resolved = resolve(filePath);
	if (!allowedPaths.has(resolved)) {
		log.warn(`Blocked file access: ${filePath}`);
		throw new Error(`許可されていないファイルパス: ${filePath}`);
	}
	const buffer = await readFile(resolved);
	return buffer.buffer.slice(
		buffer.byteOffset,
		buffer.byteOffset + buffer.byteLength,
	);
});

ipcMain.handle("save-screenshot", async (_event, dataUrl: string) => {
	if (!mainWindow) return false;
	const result = await dialog.showSaveDialog(mainWindow, {
		title: "スクリーンショットを保存",
		defaultPath: `roentgen-${Date.now()}.png`,
		filters: [{ name: "PNG", extensions: ["png"] }],
	});
	if (result.canceled || !result.filePath) return false;
	if (!dataUrl.startsWith("data:image/png;base64,")) return false;
	const base64 = dataUrl.slice("data:image/png;base64,".length);
	await writeFile(result.filePath, Buffer.from(base64, "base64"));
	return true;
});

// Crash reporter — OPT-IN consent toggle
ipcMain.handle("crash-reporter:get-status", () => ({
	enabled: isCrashReportingEnabled(),
}));

ipcMain.handle("crash-reporter:set-enabled", (_event, enabled: boolean) =>
	setCrashReportingEnabled(enabled),
);

// Window state — WW/WC persistence
ipcMain.handle("window-state:get-wwwc", () => lastWwwc);

ipcMain.handle("window-state:set-wwwc", (_event, ww: number, wc: number) => {
	lastWwwc = { ww, wc };
	if (mainWindow) saveWindowState(mainWindow, lastWwwc);
});

if (process.env.VITE_DEV_SERVER_URL) {
	ipcMain.handle("load-test-dicom", async () => {
		const dirPath = join(process.cwd(), "dicom-files");
		try {
			const entries = await readdir(dirPath);
			const dcmFiles = entries.filter((f) => f.toLowerCase().endsWith(".dcm"));
			const results: { path: string; data: ArrayBuffer }[] = [];
			for (const fileName of dcmFiles) {
				const filePath = join(dirPath, fileName);
				allowedPaths.add(resolve(filePath));
				const buffer = await readFile(filePath);
				results.push({
					path: filePath,
					data: buffer.buffer.slice(
						buffer.byteOffset,
						buffer.byteOffset + buffer.byteLength,
					),
				});
			}
			return results.length > 0 ? results : null;
		} catch {
			log.warn("No test DICOM files found");
			return null;
		}
	});
}
