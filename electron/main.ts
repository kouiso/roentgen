import { readdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { app, BrowserWindow, dialog, ipcMain, session } from "electron";

let mainWindow: BrowserWindow | null = null;

const allowedPaths = new Set<string>();

const createWindow = () => {
	mainWindow = new BrowserWindow({
		width: 1400,
		height: 900,
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
	const connectSrc = isDev
		? "connect-src 'self' http://localhost:* ws://localhost:* https://accounts.google.com https://oauth2.googleapis.com https://www.googleapis.com"
		: "connect-src 'self' https://accounts.google.com https://oauth2.googleapis.com https://www.googleapis.com";
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
	createWindow();
	registerGdriveHandlers().catch((err) =>
		console.error("[gdrive] handler registration failed:", err),
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
	for (const filePath of result.filePaths) {
		allowedPaths.add(resolve(filePath));
	}
	return result.filePaths;
});

ipcMain.handle("read-file", async (_event, filePath: string) => {
	const resolved = resolve(filePath);
	if (!allowedPaths.has(resolved)) {
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
			return null;
		}
	});
}
