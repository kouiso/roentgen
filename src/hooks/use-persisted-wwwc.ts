// WW/WC の永続化 — 保存(IPC)・復元・「ユーザーが選んだ値」の追跡を1か所に集約する。
// 仕様: ユーザーが最後に選んだ WW/WC（プリセット・ドラッグなど）は、その後に
// どのペインへ読み込まれる画像にも DICOM 既定値より優先して適用される。
// リセットと自動調整は「選んだ値」を破棄し、以後は各画像の値に戻る。
// 画像ロード時の DICOM 既定値セットはこの経路を通らないため、
// 「ユーザーが選んだ値」と画像既定値を区別できる（docs/user-guide.md 参照）。
// 保持値は IPC（= 保存先）ごとに1つで、全ペインが共有する。
// IPC は注入可能にして単体テストでは electronAPI なしで動かせるようにする。
import { useCallback, useEffect, useRef } from "react";
import type { ViewerWorldInfo } from "@/types/viewer";

export type WwwcValue = { ww: number; wc: number };

export type WwwcIpc = {
	getWwwc: () => Promise<WwwcValue | undefined>;
	setWwwc: (ww: number, wc: number) => Promise<void>;
	clearWwwc: () => Promise<void>;
};

const SAVE_DEBOUNCE_MS = 1000;

// 保存先（IPC）1つにつき1つ。persisted が null = 保存値なし・未設定。
type SharedWwwc = {
	persisted: WwwcValue | null;
	// ユーザーが値を選ぶ/リセットした後は、遅れて届いた起動時の保存値で上書きしない
	userActed: boolean;
	saveTimer: ReturnType<typeof setTimeout> | null;
	pendingSave: WwwcValue | null;
};

const newShared = (): SharedWwwc => ({
	persisted: null,
	userActed: false,
	saveTimer: null,
	pendingSave: null,
});

const sharedByIpc = new WeakMap<WwwcIpc, SharedWwwc>();

const sharedFor = (ipc: WwwcIpc): SharedWwwc => {
	const existing = sharedByIpc.get(ipc);
	if (existing) return existing;
	const created = newShared();
	sharedByIpc.set(ipc, created);
	return created;
};

export const usePersistedWwwc = (
	ipc: WwwcIpc | undefined,
	setWorldInfo: React.Dispatch<React.SetStateAction<ViewerWorldInfo>>,
) => {
	// IPC が無い環境（単体テスト等）ではこのフック専用の状態を使う
	const localRef = useRef<SharedWwwc>(newShared());
	const shared = ipc ? sharedFor(ipc) : localRef.current;
	const imageLoadedRef = useRef(false);
	const ipcRef = useRef(ipc);
	ipcRef.current = ipc;

	// 保持値があれば現在画像へ適用する。DICOM 既定値セット済みの
	// 画像ロード完了後に呼ぶのが前提なので、ここでは素通しで上書きする
	const applyPersisted = useCallback(() => {
		const persisted = shared.persisted;
		if (!persisted) return;
		setWorldInfo((prev) => ({
			...prev,
			windowWidth: persisted.ww,
			windowCenter: persisted.wc,
		}));
	}, [shared, setWorldInfo]);

	// 起動時に保存値を取得する。取得が画像表示より後になっても
	// imageLoadedRef 経由で適用できるよう解決時にも適用を試みる。
	// 先にユーザーが変更済みならそちらを優先し、取得値では上書きしない。
	useEffect(() => {
		if (!ipc) return;
		let cancelled = false;
		ipc
			.getWwwc()
			.then((saved) => {
				if (cancelled || !saved || shared.userActed) return;
				// 別ペインの取得が先に保存値を埋めていても、このペインの画像が
				// 取得前にロード済みなら適用が漏れるため、ここでも適用する
				if (!shared.persisted) shared.persisted = saved;
				if (imageLoadedRef.current) applyPersisted();
			})
			.catch((error: unknown) => {
				console.warn(
					"[usePersistedWwwc] failed to load persisted WW/WC:",
					error,
				);
			});
		return () => {
			cancelled = true;
		};
	}, [ipc, shared, applyPersisted]);

	// アンマウント時は未送信の保存を捨てず即送信する（変更直後の終了で値を失わない）
	useEffect(
		() => () => {
			if (shared.saveTimer) clearTimeout(shared.saveTimer);
			shared.saveTimer = null;
			const pending = shared.pendingSave;
			if (pending) {
				shared.pendingSave = null;
				ipcRef.current
					?.setWwwc(pending.ww, pending.wc)
					.catch((error: unknown) => {
						console.warn(
							"[usePersistedWwwc] failed to flush WW/WC on unmount:",
							error,
						);
					});
			}
		},
		[shared],
	);

	// ドラッグ連打でIPCが詰まらないよう、値が1秒静止した時だけ保存する
	const scheduleSave = useCallback(
		(value: WwwcValue) => {
			if (shared.saveTimer) clearTimeout(shared.saveTimer);
			shared.pendingSave = value;
			shared.saveTimer = setTimeout(() => {
				shared.saveTimer = null;
				shared.pendingSave = null;
				ipcRef.current?.setWwwc(value.ww, value.wc).catch((error: unknown) => {
					console.warn("[usePersistedWwwc] failed to persist WW/WC:", error);
				});
			}, SAVE_DEBOUNCE_MS);
		},
		[shared],
	);

	// ユーザー操作によるWW/WC確定変更（絶対値）
	const setWwWc = useCallback(
		(ww: number, wc: number) => {
			const value = { ww: Math.max(1, ww), wc };
			shared.persisted = value;
			shared.userActed = true;
			scheduleSave(value);
			setWorldInfo((prev) => ({
				...prev,
				windowWidth: value.ww,
				windowCenter: value.wc,
			}));
		},
		[shared, scheduleSave, setWorldInfo],
	);

	// ユーザー操作によるWW/WCデルタ変更（マウスドラッグ用）
	const adjustWwWc = useCallback(
		(deltaWW: number, deltaWC: number) => {
			setWorldInfo((prev) => {
				const value = {
					ww: Math.max(1, prev.windowWidth + deltaWW),
					wc: prev.windowCenter + deltaWC,
				};
				shared.persisted = value;
				shared.userActed = true;
				scheduleSave(value);
				return {
					...prev,
					windowWidth: value.ww,
					windowCenter: value.wc,
				};
			});
		},
		[shared, scheduleSave, setWorldInfo],
	);

	// リセット: 「ユーザーが選んだ値」を破棄し、保存値も消す。
	// 表示の更新は呼び出し側が済ませる（画像既定値へ戻す処理と対で使う）
	const clearUserChoice = useCallback(() => {
		shared.persisted = null;
		shared.userActed = true;
		if (shared.saveTimer) clearTimeout(shared.saveTimer);
		shared.saveTimer = null;
		shared.pendingSave = null;
		ipcRef.current?.clearWwwc().catch((error: unknown) => {
			console.warn(
				"[usePersistedWwwc] failed to clear persisted WW/WC:",
				error,
			);
		});
	}, [shared]);

	// 画像ロード完了のたびに呼ぶ。保持値があれば DICOM 既定値へ優先適用する
	const notifyImageLoaded = useCallback(() => {
		imageLoadedRef.current = true;
		applyPersisted();
	}, [applyPersisted]);

	return { setWwWc, adjustWwWc, clearUserChoice, notifyImageLoaded };
};
