// Google Drive DICOM連携フック
import { useCallback, useEffect, useState } from "react";

type GDriveState = {
	status: "idle" | "checking" | "authenticated" | "unauthenticated";
	email?: string;
	error?: string;
};

type GDriveSyncState = {
	status: "idle" | "listing" | "downloading";
	progress?: { current: number; total: number };
	fileCount?: number;
};

export const useGoogleDrive = (
	onFilesLoaded: (files: { path: string; data: ArrayBuffer }[]) => void,
) => {
	const [auth, setAuth] = useState<GDriveState>({ status: "idle" });
	const [sync, setSync] = useState<GDriveSyncState>({ status: "idle" });

	const gdrive = window.electronAPI?.gdrive;

	// 起動時に認証状態チェック
	useEffect(() => {
		if (!gdrive) return;

		setAuth({ status: "checking" });
		gdrive
			.authStatus()
			.then((result) => {
				if (result.authenticated) {
					setAuth({
						status: "authenticated",
						email: result.email,
					});
				} else {
					setAuth({ status: "unauthenticated" });
				}
			})
			.catch(() => {
				setAuth({ status: "unauthenticated" });
			});
	}, [gdrive]);

	// C3修正: ダウンロード進捗リスナー（クリーンアップ付き）
	useEffect(() => {
		if (!gdrive) return;
		const cleanup = gdrive.onDownloadProgress((progress) => {
			setSync((prev) => ({ ...prev, progress }));
		});
		return cleanup;
	}, [gdrive]);

	const login = useCallback(async () => {
		if (!gdrive) return;

		setAuth({ status: "checking" });
		const result = await gdrive.authorize();
		if (result.success) {
			setAuth({ status: "authenticated", email: result.email });
		} else {
			setAuth({
				status: "unauthenticated",
				error: result.error,
			});
		}
	}, [gdrive]);

	const logoutAction = useCallback(async () => {
		if (!gdrive) return;
		await gdrive.logout();
		setAuth({ status: "unauthenticated" });
	}, [gdrive]);

	// H7修正: download呼び出しにtry-catch追加
	const syncFiles = useCallback(async () => {
		if (!gdrive) return;

		setSync({ status: "listing" });

		try {
			const { files, error } = await gdrive.listDicom();
			if (error) {
				setSync({ status: "idle" });
				setAuth((prev) => ({ ...prev, error }));
				return;
			}

			if (files.length === 0) {
				setSync({ status: "idle", fileCount: 0 });
				return;
			}

			setSync({ status: "downloading", fileCount: files.length });

			const fileIds = files.map((f) => f.id);
			const downloaded = await gdrive.download(fileIds);

			if (downloaded.length > 0) {
				onFilesLoaded(downloaded);
			}

			setSync({ status: "idle", fileCount: downloaded.length });
		} catch (err) {
			console.error("[gdrive sync]", err);
			setSync({ status: "idle" });
			setAuth((prev) => ({
				...prev,
				error:
					err instanceof Error ? err.message : "同期中にエラーが発生しました",
			}));
		}
	}, [gdrive, onFilesLoaded]);

	return {
		auth,
		sync,
		login,
		logout: logoutAction,
		syncFiles,
		available: !!gdrive,
	};
};
