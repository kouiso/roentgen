// @vitest-environment happy-dom
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import {
	DIRECTION_SPECIES_STORAGE_KEY,
	reloadDirectionSpecies,
	setDirectionSpecies,
	useDirectionSpecies,
} from "../use-direction-species";

describe("useDirectionSpecies", () => {
	beforeEach(() => {
		localStorage.clear();
		reloadDirectionSpecies();
	});

	it("保存値がなければ馬の用語を既定にする", () => {
		const { result } = renderHook(() => useDirectionSpecies());
		expect(result.current.species).toBe("equine");
	});

	it("切り替えを保存し、別のペインにも即時反映する", () => {
		const first = renderHook(() => useDirectionSpecies());
		const second = renderHook(() => useDirectionSpecies());

		act(() => {
			first.result.current.toggleSpecies();
		});

		expect(first.result.current.species).toBe("human");
		expect(second.result.current.species).toBe("human");
		expect(localStorage.getItem(DIRECTION_SPECIES_STORAGE_KEY)).toBe("human");
	});

	it("再起動後は保存した表記を使う", () => {
		localStorage.setItem(DIRECTION_SPECIES_STORAGE_KEY, "human");
		reloadDirectionSpecies();

		const { result } = renderHook(() => useDirectionSpecies());
		expect(result.current.species).toBe("human");
	});

	it("壊れた保存値は既定値に戻す", () => {
		localStorage.setItem(DIRECTION_SPECIES_STORAGE_KEY, "cat");
		reloadDirectionSpecies();

		const { result } = renderHook(() => useDirectionSpecies());
		expect(result.current.species).toBe("equine");
	});

	it("同じ値の設定では再描画を起こさない", () => {
		let renders = 0;
		renderHook(() => {
			renders += 1;
			return useDirectionSpecies();
		});
		const before = renders;

		act(() => {
			setDirectionSpecies("equine");
		});

		expect(renders).toBe(before);
	});
});
