// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useGoogleDrive } from "../use-google-drive";

// Helper to set up window.electronAPI.gdrive mock
function makeGdriveMock(
	overrides?: Partial<ReturnType<typeof defaultGdriveMock>>,
) {
	return { ...defaultGdriveMock(), ...overrides };
}

function defaultGdriveMock() {
	return {
		authStatus: vi.fn().mockResolvedValue({ authenticated: false }),
		authorize: vi.fn().mockResolvedValue({ success: false }),
		logout: vi.fn().mockResolvedValue(undefined),
		listDicom: vi.fn().mockResolvedValue({ files: [], error: undefined }),
		download: vi.fn().mockResolvedValue([]),
		hasCredentials: vi.fn().mockResolvedValue(true),
		syncToSeed: vi.fn().mockResolvedValue({ count: 0, skipped: 0, files: [] }),
		onDownloadProgress: vi.fn(),
	};
}

describe("useGoogleDrive", () => {
	let onFilesLoaded: (files: { path: string; data: ArrayBuffer }[]) => void;

	beforeEach(() => {
		onFilesLoaded = vi.fn();
	});

	afterEach(() => {
		// Reset window.electronAPI after each test
		Object.defineProperty(window, "electronAPI", {
			value: undefined,
			writable: true,
			configurable: true,
		});
	});

	// ---------------------------------------------------------------------------
	// 1. available=false when electronAPI.gdrive is undefined
	// ---------------------------------------------------------------------------
	describe("when electronAPI.gdrive is undefined", () => {
		it("returns available=false when electronAPI is completely absent", () => {
			Object.defineProperty(window, "electronAPI", {
				value: undefined,
				writable: true,
				configurable: true,
			});

			const { result } = renderHook(() => useGoogleDrive(onFilesLoaded));

			expect(result.current.available).toBe(false);
		});

		it("returns available=false when electronAPI exists but gdrive is absent", () => {
			Object.defineProperty(window, "electronAPI", {
				value: {},
				writable: true,
				configurable: true,
			});

			const { result } = renderHook(() => useGoogleDrive(onFilesLoaded));

			expect(result.current.available).toBe(false);
		});

		it("does NOT call authStatus when gdrive is absent", () => {
			Object.defineProperty(window, "electronAPI", {
				value: undefined,
				writable: true,
				configurable: true,
			});

			renderHook(() => useGoogleDrive(onFilesLoaded));
			// No gdrive mock, so no authStatus should have been called — just
			// confirming the hook doesn't throw and available is false.
			expect(onFilesLoaded).not.toHaveBeenCalled();
		});
	});

	// ---------------------------------------------------------------------------
	// 2. Checks auth status on mount
	// ---------------------------------------------------------------------------
	describe("auth status check on mount", () => {
		it("sets status to 'unauthenticated' when authStatus returns authenticated=false", async () => {
			const gdrive = makeGdriveMock({
				authStatus: vi.fn().mockResolvedValue({ authenticated: false }),
			});
			Object.defineProperty(window, "electronAPI", {
				value: { gdrive },
				writable: true,
				configurable: true,
			});

			const { result } = renderHook(() => useGoogleDrive(onFilesLoaded));

			// Immediately after render, status should be "checking"
			expect(result.current.auth.status).toBe("checking");

			await waitFor(() => {
				expect(result.current.auth.status).toBe("unauthenticated");
			});
			expect(gdrive.authStatus).toHaveBeenCalledTimes(1);
		});

		it("sets status to 'authenticated' with email when authStatus returns authenticated=true", async () => {
			const gdrive = makeGdriveMock({
				authStatus: vi.fn().mockResolvedValue({
					authenticated: true,
					email: "user@example.com",
				}),
			});
			Object.defineProperty(window, "electronAPI", {
				value: { gdrive },
				writable: true,
				configurable: true,
			});

			const { result } = renderHook(() => useGoogleDrive(onFilesLoaded));

			await waitFor(() => {
				expect(result.current.auth.status).toBe("authenticated");
			});
			expect(result.current.auth.email).toBe("user@example.com");
		});

		it("sets status to 'unauthenticated' when authStatus rejects", async () => {
			const gdrive = makeGdriveMock({
				authStatus: vi.fn().mockRejectedValue(new Error("network error")),
			});
			Object.defineProperty(window, "electronAPI", {
				value: { gdrive },
				writable: true,
				configurable: true,
			});

			const { result } = renderHook(() => useGoogleDrive(onFilesLoaded));

			await waitFor(() => {
				expect(result.current.auth.status).toBe("unauthenticated");
			});
		});
	});

	// ---------------------------------------------------------------------------
	// 3. login() calls gdrive.authorize()
	// ---------------------------------------------------------------------------
	describe("login()", () => {
		it("calls gdrive.authorize() and sets authenticated state on success", async () => {
			const gdrive = makeGdriveMock({
				authStatus: vi.fn().mockResolvedValue({ authenticated: false }),
				authorize: vi.fn().mockResolvedValue({
					success: true,
					email: "login@example.com",
				}),
			});
			Object.defineProperty(window, "electronAPI", {
				value: { gdrive },
				writable: true,
				configurable: true,
			});

			const { result } = renderHook(() => useGoogleDrive(onFilesLoaded));

			// Wait for initial authStatus to settle
			await waitFor(() =>
				expect(result.current.auth.status).toBe("unauthenticated"),
			);

			await act(async () => {
				await result.current.login();
			});

			expect(gdrive.authorize).toHaveBeenCalledTimes(1);
			expect(result.current.auth.status).toBe("authenticated");
			expect(result.current.auth.email).toBe("login@example.com");
		});

		it("calls gdrive.authorize() and sets unauthenticated with error on failure", async () => {
			const gdrive = makeGdriveMock({
				authStatus: vi.fn().mockResolvedValue({ authenticated: false }),
				authorize: vi.fn().mockResolvedValue({
					success: false,
					error: "access_denied",
				}),
			});
			Object.defineProperty(window, "electronAPI", {
				value: { gdrive },
				writable: true,
				configurable: true,
			});

			const { result } = renderHook(() => useGoogleDrive(onFilesLoaded));
			await waitFor(() =>
				expect(result.current.auth.status).toBe("unauthenticated"),
			);

			await act(async () => {
				await result.current.login();
			});

			expect(gdrive.authorize).toHaveBeenCalledTimes(1);
			expect(result.current.auth.status).toBe("unauthenticated");
			expect(result.current.auth.error).toBe("access_denied");
		});

		it("does nothing when gdrive is unavailable", async () => {
			Object.defineProperty(window, "electronAPI", {
				value: undefined,
				writable: true,
				configurable: true,
			});

			const { result } = renderHook(() => useGoogleDrive(onFilesLoaded));

			await act(async () => {
				await result.current.login();
			});

			// Should remain idle without throwing
			expect(result.current.auth.status).toBe("idle");
		});
	});

	// ---------------------------------------------------------------------------
	// 4. logout() calls gdrive.logout() and resets state
	// ---------------------------------------------------------------------------
	describe("logout()", () => {
		it("calls gdrive.logout() and resets auth to unauthenticated", async () => {
			const gdrive = makeGdriveMock({
				authStatus: vi.fn().mockResolvedValue({
					authenticated: true,
					email: "user@example.com",
				}),
				logout: vi.fn().mockResolvedValue(undefined),
			});
			Object.defineProperty(window, "electronAPI", {
				value: { gdrive },
				writable: true,
				configurable: true,
			});

			const { result } = renderHook(() => useGoogleDrive(onFilesLoaded));

			// Wait to be authenticated first
			await waitFor(() =>
				expect(result.current.auth.status).toBe("authenticated"),
			);

			await act(async () => {
				await result.current.logout();
			});

			expect(gdrive.logout).toHaveBeenCalledTimes(1);
			expect(result.current.auth.status).toBe("unauthenticated");
			expect(result.current.auth.email).toBeUndefined();
		});

		it("does nothing when gdrive is unavailable", async () => {
			Object.defineProperty(window, "electronAPI", {
				value: undefined,
				writable: true,
				configurable: true,
			});

			const { result } = renderHook(() => useGoogleDrive(onFilesLoaded));

			await act(async () => {
				await result.current.logout();
			});

			expect(result.current.auth.status).toBe("idle");
		});
	});

	// ---------------------------------------------------------------------------
	// 5. syncFiles() calls listDicom → download → onFilesLoaded
	// ---------------------------------------------------------------------------
	describe("syncFiles()", () => {
		it("calls listDicom then download then onFilesLoaded with downloaded files", async () => {
			const mockFiles = [{ id: "file-1" }, { id: "file-2" }];
			const mockDownloaded = [
				{ path: "/tmp/a.dcm", data: new ArrayBuffer(8) },
				{ path: "/tmp/b.dcm", data: new ArrayBuffer(8) },
			];

			const gdrive = makeGdriveMock({
				authStatus: vi
					.fn()
					.mockResolvedValue({ authenticated: true, email: "u@x.com" }),
				listDicom: vi
					.fn()
					.mockResolvedValue({ files: mockFiles, error: undefined }),
				download: vi.fn().mockResolvedValue(mockDownloaded),
			});
			Object.defineProperty(window, "electronAPI", {
				value: { gdrive },
				writable: true,
				configurable: true,
			});

			const { result } = renderHook(() => useGoogleDrive(onFilesLoaded));
			await waitFor(() =>
				expect(result.current.auth.status).toBe("authenticated"),
			);

			await act(async () => {
				await result.current.syncFiles();
			});

			expect(gdrive.listDicom).toHaveBeenCalledTimes(1);
			expect(gdrive.download).toHaveBeenCalledWith(["file-1", "file-2"]);
			expect(onFilesLoaded).toHaveBeenCalledWith(mockDownloaded);
			expect(result.current.sync.status).toBe("idle");
			expect(result.current.sync.fileCount).toBe(2);
		});

		it("sets sync status through listing → downloading → idle", async () => {
			const statusHistory: string[] = [];
			const mockFiles = [{ id: "f1" }];
			const mockDownloaded = [
				{ path: "/tmp/f1.dcm", data: new ArrayBuffer(4) },
			];

			const gdrive = makeGdriveMock({
				authStatus: vi.fn().mockResolvedValue({ authenticated: false }),
				listDicom: vi.fn().mockResolvedValue({ files: mockFiles }),
				download: vi.fn().mockResolvedValue(mockDownloaded),
			});
			Object.defineProperty(window, "electronAPI", {
				value: { gdrive },
				writable: true,
				configurable: true,
			});

			const { result } = renderHook(() => useGoogleDrive(onFilesLoaded));
			await waitFor(() =>
				expect(result.current.auth.status).toBe("unauthenticated"),
			);

			await act(async () => {
				// Capture sync transitions
				const origListDicom = gdrive.listDicom.getMockImplementation();
				gdrive.listDicom.mockImplementation(async () => {
					statusHistory.push(result.current.sync.status);
					return origListDicom ? origListDicom() : { files: mockFiles };
				});
				await result.current.syncFiles();
			});

			// After syncFiles resolves, final status must be idle
			expect(result.current.sync.status).toBe("idle");
		});

		it("resets sync to idle and sets auth error when listDicom returns an error", async () => {
			const gdrive = makeGdriveMock({
				authStatus: vi.fn().mockResolvedValue({ authenticated: false }),
				listDicom: vi
					.fn()
					.mockResolvedValue({ files: [], error: "quota_exceeded" }),
			});
			Object.defineProperty(window, "electronAPI", {
				value: { gdrive },
				writable: true,
				configurable: true,
			});

			const { result } = renderHook(() => useGoogleDrive(onFilesLoaded));
			await waitFor(() =>
				expect(result.current.auth.status).toBe("unauthenticated"),
			);

			await act(async () => {
				await result.current.syncFiles();
			});

			expect(result.current.sync.status).toBe("idle");
			expect(result.current.auth.error).toBe("quota_exceeded");
			expect(gdrive.download).not.toHaveBeenCalled();
			expect(onFilesLoaded).not.toHaveBeenCalled();
		});

		it("sets fileCount=0 and does not call download when listDicom returns empty files", async () => {
			const gdrive = makeGdriveMock({
				authStatus: vi.fn().mockResolvedValue({ authenticated: false }),
				listDicom: vi.fn().mockResolvedValue({ files: [], error: undefined }),
			});
			Object.defineProperty(window, "electronAPI", {
				value: { gdrive },
				writable: true,
				configurable: true,
			});

			const { result } = renderHook(() => useGoogleDrive(onFilesLoaded));
			await waitFor(() =>
				expect(result.current.auth.status).toBe("unauthenticated"),
			);

			await act(async () => {
				await result.current.syncFiles();
			});

			expect(gdrive.download).not.toHaveBeenCalled();
			expect(onFilesLoaded).not.toHaveBeenCalled();
			expect(result.current.sync.fileCount).toBe(0);
		});

		it("does not call onFilesLoaded when download returns empty array", async () => {
			const gdrive = makeGdriveMock({
				authStatus: vi.fn().mockResolvedValue({ authenticated: false }),
				listDicom: vi.fn().mockResolvedValue({ files: [{ id: "x" }] }),
				download: vi.fn().mockResolvedValue([]),
			});
			Object.defineProperty(window, "electronAPI", {
				value: { gdrive },
				writable: true,
				configurable: true,
			});

			const { result } = renderHook(() => useGoogleDrive(onFilesLoaded));
			await waitFor(() =>
				expect(result.current.auth.status).toBe("unauthenticated"),
			);

			await act(async () => {
				await result.current.syncFiles();
			});

			expect(onFilesLoaded).not.toHaveBeenCalled();
			expect(result.current.sync.fileCount).toBe(0);
		});

		it("does nothing when gdrive is unavailable", async () => {
			Object.defineProperty(window, "electronAPI", {
				value: undefined,
				writable: true,
				configurable: true,
			});

			const { result } = renderHook(() => useGoogleDrive(onFilesLoaded));

			await act(async () => {
				await result.current.syncFiles();
			});

			expect(onFilesLoaded).not.toHaveBeenCalled();
			expect(result.current.sync.status).toBe("idle");
		});
	});
});
