// Electron側の保存/印刷が失敗した場合にブラウザ側フォールバックへ戻す

export const runBooleanExportWithFallback = async (
	operation: Promise<boolean>,
	fallback: () => void,
): Promise<boolean> => {
	try {
		const success = await operation;
		if (!success) fallback();
		return success;
	} catch {
		fallback();
		return false;
	}
};
