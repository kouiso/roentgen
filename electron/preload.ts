import { contextBridge, ipcRenderer } from "electron";

type PrintImageMetadata = {
	patientName: string;
	studyDate: string;
	modality: string;
	description: string;
};

// Sentry preload — sets up IPC transport for renderer → main event forwarding
import("@sentry/electron/preload")
	.then(({ hookupIpc }) => hookupIpc())
	.catch(() => {
		// @sentry/electron may not be resolvable in all build configurations — safe to ignore
	});

contextBridge.exposeInMainWorld("electronAPI", {
	selectDicomFiles: (): Promise<string[]> =>
		ipcRenderer.invoke("select-dicom-files"),
	selectDicomDirectory: (): Promise<string[]> =>
		ipcRenderer.invoke("select-dicom-directory"),
	readDirectoryRecursive: (directoryPath: string): Promise<string[]> =>
		ipcRenderer.invoke("read-directory-recursive", directoryPath),
	readFile: (filePath: string): Promise<ArrayBuffer> =>
		ipcRenderer.invoke("read-file", filePath),
	onOpenDicomFiles: (callback: (filePaths: string[]) => void): (() => void) => {
		const handler = (_event: Electron.IpcRendererEvent, filePaths: string[]) =>
			callback(filePaths);
		ipcRenderer.on("open-dicom-files", handler);
		return () => ipcRenderer.removeListener("open-dicom-files", handler);
	},
	loadTestDicom: (): Promise<{ path: string; data: ArrayBuffer }[] | null> =>
		ipcRenderer.invoke("load-test-dicom"),
	saveScreenshot: (dataUrl: string): Promise<boolean> =>
		ipcRenderer.invoke("save-screenshot", dataUrl),
	printImage: (
		imageDataUrl: string,
		metadata: PrintImageMetadata,
	): Promise<boolean> =>
		ipcRenderer.invoke("print-image", imageDataUrl, metadata),
	saveAnnotations: (studyUid: string, data: unknown): Promise<boolean> =>
		ipcRenderer.invoke("save-annotations", studyUid, data),
	loadAnnotations: (studyUid: string): Promise<unknown | null> =>
		ipcRenderer.invoke("load-annotations", studyUid),

	// Crash reporter — OPT-IN consent
	crashReporter: {
		getStatus: (): Promise<{ enabled: boolean }> =>
			ipcRenderer.invoke("crash-reporter:get-status"),
		setEnabled: (
			enabled: boolean,
		): Promise<{ enabled: boolean; requiresRestart: boolean }> =>
			ipcRenderer.invoke("crash-reporter:set-enabled", enabled),
	},

	// Window state — WW/WC restore across sessions
	windowState: {
		getWwwc: (): Promise<{ ww: number; wc: number } | undefined> =>
			ipcRenderer.invoke("window-state:get-wwwc"),
		setWwwc: (ww: number, wc: number): Promise<void> =>
			ipcRenderer.invoke("window-state:set-wwwc", ww, wc),
	},

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
