import { BrowserWindow, app, dialog, ipcMain } from "electron";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

let mainWindow: BrowserWindow | null = null;

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

	if (process.env.VITE_DEV_SERVER_URL) {
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
	return result.filePaths;
});

// ファイル読み込み（ArrayBufferとして返す）
ipcMain.handle("read-file", async (_event, filePath: string) => {
	try {
		const buffer = await readFile(filePath);
		return buffer.buffer.slice(
			buffer.byteOffset,
			buffer.byteOffset + buffer.byteLength,
		);
	} catch (err) {
		throw new Error(`ファイル読込失敗: ${filePath} - ${err}`);
	}
});

// dev環境テスト用: dicom-files/配下の全.dcmファイルを読み込む（本番ビルドでは登録しない）
if (process.env.VITE_DEV_SERVER_URL) {
ipcMain.handle("load-test-dicom", async () => {
	const dirPath = join(process.cwd(), "dicom-files");
	try {
		const entries = await readdir(dirPath);
		const dcmFiles = entries.filter((f) =>
			f.toLowerCase().endsWith(".dcm"),
		);
		const results: { path: string; data: ArrayBuffer }[] = [];

		for (const fileName of dcmFiles) {
			const filePath = join(dirPath, fileName);
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
