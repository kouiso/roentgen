import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("electronAPI", {
	selectDicomFiles: (): Promise<string[]> =>
		ipcRenderer.invoke("select-dicom-files"),
	readFile: (filePath: string): Promise<ArrayBuffer> =>
		ipcRenderer.invoke("read-file", filePath),
	loadTestDicom: (): Promise<{ path: string; data: ArrayBuffer }[] | null> =>
		ipcRenderer.invoke("load-test-dicom"),
	saveScreenshot: (dataUrl: string): Promise<boolean> =>
		ipcRenderer.invoke("save-screenshot", dataUrl),

	// Google Drive DICOM連携
	gdrive: {
		authStatus: (): Promise<{ authenticated: boolean; email?: string }> =>
			ipcRenderer.invoke("gdrive:auth-status"),
		authorize: (): Promise<{
			success: boolean;
			email?: string;
			error?: string;
		}> => ipcRenderer.invoke("gdrive:authorize"),
		logout: (): Promise<{ success: boolean }> =>
			ipcRenderer.invoke("gdrive:logout"),
		listDicom: (
			folderId?: string,
		): Promise<{
			files: {
				id: string;
				name: string;
				size: number;
				modifiedTime: string;
			}[];
			error?: string;
		}> => ipcRenderer.invoke("gdrive:list-dicom", folderId),
		download: (
			fileIds: string[],
		): Promise<{ path: string; data: ArrayBuffer }[]> =>
			ipcRenderer.invoke("gdrive:download", fileIds),
		hasCredentials: (): Promise<boolean> =>
			ipcRenderer.invoke("gdrive:has-credentials"),
		syncToSeed: (): Promise<{
			count: number;
			skipped: number;
			files?: { path: string; data: ArrayBuffer }[];
			error?: string;
		}> => ipcRenderer.invoke("gdrive:sync-to-seed"),
		onDownloadProgress: (
			callback: (progress: { current: number; total: number }) => void,
		): (() => void) => {
			const handler = (
				_event: Electron.IpcRendererEvent,
				progress: { current: number; total: number },
			) => callback(progress);
			ipcRenderer.on("gdrive:download-progress", handler);
			return () =>
				ipcRenderer.removeListener("gdrive:download-progress", handler);
		},
	},
});
