// WW/WC の永続化 — 保存(IPC)・復元・「ユーザーが選んだ値」の追跡を1か所に集約する。
// 仕様: ユーザーが最後に選んだ WW/WC（プリセット・ドラッグ・リセット・同期を含む
// すべての変更経路）は、その後にペインへ読み込まれる全画像へ DICOM 既定値より
// 優先して適用される。画像ロード時の DICOM 既定値セットはこの経路を通らないため、
// 「ユーザーが選んだ値」と画像既定値を区別できる（docs/user-guide.md 参照）。
// IPC は注入可能にして単体テストでは electronAPI なしで動かせるようにする。
import { useCallback, useEffect, useRef } from "react";
import type { ViewerWorldInfo } from "@/types/viewer";

export type WwwcValue = { ww: number; wc: number };

export type WwwcIpc = {
	getWwwc: () => Promise<WwwcValue | undefined>;
	setWwwc: (ww: number, wc: number) => Promise<void>;
};

const SAVE_DEBOUNCE_MS = 1000;

export const usePersistedWwwc = (
	ipc: WwwcIpc | undefined,
	setWorldInfo: React.Dispatch<React.SetStateAction<ViewerWorldInfo>>,
) => {
	// 保持中のWW/WC。null = 保存値なし・未設定。
	// 永続化対象そのものなので、起動時復元とユーザー操作の両方がここを更新する
	const persistedRef = useRef<WwwcValue | null>(null);
	const imageLoadedRef = useRef(false);
	const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const pendingSaveRef = useRef<WwwcValue | null>(null);
	const ipcRef = useRef(ipc);
	ipcRef.current = ipc;

	// 保持値があれば現在画像へ適用する。DICOM 既定値セット済みの
	// 画像ロード完了後に呼ぶのが前提なので、ここでは素通しで上書きする
	const applyPersisted = useCallback(() => {
		const persisted = persistedRef.current;
		if (!persisted) return;
		setWorldInfo((prev) => ({
			...prev,
			windowWidth: persisted.ww,
			windowCenter: persisted.wc,
		}));
	}, [setWorldInfo]);

	// 起動時に1回だけ保存値を取得する。取得が画像表示より後になっても
	// imageLoadedRef 経由で適用できるよう解決時にも適用を試みる。
	// 先にユーザーが変更済みならそちらを優先し、取得値では上書きしない。
	useEffect(() => {
		if (!ipc) return;
		let cancelled = false;
		ipc
			.getWwwc()
			.then((saved) => {
				if (cancelled || !saved || persistedRef.current) return;
				persistedRef.current = saved;
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
	}, [ipc, applyPersisted]);

	// アンマウント時は未送信の保存を捨てず即送信する（変更直後の終了で値を失わない）
	useEffect(
		() => () => {
			if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
			const pending = pendingSaveRef.current;
			if (pending) {
				pendingSaveRef.current = null;
				ipcRef.current?.setWwwc(pending.ww, pending.wc).catch(() => {});
			}
		},
		[],
	);

	// ドラッグ連打でIPCが詰まらないよう、値が1秒静止した時だけ保存する
	const scheduleSave = useCallback((value: WwwcValue) => {
		if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
		pendingSaveRef.current = value;
		saveTimerRef.current = setTimeout(() => {
			pendingSaveRef.current = null;
			ipcRef.current?.setWwwc(value.ww, value.wc).catch((error: unknown) => {
				console.warn("[usePersistedWwwc] failed to persist WW/WC:", error);
			});
		}, SAVE_DEBOUNCE_MS);
	}, []);

	// ユーザー操作によるWW/WC確定変更（絶対値）
	const setWwWc = useCallback(
		(ww: number, wc: number) => {
			const value = { ww: Math.max(1, ww), wc };
			persistedRef.current = value;
			scheduleSave(value);
			setWorldInfo((prev) => ({
				...prev,
				windowWidth: value.ww,
				windowCenter: value.wc,
			}));
		},
		[scheduleSave, setWorldInfo],
	);

	// ユーザー操作によるWW/WCデルタ変更（マウスドラッグ用）
	const adjustWwWc = useCallback(
		(deltaWW: number, deltaWC: number) => {
			setWorldInfo((prev) => {
				const value = {
					ww: Math.max(1, prev.windowWidth + deltaWW),
					wc: prev.windowCenter + deltaWC,
				};
				persistedRef.current = value;
				scheduleSave(value);
				return {
					...prev,
					windowWidth: value.ww,
					windowCenter: value.wc,
				};
			});
		},
		[scheduleSave, setWorldInfo],
	);

	// resetImage のように worldInfo 更新を伴わない経路でユーザーが値を選んだ
	// 場合に、その値を保持対象として記録する（表示更新は呼び出し側が済ませる）
	const recordUserChoice = useCallback(
		(ww: number, wc: number) => {
			const value = { ww: Math.max(1, ww), wc };
			persistedRef.current = value;
			scheduleSave(value);
		},
		[scheduleSave],
	);

	// 画像ロード完了のたびに呼ぶ。保持値があれば DICOM 既定値へ優先適用する
	const notifyImageLoaded = useCallback(() => {
		imageLoadedRef.current = true;
		applyPersisted();
	}, [applyPersisted]);

	return { setWwWc, adjustWwWc, recordUserChoice, notifyImageLoaded };
};
