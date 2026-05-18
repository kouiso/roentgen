import { mkdirSync, writeFileSync } from "node:fs";
import {
	lstat,
	mkdir,
	readdir,
	readFile,
	realpath,
	writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join, resolve, sep } from "node:path";
import type * as SentryMain from "@sentry/electron/main";
import {
	app,
	BrowserWindow,
	crashReporter,
	dialog,
	ipcMain,
	session,
} from "electron";
import log from "electron-log/main";
import {
	createPrintImageHtml,
	type PrintImageMetadata,
} from "../src/utils/print-image";
import {
	initSentryIfConsented,
	isCrashReportingEnabled,
	setCrashReportingEnabled,
} from "./sentry";

// ログ初期化 — PII除外のためDICOM患者タグはログしない
log.initialize();
log.transports.file.maxSize = 5 * 1024 * 1024; // 5MB
log.transports.file.format = "[{y}-{m}-{d} {h}:{i}:{s}] [{level}] {text}";

const initMainProcessSentry = async (): Promise<void> => {
	const dsn = process.env.SENTRY_DSN;
	if (!dsn) return;
	const Sentry: typeof SentryMain = await import("@sentry/electron/main");
	Sentry.init({ dsn });
};

let mainWindow: BrowserWindow | null = null;

const allowedPaths = new Set<string>();
const dialogReturnedPaths = new Set<string>();
const resolvedAllowedPathCache = new Map<string, string>();

const registerAllowedPath = (filePath: string) => {
	const resolved = resolve(filePath);
	allowedPaths.add(resolved);
	resolvedAllowedPathCache.delete(resolved);
};

const registerDialogReturnedPath = (filePath: string) => {
	const resolved = resolve(filePath);
	dialogReturnedPaths.add(resolved);
	registerAllowedPath(resolved);
};

const getRecursiveReadAllowedRoots = (): Set<string> =>
	new Set([
		resolve(app.getPath("userData")),
		resolve(tmpdir()),
		...dialogReturnedPaths,
	]);

const getResolvedAllowedPath = async (allowedPath: string): Promise<string> => {
	const resolved = resolve(allowedPath);
	const cached = resolvedAllowedPathCache.get(resolved);
	if (cached) return cached;

	const realAllowed = await realpath(resolved);
	resolvedAllowedPathCache.set(resolved, realAllowed);
	return realAllowed;
};

export const resolveAllowedReadPath = async (
	filePath: string,
	allowedPathEntries: Iterable<string> = allowedPaths,
): Promise<string> => {
	let requestedRealPath: string;
	try {
		requestedRealPath = await realpath(resolve(filePath));
	} catch (err) {
		log.warn(`Blocked missing file access: ${filePath}`, err);
		throw new Error(`ファイルが見つかりません: ${filePath}`);
	}

	for (const allowedPath of allowedPathEntries) {
		const allowedRealPath = await getResolvedAllowedPath(allowedPath);
		if (
			requestedRealPath === allowedRealPath ||
			requestedRealPath.startsWith(`${allowedRealPath}${sep}`)
		) {
			return requestedRealPath;
		}
	}

	log.warn(`Blocked file access: ${filePath}`);
	throw new Error(`許可されていないファイルパス: ${filePath}`);
};

export const isDicomFilePath = (filePath: string): boolean => {
	const extension = extname(filePath).toLowerCase();
	return extension === ".dcm" || extension === ".dicom";
};

export const findDicomFilePathsRecursive = async (
	directoryPath: string,
	allowedPathEntries: Iterable<string> = allowedPaths,
): Promise<string[]> => {
	const rootPath = await resolveAllowedReadPath(
		directoryPath,
		allowedPathEntries,
	);
	const foundPaths: string[] = [];

	const walk = async (currentDirectory: string): Promise<void> => {
		const resolvedDirectory = await resolveAllowedReadPath(
			currentDirectory,
			allowedPathEntries,
		);
		const entries = await readdir(resolvedDirectory, { withFileTypes: true });
		entries.sort((a, b) => a.name.localeCompare(b.name));

		for (const entry of entries) {
			const entryPath = join(resolvedDirectory, entry.name);
			if (entry.isDirectory()) {
				await walk(entryPath);
				continue;
			}
			if (!entry.isFile() || !isDicomFilePath(entry.name)) continue;

			const resolvedFilePath = await resolveAllowedReadPath(
				entryPath,
				allowedPathEntries,
			);
			foundPaths.push(resolvedFilePath);
		}
	};

	await walk(rootPath);
	return foundPaths;
};

export const resolveAllowedRecursiveReadPath = (
	filePath: string,
	allowedPathEntries: Iterable<string> = getRecursiveReadAllowedRoots(),
): Promise<string> => resolveAllowedReadPath(filePath, allowedPathEntries);

const getSeedDirPath = () => {
	if (app.isPackaged) {
		return join(app.getPath("userData"), "dicom-files");
	}
	return join(__dirname, "..", "dicom-files");
};

const DICOM_UID_PATTERN = /^[0-9]+(?:\.[0-9]+)*$/;

const getAnnotationStorageDirPath = () =>
	join(app.getPath("userData"), "annotations");

const getAnnotationStorageFilePath = (studyUid: string) =>
	join(getAnnotationStorageDirPath(), `${studyUid}.json`);

const assertValidStudyUid = (studyUid: string): void => {
	if (!DICOM_UID_PATTERN.test(studyUid)) {
		throw new Error("StudyInstanceUIDが不正です");
	}
};

const isMissingFileError = (err: unknown): boolean =>
	typeof err === "object" &&
	err !== null &&
	"code" in err &&
	err.code === "ENOENT";

const PNG_DATA_URL_PREFIX = "data:image/png;base64,";

const isPngDataUrl = (dataUrl: string): boolean =>
	dataUrl.startsWith(PNG_DATA_URL_PREFIX);

const waitForPrintableDocument = (win: BrowserWindow): Promise<void> =>
	win.webContents
		.executeJavaScript(`
			new Promise((resolve) => {
				if (document.readyState === "complete") {
					resolve(undefined);
					return;
				}
				window.addEventListener("load", () => resolve(undefined), { once: true });
			})
		`)
		.then(() => undefined);

const printHtmlInWindow = (
	html: string,
	parentWindow: BrowserWindow,
): Promise<boolean> =>
	new Promise((resolvePrint) => {
		const printWindow = new BrowserWindow({
			width: 960,
			height: 720,
			show: false,
			parent: parentWindow,
			title: "印刷",
			backgroundColor: "#ffffff",
			webPreferences: {
				contextIsolation: true,
				nodeIntegration: false,
				sandbox: true,
			},
		});
		let settled = false;
		const finish = (success: boolean) => {
			if (settled) return;
			settled = true;
			if (!printWindow.isDestroyed()) {
				printWindow.close();
			}
			resolvePrint(success);
		};

		printWindow.once("closed", () => finish(false));
		printWindow.webContents.once(
			"did-fail-load",
			(_event, errorCode, errorDescription) => {
				log.warn(
					`[print] 印刷ページ読込失敗: ${errorCode} ${errorDescription}`,
				);
				finish(false);
			},
		);
		printWindow.webContents.once("did-finish-load", () => {
			waitForPrintableDocument(printWindow)
				.then(() => {
					if (printWindow.isDestroyed()) {
						finish(false);
						return;
					}
					printWindow.webContents.print(
						{ silent: false, printBackground: true },
						(success, failureReason) => {
							if (!success && failureReason && failureReason !== "cancelled") {
								log.warn(`[print] 印刷失敗: ${failureReason}`);
							}
							finish(success);
						},
					);
				})
				.catch((err: unknown) => {
					log.warn("[print] 印刷ページ準備失敗:", err);
					finish(false);
				});
		});

		printWindow
			.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
			.catch((err: unknown) => {
				log.warn("[print] 印刷ページ読込失敗:", err);
				finish(false);
			});
	});

const startCrashReporter = (): void => {
	try {
		crashReporter.start({
			submitURL: "",
			uploadToServer: isCrashReportingEnabled(),
			companyName: "",
			productName: "Roentgen",
		});
	} catch (err) {
		log.warn("[crashReporter] 起動失敗:", err);
	}
};

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

const saveWindowStateSync = (
	win: BrowserWindow,
	wwwc?: { ww: number; wc: number },
): void => {
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
		mkdirSync(app.getPath("userData"), { recursive: true });
		writeFileSync(WINDOW_STATE_PATH(), JSON.stringify(state, null, 2));
	} catch (err) {
		log.warn("[window-state] 同期保存失敗:", err);
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
			sandbox: true,
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
		if (mainWindow) saveWindowStateSync(mainWindow, lastWwwc);
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
		const seedDirPath = getSeedDirPath();

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
				registerAllowedPath(resolveFn(filePath));
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
	await initMainProcessSentry();
	// Sentry — OPT-IN: only initializes if user previously consented
	await initSentryIfConsented();
	startCrashReporter();

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

app.on("before-quit", () => {
	if (mainWindow) saveWindowStateSync(mainWindow, lastWwwc);
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
		registerDialogReturnedPath(filePath);
	}
	return result.filePaths;
});

ipcMain.handle("select-dicom-directory", async () => {
	if (!mainWindow) return [];
	const result = await dialog.showOpenDialog(mainWindow, {
		title: "DICOMフォルダを選択",
		properties: ["openDirectory", "multiSelections"],
	});
	if (result.canceled) return [];

	const filePaths: string[] = [];
	for (const directoryPath of result.filePaths) {
		registerDialogReturnedPath(directoryPath);
		filePaths.push(...(await findDicomFilePathsRecursive(directoryPath)));
	}
	log.info(
		`Selected ${result.filePaths.length} directories, found ${filePaths.length} DICOM files`,
	);
	return filePaths;
});

ipcMain.handle(
	"read-directory-recursive",
	async (_event, inputPath: string) => {
		const recursiveReadAllowedRoots = getRecursiveReadAllowedRoots();
		const resolvedPath = await resolveAllowedRecursiveReadPath(
			inputPath,
			recursiveReadAllowedRoots,
		);
		const stats = await lstat(resolvedPath);
		if (stats.isDirectory()) {
			return findDicomFilePathsRecursive(
				resolvedPath,
				recursiveReadAllowedRoots,
			);
		}
		if (stats.isFile()) {
			return [resolvedPath];
		}
		return [];
	},
);

ipcMain.handle("read-file", async (_event, filePath: string) => {
	const resolved = await resolveAllowedReadPath(filePath);
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
	if (!isPngDataUrl(dataUrl)) return false;
	const base64 = dataUrl.slice(PNG_DATA_URL_PREFIX.length);
	await writeFile(result.filePath, Buffer.from(base64, "base64"));
	return true;
});

ipcMain.handle(
	"print-image",
	async (
		_event,
		imageDataUrl: string,
		metadata: PrintImageMetadata,
	): Promise<boolean> => {
		if (!mainWindow) return false;
		if (!isPngDataUrl(imageDataUrl)) return false;
		const html = createPrintImageHtml(imageDataUrl, metadata);
		return printHtmlInWindow(html, mainWindow);
	},
);

ipcMain.handle(
	"save-annotations",
	async (_event, studyUid: string, data: unknown): Promise<boolean> => {
		assertValidStudyUid(studyUid);
		await mkdir(getAnnotationStorageDirPath(), { recursive: true });
		await writeFile(
			getAnnotationStorageFilePath(studyUid),
			JSON.stringify(data, null, 2),
			"utf-8",
		);
		return true;
	},
);

ipcMain.handle(
	"load-annotations",
	async (_event, studyUid: string): Promise<unknown | null> => {
		assertValidStudyUid(studyUid);
		try {
			const raw = await readFile(
				getAnnotationStorageFilePath(studyUid),
				"utf-8",
			);
			const parsed: unknown = JSON.parse(raw);
			return parsed;
		} catch (err) {
			if (!isMissingFileError(err)) {
				log.warn(`[annotations] 読込失敗: ${studyUid}`, err);
			}
			return null;
		}
	},
);

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
		const dirPath = getSeedDirPath();
		try {
			const entries = await readdir(dirPath);
			const dcmFiles = entries.filter((f) => f.toLowerCase().endsWith(".dcm"));
			const results: { path: string; data: ArrayBuffer }[] = [];
			for (const fileName of dcmFiles) {
				const filePath = join(dirPath, fileName);
				registerAllowedPath(filePath);
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
