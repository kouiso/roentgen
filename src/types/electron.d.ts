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

	windowState: {
		getWwwc: () => Promise<{ ww: number; wc: number } | undefined>;
		setWwwc: (ww: number, wc: number) => Promise<void>;
	};

	crashReporter: {
		getStatus: () => Promise<{ enabled: boolean }>;
		setEnabled: (
			enabled: boolean,
		) => Promise<{ enabled: boolean; requiresRestart: boolean }>;
	};

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
		hasCredentials: () => Promise<boolean>;
		syncToSeed: () => Promise<{
			count: number;
			skipped: number;
			files?: { path: string; data: ArrayBuffer }[];
			error?: string;
		}>;
		onDownloadProgress: (
			callback: (progress: { current: number; total: number }) => void,
		) => () => void;
	};
}

interface Window {
	electronAPI?: ElectronAPI;
}
