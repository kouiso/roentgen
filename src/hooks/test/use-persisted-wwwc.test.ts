// @vitest-environment happy-dom
import { act, renderHook, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { INITIAL_WORLD_INFO, type ViewerWorldInfo } from "@/types/viewer";
import { usePersistedWwwc, type WwwcIpc } from "../use-persisted-wwwc";

const DICOM_DEFAULT = { ww: 3600, wc: 2150 };
const SAVED = { ww: 2500, wc: 500 };

const makeIpc = (saved?: { ww: number; wc: number }): WwwcIpc => ({
	getWwwc: vi.fn(() => Promise.resolve(saved)),
	setWwwc: vi.fn(() => Promise.resolve()),
	clearWwwc: vi.fn(() => Promise.resolve()),
});

const setup = (ipc: WwwcIpc | undefined) =>
	renderHook(() => {
		const [worldInfo, setWorldInfo] = useState<ViewerWorldInfo>({
			...INITIAL_WORLD_INFO,
			windowWidth: DICOM_DEFAULT.ww,
			windowCenter: DICOM_DEFAULT.wc,
		});
		const persisted = usePersistedWwwc(ipc, setWorldInfo);
		return { persisted, worldInfo, setWorldInfo };
	});

describe("usePersistedWwwc", () => {
	afterEach(() => {
		vi.restoreAllMocks();
		vi.useRealTimers();
	});

	it("保存値があれば画像ロード完了時に DICOM 既定値へ優先適用する", async () => {
		const ipc = makeIpc(SAVED);
		const { result } = setup(ipc);
		await waitFor(() => expect(ipc.getWwwc).toHaveBeenCalled());

		act(() => result.current.persisted.notifyImageLoaded());
		expect(result.current.worldInfo.windowWidth).toBe(SAVED.ww);
		expect(result.current.worldInfo.windowCenter).toBe(SAVED.wc);
	});

	it("2枚目以降の画像ロードでも保持値を再適用する", async () => {
		const ipc = makeIpc(SAVED);
		const { result } = setup(ipc);
		await waitFor(() => expect(ipc.getWwwc).toHaveBeenCalled());

		act(() => result.current.persisted.notifyImageLoaded());
		expect(result.current.worldInfo.windowWidth).toBe(SAVED.ww);

		// 画像切替で DICOM 既定値に初期化される想定を再現
		act(() =>
			result.current.setWorldInfo((prev) => ({
				...prev,
				windowWidth: 4000,
				windowCenter: 1800,
			})),
		);
		act(() => result.current.persisted.notifyImageLoaded());
		expect(result.current.worldInfo.windowWidth).toBe(SAVED.ww);
		expect(result.current.worldInfo.windowCenter).toBe(SAVED.wc);
	});

	it("セッション中の変更は後続画像へも引き継がれる", async () => {
		const ipc = makeIpc(undefined);
		const { result } = setup(ipc);
		await waitFor(() => expect(ipc.getWwwc).toHaveBeenCalled());

		act(() => result.current.persisted.setWwWc(3000, 700));
		expect(result.current.worldInfo.windowWidth).toBe(3000);

		// 2枚目のロード（DICOM 既定へ一旦戻る想定）
		act(() =>
			result.current.setWorldInfo((prev) => ({
				...prev,
				windowWidth: 4000,
				windowCenter: 1800,
			})),
		);
		act(() => result.current.persisted.notifyImageLoaded());
		expect(result.current.worldInfo.windowWidth).toBe(3000);
		expect(result.current.worldInfo.windowCenter).toBe(700);
	});

	it("保存値も操作も無ければ画像既定値をそのまま使う", async () => {
		const ipc = makeIpc(undefined);
		const { result } = setup(ipc);
		await waitFor(() => expect(ipc.getWwwc).toHaveBeenCalled());

		act(() => result.current.persisted.notifyImageLoaded());
		expect(result.current.worldInfo.windowWidth).toBe(DICOM_DEFAULT.ww);
		expect(result.current.worldInfo.windowCenter).toBe(DICOM_DEFAULT.wc);
	});

	it("画像表示後に getWwwc が解決しても遅れて適用される", async () => {
		let resolveGet: (v: { ww: number; wc: number } | undefined) => void =
			() => {};
		const ipc: WwwcIpc = {
			getWwwc: vi.fn(
				() =>
					new Promise((res) => {
						resolveGet = res;
					}),
			),
			setWwwc: vi.fn(() => Promise.resolve()),
		};
		const { result } = setup(ipc);
		// 取得完了前に画像が表示された
		act(() => result.current.persisted.notifyImageLoaded());
		expect(result.current.worldInfo.windowWidth).toBe(DICOM_DEFAULT.ww);

		await act(async () => {
			resolveGet(SAVED);
			await Promise.resolve();
		});
		expect(result.current.worldInfo.windowWidth).toBe(SAVED.ww);
	});

	it("ユーザーが先に変更していれば遅延した保存値で上書きしない", async () => {
		let resolveGet: (v: { ww: number; wc: number } | undefined) => void =
			() => {};
		const ipc: WwwcIpc = {
			getWwwc: vi.fn(
				() =>
					new Promise((res) => {
						resolveGet = res;
					}),
			),
			setWwwc: vi.fn(() => Promise.resolve()),
		};
		const { result } = setup(ipc);
		act(() => result.current.persisted.setWwWc(3100, 800));

		await act(async () => {
			resolveGet(SAVED);
			await Promise.resolve();
		});
		act(() => result.current.persisted.notifyImageLoaded());
		expect(result.current.worldInfo.windowWidth).toBe(3100);
	});

	it("WW/WC 変更をデバウンスして IPC へ保存する（最終値のみ）", async () => {
		vi.useFakeTimers();
		const ipc = makeIpc(undefined);
		const { result } = setup(ipc);
		await act(async () => Promise.resolve());

		act(() => result.current.persisted.setWwWc(2000, 600));
		act(() => result.current.persisted.setWwWc(2500, 500));
		act(() => result.current.persisted.adjustWwWc(100, 50));
		await act(async () => {
			vi.advanceTimersByTime(1100);
			await Promise.resolve();
		});
		expect(ipc.setWwwc).toHaveBeenCalledTimes(1);
		expect(ipc.setWwwc).toHaveBeenCalledWith(2600, 550);
	});

	it("デバウンス待ちのままアンマウントしても最後の値を保存する", async () => {
		vi.useFakeTimers();
		const ipc = makeIpc(undefined);
		const { result, unmount } = setup(ipc);
		await act(async () => Promise.resolve());

		act(() => result.current.persisted.setWwWc(2500, 500));
		expect(ipc.setWwwc).not.toHaveBeenCalled();
		unmount();
		expect(ipc.setWwwc).toHaveBeenCalledTimes(1);
		expect(ipc.setWwwc).toHaveBeenCalledWith(2500, 500);

		await act(async () => {
			vi.advanceTimersByTime(1100);
			await Promise.resolve();
		});
		expect(ipc.setWwwc).toHaveBeenCalledTimes(1);
	});

	it("デバウンス送信済みならアンマウントで二重送信しない", async () => {
		vi.useFakeTimers();
		const ipc = makeIpc(undefined);
		const { result, unmount } = setup(ipc);
		await act(async () => Promise.resolve());

		act(() => result.current.persisted.setWwWc(2500, 500));
		await act(async () => {
			vi.advanceTimersByTime(1100);
			await Promise.resolve();
		});
		unmount();
		expect(ipc.setWwwc).toHaveBeenCalledTimes(1);
	});

	it("adjustWwWc は現在値にデルタを累積する", async () => {
		const ipc = makeIpc(undefined);
		const { result } = setup(ipc);
		await act(async () => Promise.resolve());

		act(() => result.current.persisted.setWwWc(2000, 500));
		act(() => result.current.persisted.adjustWwWc(500, 100));
		act(() => result.current.persisted.adjustWwWc(-100, -50));
		expect(result.current.worldInfo.windowWidth).toBe(2400);
		expect(result.current.worldInfo.windowCenter).toBe(550);
	});

	it("clearUserChoice は保持値と保存値を消し、以後の画像は既定値のまま", async () => {
		vi.useFakeTimers();
		const ipc = makeIpc(SAVED);
		const { result } = setup(ipc);
		await act(async () => Promise.resolve());

		act(() => result.current.persisted.notifyImageLoaded());
		expect(result.current.worldInfo.windowWidth).toBe(SAVED.ww);

		act(() => result.current.persisted.setWwWc(1800, 300));
		act(() => result.current.persisted.clearUserChoice());
		expect(ipc.clearWwwc).toHaveBeenCalledTimes(1);

		// 次の画像ロード: DICOM 既定値がそのまま残る
		act(() =>
			result.current.setWorldInfo((prev) => ({
				...prev,
				windowWidth: DICOM_DEFAULT.ww,
				windowCenter: DICOM_DEFAULT.wc,
			})),
		);
		act(() => result.current.persisted.notifyImageLoaded());
		expect(result.current.worldInfo.windowWidth).toBe(DICOM_DEFAULT.ww);

		// 破棄した保存待ちの値は送信されない
		await act(async () => {
			vi.advanceTimersByTime(1100);
			await Promise.resolve();
		});
		expect(ipc.setWwwc).not.toHaveBeenCalled();
	});

	it("リセット後に遅れて届いた起動時の保存値で復活しない", async () => {
		let resolveGet: (v: { ww: number; wc: number } | undefined) => void = () =>
			undefined;
		const ipc: WwwcIpc = {
			getWwwc: vi.fn(
				() =>
					new Promise((resolve) => {
						resolveGet = resolve;
					}),
			),
			setWwwc: vi.fn(() => Promise.resolve()),
			clearWwwc: vi.fn(() => Promise.resolve()),
		};
		const { result } = setup(ipc);
		act(() => result.current.persisted.notifyImageLoaded());
		act(() => result.current.persisted.clearUserChoice());
		await act(async () => {
			resolveGet(SAVED);
			await Promise.resolve();
		});
		expect(result.current.worldInfo.windowWidth).toBe(DICOM_DEFAULT.ww);
	});

	it("別ペインの取得が先に保存値を埋めても、取得前にロード済みのペインへ適用する", async () => {
		const resolvers: Array<(v: { ww: number; wc: number }) => void> = [];
		const ipc: WwwcIpc = {
			getWwwc: vi.fn(
				() =>
					new Promise((resolve) => {
						resolvers.push(resolve);
					}),
			),
			setWwwc: vi.fn(() => Promise.resolve()),
			clearWwwc: vi.fn(() => Promise.resolve()),
		};
		const paneA = setup(ipc);
		const paneB = setup(ipc);
		act(() => paneB.result.current.persisted.notifyImageLoaded());

		await act(async () => {
			resolvers[0]?.(SAVED);
			await Promise.resolve();
		});
		await act(async () => {
			resolvers[1]?.(SAVED);
			await Promise.resolve();
		});
		expect(paneB.result.current.worldInfo.windowWidth).toBe(SAVED.ww);
		expect(paneA.result.current.worldInfo.windowWidth).toBe(DICOM_DEFAULT.ww);
	});

	it("同じ IPC を使う別ペインでも、選んだ値が後続画像へ共有される", async () => {
		const ipc = makeIpc(undefined);
		const paneA = setup(ipc);
		const paneB = setup(ipc);
		await act(async () => Promise.resolve());

		act(() => paneA.result.current.persisted.setWwWc(2500, 500));
		// paneB に画像が新たにロードされたとき、paneA で選んだ値が適用される
		act(() => paneB.result.current.persisted.notifyImageLoaded());
		expect(paneB.result.current.worldInfo.windowWidth).toBe(2500);
		expect(paneB.result.current.worldInfo.windowCenter).toBe(500);

		act(() => paneA.result.current.persisted.clearUserChoice());
		act(() =>
			paneB.result.current.setWorldInfo((prev) => ({
				...prev,
				windowWidth: DICOM_DEFAULT.ww,
			})),
		);
		act(() => paneB.result.current.persisted.notifyImageLoaded());
		expect(paneB.result.current.worldInfo.windowWidth).toBe(DICOM_DEFAULT.ww);
	});

	it("getWwwc 失敗時は警告を出して復元なしで継続する", async () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		const ipc: WwwcIpc = {
			getWwwc: vi.fn(() => Promise.reject(new Error("ipc down"))),
			setWwwc: vi.fn(() => Promise.resolve()),
		};
		const { result } = setup(ipc);
		await waitFor(() => expect(warn).toHaveBeenCalled());
		act(() => result.current.persisted.notifyImageLoaded());
		expect(result.current.worldInfo.windowWidth).toBe(DICOM_DEFAULT.ww);
	});

	it("setWwwc の保存失敗は警告に留めて例外を投げない", async () => {
		vi.useFakeTimers();
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		const ipc: WwwcIpc = {
			getWwwc: vi.fn(() => Promise.resolve(undefined)),
			setWwwc: vi.fn(() => Promise.reject(new Error("disk full"))),
		};
		const { result } = setup(ipc);
		await act(async () => Promise.resolve());

		act(() => result.current.persisted.setWwWc(2500, 500));
		await act(async () => {
			vi.advanceTimersByTime(1100);
			await Promise.resolve();
		});
		expect(warn).toHaveBeenCalled();
	});

	it("アンマウント時の即時保存が失敗しても警告を出し例外を投げない", async () => {
		vi.useFakeTimers();
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		const failure = new Error("ipc closed");
		const ipc: WwwcIpc = {
			getWwwc: vi.fn(() => Promise.resolve(undefined)),
			setWwwc: vi.fn(() => Promise.reject(failure)),
		};
		const { result, unmount } = setup(ipc);
		await act(async () => Promise.resolve());

		act(() => result.current.persisted.setWwWc(2500, 500));
		unmount();
		await act(async () => Promise.resolve());

		expect(ipc.setWwwc).toHaveBeenCalledWith(2500, 500);
		expect(warn).toHaveBeenCalledWith(
			"[usePersistedWwwc] failed to flush WW/WC on unmount:",
			failure,
		);
	});

	it("IPC が無い環境では取得も保存も行わず破綻しない", async () => {
		const { result } = setup(undefined);
		await act(async () => Promise.resolve());
		act(() => result.current.persisted.setWwWc(2500, 500));
		act(() => result.current.persisted.notifyImageLoaded());
		expect(result.current.worldInfo.windowWidth).toBe(2500);
	});
});
