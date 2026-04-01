import { readdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { app, BrowserWindow, dialog, ipcMain, session } from "electron";

let mainWindow: BrowserWindow | null = null;

// セキュリティ: 許可済みファイルパスのホワイトリスト
// ダイアログ選択 or テスト用ディレクトリからのファイルのみ読み込み許可
const allowedPaths = new Set<string>();

const createWindow = () => {
	mainWindow = new BrowserWindow({
		width: 1400,
		height: 900,
		minWidth: 800,
		minHeight: 600,
		backgroundColor: "#0a0a0a",
		webPreferences: {
			preload: join(__dirname, "preload.js"),
			nodeIntegration: false,
			contextIsolation: true,
		},
	});

	// CSPを動的設定 — dev環境のみunsafe-eval許可（Vite HMR用）
	const isDev = !!process.env.VITE_DEV_SERVER_URL;
	const scriptSrc = isDev
		? "script-src 'self' 'unsafe-eval'"
		: "script-src 'self'";
	session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
		callback({
			responseHeaders: {
				...details.responseHeaders,
				"Content-Security-Policy": [
					`default-src 'self'; ${scriptSrc}; style-src 'self' 'unsafe-inline'`,
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

app.whenReady().then(() => {
	createWindow();

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

// DICOMファイル選択ダイアログ
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
	// 選択されたパスをホワイトリストに登録
	for (const filePath of result.filePaths) {
		allowedPaths.add(resolve(filePath));
	}
	return result.filePaths;
});

// ファイル読み込み（ArrayBufferとして返す）
// セキュリティ: ホワイトリストに登録済みのパスのみ許可
ipcMain.handle("read-file", async (_event, filePath: string) => {
	const resolved = resolve(filePath);
	if (!allowedPaths.has(resolved)) {
		throw new Error(`許可されていないファイルパス: ${filePath}`);
	}
	try {
		const buffer = await readFile(resolved);
		return buffer.buffer.slice(
			buffer.byteOffset,
			buffer.byteOffset + buffer.byteLength,
		);
	} catch (err) {
		const message =
			err instanceof Error ? err.message : "不明なファイル読込エラー";
		throw new Error(`ファイル読込失敗 (${filePath}): ${message}`);
	}
});

// スクリーンショット保存
ipcMain.handle("save-screenshot", async (_event, dataUrl: string) => {
	if (!mainWindow) return false;

	const result = await dialog.showSaveDialog(mainWindow, {
		title: "スクリーンショットを保存",
		defaultPath: `roentgen-${Date.now()}.png`,
		filters: [{ name: "PNG", extensions: ["png"] }],
	});

	if (result.canceled || !result.filePath) return false;

	const base64 = dataUrl.replace(/^data:image\/png;base64,/, "");
	await writeFile(result.filePath, Buffer.from(base64, "base64"));
	return true;
});

// dev環境テスト用: dicom-files/配下の全.dcmファイルを読み込む（本番ビルドでは登録しない）
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
