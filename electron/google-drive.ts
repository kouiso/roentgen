// Google Drive DICOM同期モジュール
// OAuth2認証 → Drive検索 → DICOMファイルダウンロードを提供

import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { drive_v3 } from "@googleapis/drive";
import { oauth2_v2 } from "@googleapis/oauth2";
import { app, BrowserWindow } from "electron";
import { OAuth2Client } from "google-auth-library";

// --- 設定 ---

const SCOPES = ["https://www.googleapis.com/auth/drive.readonly"];
const TOKEN_PATH = () => join(app.getPath("userData"), "gdrive-token.json");
const CREDENTIALS_PATH = () =>
	join(app.getPath("userData"), "gdrive-credentials.json");

const DICOM_QUERY = [
	"(title contains '.dcm' or title contains '.DCM' or mimeType = 'application/dicom')",
	"trashed = false",
].join(" and ");

// --- OAuth2 ---

type StoredToken = {
	access_token: string;
	refresh_token: string;
	token_type: string;
	expiry_date: number;
};

type ClientCredentials = {
	installed?: {
		client_id: string;
		client_secret: string;
		redirect_uris: string[];
	};
	web?: {
		client_id: string;
		client_secret: string;
		redirect_uris: string[];
	};
};

const loadCredentials = async (): Promise<ClientCredentials | null> => {
	try {
		const raw = await readFile(CREDENTIALS_PATH(), "utf-8");
		return JSON.parse(raw) as ClientCredentials;
	} catch {
		return null;
	}
};

const createOAuth2Client = (
	credentials: ClientCredentials,
): OAuth2Client | null => {
	const config = credentials.installed ?? credentials.web;
	if (!config) return null;

	return new OAuth2Client(
		config.client_id,
		config.client_secret,
		config.redirect_uris[0] ?? "urn:ietf:wg:oauth:2.0:oob",
	);
};

const loadStoredToken = async (): Promise<StoredToken | null> => {
	try {
		const raw = await readFile(TOKEN_PATH(), "utf-8");
		return JSON.parse(raw) as StoredToken;
	} catch {
		return null;
	}
};

const saveToken = async (token: StoredToken): Promise<void> => {
	const dir = app.getPath("userData");
	await mkdir(dir, { recursive: true });
	await writeFile(TOKEN_PATH(), JSON.stringify(token, null, 2));
};

// --- 認証フロー ---

export const authorize = async (): Promise<{
	success: boolean;
	email?: string;
	error?: string;
}> => {
	const credentials = await loadCredentials();
	if (!credentials) {
		return {
			success: false,
			error: `認証情報ファイルが見つかりません: ${CREDENTIALS_PATH()}。GCPコンソールからOAuth2クライアントIDをダウンロードし、このパスに配置してください。`,
		};
	}

	const client = createOAuth2Client(credentials);
	if (!client) {
		return { success: false, error: "認証情報の形式が不正です" };
	}

	const stored = await loadStoredToken();
	if (stored) {
		client.setCredentials(stored);
		try {
			const oauth2 = new oauth2_v2.Oauth2({ auth: client });
			const { data } = await oauth2.userinfo.get();
			return { success: true, email: data.email ?? undefined };
		} catch {
			// トークン期限切れ — 再認証へ
		}
	}

	try {
		const authUrl = client.generateAuthUrl({
			access_type: "offline",
			scope: SCOPES,
			prompt: "consent",
		});

		const win = new BrowserWindow({
			width: 600,
			height: 700,
			title: "Google Drive 認証",
			autoHideMenuBar: true,
		});

		return new Promise((resolve) => {
			win.webContents.on("will-redirect", async (_event, url) => {
				const parsed = new URL(url);
				const code = parsed.searchParams.get("code");
				if (code) {
					try {
						const { tokens } = await client.getToken(code);
						client.setCredentials(tokens);
						await saveToken(tokens as StoredToken);

						const oauth2 = new oauth2_v2.Oauth2({ auth: client });
						const { data } = await oauth2.userinfo.get();
						win.close();
						resolve({
							success: true,
							email: data.email ?? undefined,
						});
					} catch (err) {
						win.close();
						resolve({
							success: false,
							error:
								err instanceof Error ? err.message : "認証トークン取得失敗",
						});
					}
				}
			});

			win.on("closed", () => {
				resolve({ success: false, error: "認証がキャンセルされました" });
			});

			win.loadURL(authUrl);
		});
	} catch (err) {
		return {
			success: false,
			error:
				err instanceof Error ? err.message : "認証フロー開始に失敗しました",
		};
	}
};

// --- Drive操作 ---

const getAuthedClient = async (): Promise<OAuth2Client | null> => {
	const credentials = await loadCredentials();
	if (!credentials) return null;

	const client = createOAuth2Client(credentials);
	if (!client) return null;

	const stored = await loadStoredToken();
	if (!stored) return null;

	client.setCredentials(stored);
	return client;
};

export type DriveFileInfo = {
	id: string;
	name: string;
	size: number;
	modifiedTime: string;
	parentName?: string;
};

export const listDicomFiles = async (
	folderId?: string,
): Promise<{ files: DriveFileInfo[]; error?: string }> => {
	const client = await getAuthedClient();
	if (!client) {
		return { files: [], error: "未認証。先にGoogle Drive認証を行ってください" };
	}

	const drive = new drive_v3.Drive({ auth: client });

	try {
		// C2: folderId検証 — Drive resource IDフォーマットのみ許可
		if (folderId && !/^[a-zA-Z0-9_-]+$/.test(folderId)) {
			return { files: [], error: "不正なフォルダID形式です" };
		}
		const query = folderId
			? `${DICOM_QUERY} and '${folderId}' in parents`
			: DICOM_QUERY;

		const res = await drive.files.list({
			q: query,
			fields: "files(id, name, size, modifiedTime, parents)",
			pageSize: 100,
			orderBy: "modifiedTime desc",
		});

		const files: DriveFileInfo[] = (res.data.files ?? []).map((f) => ({
			id: f.id ?? "",
			name: f.name ?? "",
			size: Number(f.size ?? 0),
			modifiedTime: f.modifiedTime ?? "",
		}));

		return { files };
	} catch (err) {
		return {
			files: [],
			error:
				err instanceof Error ? err.message : "DICOMファイル一覧の取得に失敗",
		};
	}
};

export const downloadFile = async (
	fileId: string,
): Promise<{ data: ArrayBuffer; error?: string }> => {
	const client = await getAuthedClient();
	if (!client) {
		return { data: new ArrayBuffer(0), error: "未認証" };
	}

	const drive = new drive_v3.Drive({ auth: client });

	try {
		const res = await drive.files.get(
			{ fileId, alt: "media" },
			{ responseType: "arraybuffer" },
		);
		// C1: レスポンスデータのランタイム型チェック
		if (!(res.data instanceof ArrayBuffer)) {
			return {
				data: new ArrayBuffer(0),
				error: "レスポンスがArrayBufferではありません",
			};
		}
		return { data: res.data };
	} catch (err) {
		return {
			data: new ArrayBuffer(0),
			error:
				err instanceof Error
					? err.message
					: "ファイルダウンロードに失敗しました",
		};
	}
};

export const downloadDicomFiles = async (
	fileIds: string[],
	onProgress?: (current: number, total: number) => void,
): Promise<{ path: string; data: ArrayBuffer }[]> => {
	// H5: clientをループ外で取得
	const client = await getAuthedClient();
	if (!client) return [];

	const drive = new drive_v3.Drive({ auth: client });
	const results: { path: string; data: ArrayBuffer }[] = [];

	for (let i = 0; i < fileIds.length; i++) {
		onProgress?.(i + 1, fileIds.length);

		try {
			const meta = await drive.files.get({
				fileId: fileIds[i],
				fields: "name",
			});
			const name = meta.data.name ?? `${fileIds[i]}.dcm`;

			const res = await drive.files.get(
				{ fileId: fileIds[i], alt: "media" },
				{ responseType: "arraybuffer" },
			);

			// C1: ランタイム型チェック
			if (!(res.data instanceof ArrayBuffer)) continue;

			results.push({
				path: `gdrive://${name}`,
				data: res.data,
			});
		} catch (err) {
			console.error(
				`[gdrive] ダウンロード失敗: ${fileIds[i]}`,
				err instanceof Error ? err.message : err,
			);
		}
	}

	return results;
};

export const getAuthStatus = async (): Promise<{
	authenticated: boolean;
	email?: string;
}> => {
	const client = await getAuthedClient();
	if (!client) return { authenticated: false };

	try {
		const oauth2 = new oauth2_v2.Oauth2({ auth: client });
		const { data } = await oauth2.userinfo.get();
		return { authenticated: true, email: data.email ?? undefined };
	} catch {
		return { authenticated: false };
	}
};

export const logout = async (): Promise<void> => {
	try {
		await unlink(TOKEN_PATH());
	} catch {
		// ファイルが存在しなければ無視
	}
};
