// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FileDropZone } from "../file-drop-zone";

describe("FileDropZone", () => {
	it("shows first-run import guidance for supported sources", () => {
		render(<FileDropZone onFilesLoaded={vi.fn()} />);

		expect(
			screen.getByText("病院でもらったレントゲンファイル（.dcm）に対応"),
		).toBeTruthy();
		expect(screen.getByText("骨格解析")).toBeTruthy();
		expect(screen.getByText("精密計測")).toBeTruthy();
		expect(screen.getByText("Drive同期")).toBeTruthy();
	});
});
