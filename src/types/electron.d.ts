// Electron環境ではFileオブジェクトにpathプロパティが追加される
interface File {
	readonly path: string;
}

interface ElectronAPI {
	selectDicomFiles: () => Promise<string[]>;
	readFile: (filePath: string) => Promise<ArrayBuffer>;
}

interface Window {
	electronAPI: ElectronAPI;
}
