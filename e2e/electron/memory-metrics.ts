import type { CDPSession, ElectronApplication, Page } from "@playwright/test";

export type RendererMemorySnapshot = {
	jsHeapUsedMb: number;
	rendererWorkingSetMb: number;
	domNodes: number;
	jsEventListeners: number;
};

const toMb = (bytes: number) => bytes / 1024 / 1024;

// OS のフォルダ選択ダイアログだけを差し替え、以降は「フォルダを開く」と同じ
// 実経路（読込許可の登録 → read-file → 解析ワーカー）を通す。
export const stubFolderDialog = async (
	electronApp: ElectronApplication,
	dirPath: string,
) => {
	await electronApp.evaluate(({ dialog }, selectedDirPath) => {
		dialog.showOpenDialog = async () => ({
			canceled: false,
			filePaths: [selectedDirPath],
		});
	}, dirPath);
};

export const readRendererWorkingSetMb = async (
	electronApp: ElectronApplication,
) => {
	const kilobytes = await electronApp.evaluate(({ app, BrowserWindow }) => {
		const [window] = BrowserWindow.getAllWindows();
		if (!window) throw new Error("main window not found");
		const pid = window.webContents.getOSProcessId();
		const metric = app.getAppMetrics().find((entry) => entry.pid === pid);
		return metric?.memory.workingSetSize ?? 0;
	});
	return kilobytes / 1024;
};

export const collectGarbage = async (session: CDPSession) => {
	// ArrayBuffer の解放や FinalizationRegistry は 1 回の GC では反映されきらないことがある
	for (let i = 0; i < 3; i++) {
		await session.send("HeapProfiler.collectGarbage");
		await new Promise((resolve) => setTimeout(resolve, 250));
	}
};

// 破棄直後の OpenSeadragon は次の描画フレームまで rAF コールバック経由で参照が残る。
// フレームを進めてから測らないと、実際には解放されるメモリを「残っている」と誤判定する。
const waitForAnimationFrames = async (page: Page) => {
	await page.evaluate(
		() =>
			new Promise<void>((resolve) => {
				requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
			}),
	);
};

export const snapshotRendererMemory = async (
	electronApp: ElectronApplication,
	page: Page,
	session: CDPSession,
	options: { gc: boolean },
): Promise<RendererMemorySnapshot> => {
	if (options.gc) {
		await waitForAnimationFrames(page);
		await collectGarbage(session);
	}
	const heap = await session.send("Runtime.getHeapUsage");
	const counters = await session.send("Memory.getDOMCounters");
	return {
		jsHeapUsedMb: toMb(heap.usedSize),
		rendererWorkingSetMb: await readRendererWorkingSetMb(electronApp),
		domNodes: counters.nodes,
		jsEventListeners: counters.jsEventListeners,
	};
};
