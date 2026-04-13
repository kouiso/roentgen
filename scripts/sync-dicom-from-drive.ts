#!/usr/bin/env npx tsx
/**
 * sync-dicom-from-drive.ts
 *
 * Standalone CLI script to sync DICOM files from Google Drive to dicom-files/.
 *
 * Usage:
 *   npx tsx scripts/sync-dicom-from-drive.ts [--folder-id <id>] [--all]
 *
 * Flags:
 *   --folder-id <id>   Search only within the specified Drive folder
 *   --all              Search entire Drive for .dcm files (default when no folder-id)
 *
 * Auth:
 *   Credentials: ~/Library/Application Support/roentgen/gdrive-credentials.json
 *   Tokens:      ~/Library/Application Support/roentgen/gdrive-token.json
 */

import { createWriteStream, existsSync } from "node:fs";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import * as readline from "node:readline";
import { pipeline } from "node:stream/promises";
import { drive_v3 } from "@googleapis/drive";
import { OAuth2Client } from "google-auth-library";

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

const USER_DATA_DIR = path.join(
	os.homedir(),
	"Library",
	"Application Support",
	"roentgen",
);
const CREDENTIALS_PATH = path.join(USER_DATA_DIR, "gdrive-credentials.json");
const TOKEN_PATH = path.join(USER_DATA_DIR, "gdrive-token.json");
const DICOM_OUTPUT_DIR = path.join(
	path.dirname(new URL(import.meta.url).pathname),
	"..",
	"dicom-files",
);

const SCOPES = ["https://www.googleapis.com/auth/drive.readonly"];

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type StoredToken = {
	access_token: string;
	refresh_token?: string;
	token_type?: string;
	expiry_date?: number;
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

// ---------------------------------------------------------------------------
// OAuth2 helpers
// ---------------------------------------------------------------------------

const loadCredentials = async (): Promise<ClientCredentials> => {
	let raw: string;
	try {
		raw = await readFile(CREDENTIALS_PATH, "utf-8");
	} catch {
		throw new Error(
			`認証情報ファイルが見つかりません: ${CREDENTIALS_PATH}\n` +
				"GCPコンソールからOAuth2クライアントIDをダウンロードし、このパスに配置してください。",
		);
	}
	return JSON.parse(raw) as ClientCredentials;
};

const createOAuth2Client = (credentials: ClientCredentials): OAuth2Client => {
	const config = credentials.installed ?? credentials.web;
	if (!config) {
		throw new Error("認証情報の形式が不正です (installed / web キーが存在しない)");
	}
	return new OAuth2Client(
		config.client_id,
		config.client_secret,
		config.redirect_uris[0] ?? "urn:ietf:wg:oauth:2.0:oob",
	);
};

const loadStoredToken = async (): Promise<StoredToken | null> => {
	try {
		const raw = await readFile(TOKEN_PATH, "utf-8");
		return JSON.parse(raw) as StoredToken;
	} catch {
		return null;
	}
};

const saveToken = async (token: StoredToken): Promise<void> => {
	await mkdir(USER_DATA_DIR, { recursive: true });
	await writeFile(TOKEN_PATH, JSON.stringify(token, null, 2));
};

const promptLine = (question: string): Promise<string> => {
	const rl = readline.createInterface({
		input: process.stdin,
		output: process.stdout,
	});
	return new Promise((resolve) => {
		rl.question(question, (answer) => {
			rl.close();
			resolve(answer.trim());
		});
	});
};

/**
 * Returns an authenticated OAuth2Client.
 * If no stored token exists, initiates the OAuth2 authorization code flow via CLI.
 */
const getAuthedClient = async (): Promise<OAuth2Client> => {
	const credentials = await loadCredentials();
	const client = createOAuth2Client(credentials);

	const stored = await loadStoredToken();
	if (stored) {
		client.setCredentials(stored);
		// Attempt a lightweight token refresh to validate
		try {
			await client.getAccessToken();
			return client;
		} catch {
			// Token is invalid / expired — fall through to re-auth
			console.log("保存済みトークンの検証に失敗。再認証します。");
		}
	}

	// --- Authorization code flow (CLI) ---
	const authUrl = client.generateAuthUrl({
		access_type: "offline",
		scope: SCOPES,
		prompt: "consent",
	});

	console.log("\n以下のURLをブラウザで開き、Googleアカウントで認証してください:\n");
	console.log(`  ${authUrl}\n`);

	const code = await promptLine("認証コードを入力してください: ");
	if (!code) {
		throw new Error("認証コードが入力されませんでした");
	}

	const { tokens } = await client.getToken(code);
	client.setCredentials(tokens);
	await saveToken(tokens as StoredToken);
	console.log("認証成功。トークンを保存しました。\n");

	return client;
};

// ---------------------------------------------------------------------------
// Drive helpers
// ---------------------------------------------------------------------------

const DICOM_QUERY_BASE = [
	"(name contains '.dcm' or name contains '.DCM' or mimeType = 'application/dicom')",
	"trashed = false",
].join(" and ");

type DriveFileInfo = {
	id: string;
	name: string;
	size: number;
};

const listDicomFiles = async (
	drive: drive_v3.Drive,
	folderId?: string,
): Promise<DriveFileInfo[]> => {
	const query = folderId
		? `${DICOM_QUERY_BASE} and '${folderId}' in parents`
		: DICOM_QUERY_BASE;

	const files: DriveFileInfo[] = [];
	let pageToken: string | undefined;

	do {
		const res = await drive.files.list({
			q: query,
			fields: "nextPageToken, files(id, name, size)",
			pageSize: 100,
			...(pageToken ? { pageToken } : {}),
		});

		for (const f of res.data.files ?? []) {
			if (f.id && f.name) {
				files.push({
					id: f.id,
					name: f.name,
					size: Number(f.size ?? 0),
				});
			}
		}

		pageToken = res.data.nextPageToken ?? undefined;
	} while (pageToken);

	return files;
};

// ---------------------------------------------------------------------------
// Skip logic
// ---------------------------------------------------------------------------

const shouldSkip = async (
	localPath: string,
	remoteSize: number,
): Promise<boolean> => {
	if (!existsSync(localPath)) return false;
	const s = await stat(localPath);
	return s.size === remoteSize;
};

// ---------------------------------------------------------------------------
// Download
// ---------------------------------------------------------------------------

const downloadFile = async (
	drive: drive_v3.Drive,
	fileId: string,
	destPath: string,
): Promise<void> => {
	const res = await drive.files.get(
		{ fileId, alt: "media" },
		{ responseType: "stream" },
	);
	const ws = createWriteStream(destPath);
	// res.data is a readable stream when responseType is "stream"
	await pipeline(res.data as NodeJS.ReadableStream, ws);
};

// ---------------------------------------------------------------------------
// Progress reporter
// ---------------------------------------------------------------------------

const reportProgress = (
	current: number,
	total: number,
	fileName: string,
	status: "downloading" | "skipped" | "done" | "error",
): void => {
	const pct = total > 0 ? Math.round((current / total) * 100) : 0;
	const pad = String(total).length;
	const tag =
		status === "downloading"
			? "↓"
			: status === "skipped"
				? "–"
				: status === "done"
					? "✓"
					: "✗";
	console.log(
		`[${String(current).padStart(pad)}/${total}] ${tag} ${fileName} (${pct}%)`,
	);
};

// ---------------------------------------------------------------------------
// CLI arg parsing
// ---------------------------------------------------------------------------

type CliArgs = {
	folderId?: string;
	all: boolean;
};

const parseArgs = (): CliArgs => {
	const args = process.argv.slice(2);
	let folderId: string | undefined;
	let all = false;

	for (let i = 0; i < args.length; i++) {
		const arg = args[i];
		if (arg === "--folder-id" && args[i + 1]) {
			folderId = args[i + 1];
			i++;
		} else if (arg === "--all") {
			all = true;
		}
	}

	return { folderId, all };
};

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const main = async (): Promise<void> => {
	const { folderId, all } = parseArgs();

	if (!folderId && !all) {
		console.log(
			"使用方法: npx tsx scripts/sync-dicom-from-drive.ts [--folder-id <id>] [--all]\n" +
				"  --folder-id <id>  指定フォルダ内のDICOMファイルを同期\n" +
				"  --all             Drive全体からDICOMファイルを検索して同期\n",
		);
		process.exit(1);
	}

	if (folderId && !/^[a-zA-Z0-9_-]+$/.test(folderId)) {
		console.error("エラー: --folder-id の形式が不正です");
		process.exit(1);
	}

	console.log("Google Drive認証を確認しています...");
	const client = await getAuthedClient();
	const drive = new drive_v3.Drive({ auth: client });

	console.log(
		folderId
			? `フォルダ ${folderId} 内のDICOMファイルを検索中...`
			: "Drive全体でDICOMファイルを検索中...",
	);

	const remoteFiles = await listDicomFiles(drive, folderId);
	console.log(`${remoteFiles.length} 件のDICOMファイルが見つかりました\n`);

	if (remoteFiles.length === 0) {
		console.log("同期するファイルがありません。");
		return;
	}

	await mkdir(DICOM_OUTPUT_DIR, { recursive: true });

	let downloaded = 0;
	let skipped = 0;
	let errors = 0;

	for (let i = 0; i < remoteFiles.length; i++) {
		const file = remoteFiles[i];
		if (!file) continue;
		const localPath = path.join(DICOM_OUTPUT_DIR, file.name);
		const pos = i + 1;

		if (await shouldSkip(localPath, file.size)) {
			reportProgress(pos, remoteFiles.length, file.name, "skipped");
			skipped++;
			continue;
		}

		reportProgress(pos, remoteFiles.length, file.name, "downloading");
		try {
			await downloadFile(drive, file.id, localPath);
			reportProgress(pos, remoteFiles.length, file.name, "done");
			downloaded++;
		} catch (err) {
			reportProgress(pos, remoteFiles.length, file.name, "error");
			console.error(
				`  エラー: ${err instanceof Error ? err.message : String(err)}`,
			);
			errors++;
		}
	}

	console.log("\n--- 同期完了 ---");
	console.log(`ダウンロード: ${downloaded} 件`);
	console.log(`スキップ (既存):   ${skipped} 件`);
	console.log(`エラー:        ${errors} 件`);
	console.log(`出力先: ${DICOM_OUTPUT_DIR}`);
};

main().catch((err) => {
	console.error("Fatal:", err instanceof Error ? err.message : String(err));
	process.exit(1);
});
