import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

type MockBrowserWindowOptions = {
	webPreferences?: {
		partition?: string;
	};
};

const driveListMock = vi.hoisted(() => vi.fn());
const oauthClientMock = vi.hoisted(() => ({
	generateAuthUrl: vi.fn(() => "https://accounts.google.com/mock"),
	setCredentials: vi.fn(),
	getToken: vi.fn(),
}));
const electronState = vi.hoisted(() => ({
	userDataPath: "",
	browserWindowOptions: [] as MockBrowserWindowOptions[],
	closedHandler: undefined as (() => void) | undefined,
}));

vi.mock("@googleapis/drive", () => ({
	drive_v3: {
		Drive: vi.fn(function DriveMock() {
			return {
				files: {
					list: driveListMock,
					get: vi.fn(),
				},
			};
		}),
	},
}));

vi.mock("@googleapis/oauth2", () => ({
	oauth2_v2: {
		Oauth2: vi.fn(() => ({
			userinfo: {
				get: vi.fn().mockResolvedValue({ data: { email: "test@example.com" } }),
			},
		})),
	},
}));

vi.mock("google-auth-library", () => ({
	OAuth2Client: vi.fn(function OAuth2ClientMock() {
		return oauthClientMock;
	}),
}));

vi.mock("electron", () => ({
	app: {
		getPath: vi.fn(() => electronState.userDataPath),
	},
	BrowserWindow: vi.fn(function BrowserWindowMock(
		options: MockBrowserWindowOptions,
	) {
		electronState.browserWindowOptions.push(options);
		return {
			webContents: {
				on: vi.fn(),
			},
			on: vi.fn((event: string, handler: () => void) => {
				if (event === "closed") {
					electronState.closedHandler = handler;
				}
			}),
			close: vi.fn(),
			loadURL: vi.fn(() => {
				queueMicrotask(() => electronState.closedHandler?.());
			}),
		};
	}),
	safeStorage: {
		isEncryptionAvailable: () => true,
		decryptString: (buffer: Buffer) => buffer.toString("utf-8"),
		encryptString: (value: string) => Buffer.from(value, "utf-8"),
	},
}));

const writeCredentials = async () => {
	await writeFile(
		join(electronState.userDataPath, "gdrive-credentials.json"),
		JSON.stringify({
			installed: {
				client_id: "client-id",
				client_secret: "client-secret",
				redirect_uris: ["http://localhost"],
			},
		}),
	);
};

const writeStoredToken = async () => {
	await writeFile(
		join(electronState.userDataPath, "gdrive-token.json"),
		JSON.stringify({
			version: 1,
			encryptedToken: Buffer.from(
				JSON.stringify({
					access_token: "access-token",
					refresh_token: "refresh-token",
					token_type: "Bearer",
					expiry_date: Date.now() + 60_000,
				}),
				"utf-8",
			).toString("base64"),
		}),
	);
};

describe("electron google-drive Wave 4 polish", () => {
	beforeEach(async () => {
		vi.resetModules();
		driveListMock.mockReset();
		driveListMock.mockResolvedValue({ data: { files: [] } });
		oauthClientMock.generateAuthUrl.mockClear();
		oauthClientMock.setCredentials.mockClear();
		oauthClientMock.getToken.mockClear();
		electronState.userDataPath = await mkdtemp(join(tmpdir(), "roentgen-gd-"));
		electronState.browserWindowOptions = [];
		electronState.closedHandler = undefined;
		await writeCredentials();
	});

	it("M5: rejects malformed folder IDs before calling Drive list", async () => {
		await writeStoredToken();
		const { listDicomFiles } = await import("../../electron/google-drive");

		const result = await listDicomFiles("abc");

		expect(result).toEqual({ files: [], error: "Invalid folder ID" });
		expect(driveListMock).not.toHaveBeenCalled();
	});

	it("M5: accepts a valid 33-character folder ID", async () => {
		await writeStoredToken();
		const validFolderId = "a".repeat(33);
		const { listDicomFiles } = await import("../../electron/google-drive");

		const result = await listDicomFiles(validFolderId);

		expect(result.error).toBeUndefined();
		expect(driveListMock).toHaveBeenCalledTimes(1);
		expect(driveListMock.mock.calls[0]?.[0]).toMatchObject({
			q: expect.stringContaining(`'${validFolderId}' in parents`),
		});
	});

	it("S7: creates the OAuth BrowserWindow with a dedicated partition", async () => {
		const { authorize } = await import("../../electron/google-drive");

		await authorize();

		expect(
			electronState.browserWindowOptions[0]?.webPreferences?.partition,
		).toBe("persist:google-oauth");
	});
});
