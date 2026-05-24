// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FileDropZone } from "../file-drop-zone";

describe("FileDropZone", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
		Object.defineProperty(window, "electronAPI", {
			configurable: true,
			value: undefined,
		});
	});

	it("ファイル読込エラーをalertとして通知する", async () => {
		Object.defineProperty(window, "electronAPI", {
			configurable: true,
			value: {
				selectDicomFiles: vi.fn().mockResolvedValue(["/tmp/missing.dcm"]),
				readFile: vi.fn().mockRejectedValue(new Error("ENOENT")),
			},
		});

		render(<FileDropZone onFilesLoaded={vi.fn()} />);

		fireEvent.click(screen.getByRole("button", { name: "ファイルを開く" }));

		const alert = await screen.findByRole("alert");
		expect(alert.getAttribute("aria-live")).toBe("assertive");
		await waitFor(() => {
			expect(alert.textContent).toContain(
				"missing.dcm: ファイルが見つかりません",
			);
		});
	});
});
