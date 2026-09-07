// @vitest-environment happy-dom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FileDropZone } from "../file-drop-zone";

const selectDicomFiles = vi.fn();
const readFile = vi.fn();

describe("FileDropZone keyboard access", () => {
	beforeEach(() => {
		selectDicomFiles.mockReset();
		readFile.mockReset();
		selectDicomFiles.mockResolvedValue(["/tmp/demo.dcm"]);
		readFile.mockResolvedValue(new ArrayBuffer(1));
		Object.defineProperty(window, "electronAPI", {
			configurable: true,
			value: {
				selectDicomFiles,
				readFile,
			},
		});
	});

	afterEach(() => {
		Object.defineProperty(window, "electronAPI", {
			configurable: true,
			value: undefined,
		});
	});

	it("opens the file picker from Enter", async () => {
		const onFilesLoaded = vi.fn();
		render(<FileDropZone onFilesLoaded={onFilesLoaded} />);

		fireEvent.keyDown(
			screen.getByRole("button", { name: "レントゲン画像を選択" }),
			{
				key: "Enter",
			},
		);

		await waitFor(() => {
			expect(selectDicomFiles).toHaveBeenCalledOnce();
		});
		expect(onFilesLoaded).toHaveBeenCalledWith([
			{ path: "/tmp/demo.dcm", data: expect.any(ArrayBuffer) },
		]);
	});

	it("opens the file picker from Space without allowing page scroll", async () => {
		render(<FileDropZone onFilesLoaded={vi.fn()} />);

		const dropZone = screen.getByRole("button", {
			name: "レントゲン画像を選択",
		});
		const event = new KeyboardEvent("keydown", {
			key: " ",
			bubbles: true,
			cancelable: true,
		});
		dropZone.dispatchEvent(event);

		await waitFor(() => {
			expect(selectDicomFiles).toHaveBeenCalledOnce();
		});
		expect(event.defaultPrevented).toBe(true);
	});

	it("does not open another picker while loading", async () => {
		let resolveRead: (value: ArrayBuffer) => void = () => undefined;
		readFile.mockReturnValue(
			new Promise<ArrayBuffer>((resolve) => {
				resolveRead = resolve;
			}),
		);
		render(<FileDropZone onFilesLoaded={vi.fn()} />);
		const dropZone = screen.getByRole("button", {
			name: "レントゲン画像を選択",
		});

		fireEvent.click(dropZone);
		await screen.findByText("読込中...");
		fireEvent.keyDown(dropZone, { key: "Enter" });

		expect(dropZone.getAttribute("aria-disabled")).toBe("true");
		expect(selectDicomFiles).toHaveBeenCalledOnce();

		resolveRead(new ArrayBuffer(1));
	});
});
