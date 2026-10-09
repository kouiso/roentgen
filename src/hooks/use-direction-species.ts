// 方向マーカーの表記（馬の用語 / DICOM略号）を全ペインで共有し、再起動後も保つ
import { useCallback, useSyncExternalStore } from "react";
import type { Species } from "@/utils/image-direction";

export const DIRECTION_SPECIES_STORAGE_KEY = "roentgen:direction-species";

const DEFAULT_SPECIES: Species = "equine";

const listeners = new Set<() => void>();

const isSpecies = (value: unknown): value is Species =>
	value === "equine" || value === "human";

// ストレージが使えない環境（プライベートモード等）でも表示は既定値で続ける
const readStoredSpecies = (): Species => {
	try {
		const stored = globalThis.localStorage?.getItem(
			DIRECTION_SPECIES_STORAGE_KEY,
		);
		return isSpecies(stored) ? stored : DEFAULT_SPECIES;
	} catch {
		return DEFAULT_SPECIES;
	}
};

let currentSpecies: Species = readStoredSpecies();

export const setDirectionSpecies = (species: Species) => {
	if (species === currentSpecies) return;
	currentSpecies = species;
	try {
		globalThis.localStorage?.setItem(DIRECTION_SPECIES_STORAGE_KEY, species);
	} catch {
		// 保存できなくても今のセッション内では切り替えを有効にする
	}
	for (const listener of listeners) listener();
};

// テストや別ウィンドウでの変更後にストレージの値を読み直す
export const reloadDirectionSpecies = () => {
	const stored = readStoredSpecies();
	if (stored === currentSpecies) return;
	currentSpecies = stored;
	for (const listener of listeners) listener();
};

const subscribe = (listener: () => void) => {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
};

const getSnapshot = () => currentSpecies;

export const useDirectionSpecies = () => {
	const species = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
	const toggleSpecies = useCallback(() => {
		setDirectionSpecies(currentSpecies === "equine" ? "human" : "equine");
	}, []);
	return { species, toggleSpecies };
};
