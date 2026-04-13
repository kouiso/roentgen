// Electron環境ではFileオブジェクトにpathプロパティが追加される
interface File {
	readonly path: string;
}

type GDriveFileInfo = {
	id: string;
	name: string;
	size: number;
	modifiedTime: string;
};

interface ElectronAPI {
	selectDicomFiles: () => Promise<string[]>;
	readFile: (filePath: string) => Promise<ArrayBuffer>;
	loadTestDicom?: () => Promise<{ path: string; data: ArrayBuffer }[] | null>;
	saveScreenshot: (dataUrl: string) => Promise<boolean>;

	gdrive: {
		authStatus: () => Promise<{ authenticated: boolean; email?: string }>;
		authorize: () => Promise<{
			success: boolean;
			email?: string;
			error?: string;
		}>;
		logout: () => Promise<{ success: boolean }>;
		listDicom: (folderId?: string) => Promise<{
			files: GDriveFileInfo[];
			error?: string;
		}>;
		download: (
			fileIds: string[],
		) => Promise<{ path: string; data: ArrayBuffer }[]>;
		onDownloadProgress: (
			callback: (progress: { current: number; total: number }) => void,
		) => () => void;
	};
}

interface Window {
	electronAPI?: ElectronAPI;
}
