// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FileDropZone } from "../file-drop-zone";

describe("FileDropZone", () => {
	it("shows first-run import guidance for supported DICOM sources", () => {
		render(<FileDropZone onFilesLoaded={vi.fn()} />);

		expect(screen.getByText("対応形式: .dcm / .dicom / DICOMDIR")).toBeTruthy();
		expect(screen.getByText("単体ファイル")).toBeTruthy();
		expect(screen.getByText("フォルダ一括")).toBeTruthy();
		expect(screen.getByText("Drive同期")).toBeTruthy();
	});
});
