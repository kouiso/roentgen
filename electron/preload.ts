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
});
