// レイアウト状態管理フック
import { useCallback, useState } from "react";
import { LAYOUT_TYPE, type LayoutType } from "@/types/layout";

export const useViewerLayout = () => {
	const [layout, setLayout] = useState<LayoutType>(LAYOUT_TYPE.ONE_BY_ONE);

	const setOneByOne = useCallback(() => setLayout(LAYOUT_TYPE.ONE_BY_ONE), []);
	const setTwoByOne = useCallback(() => setLayout(LAYOUT_TYPE.TWO_BY_ONE), []);
	const setOneByTwo = useCallback(() => setLayout(LAYOUT_TYPE.ONE_BY_TWO), []);
	const setTwoByTwo = useCallback(() => setLayout(LAYOUT_TYPE.TWO_BY_TWO), []);

	return {
		layout,
		setLayout,
		setOneByOne,
		setTwoByOne,
		setOneByTwo,
		setTwoByTwo,
	};
};
