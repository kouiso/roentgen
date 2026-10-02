// @vitest-environment happy-dom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FileDropZone } from "../file-drop-zone";

describe("FileDropZone", () => {
	it("shows first-run import guidance for supported sources", () => {
		render(<FileDropZone onFilesLoaded={vi.fn()} />);

		// 初めての飼い主が「何をすればいいか」「何ができるか」を専門用語なしで理解できること
		expect(screen.getByText("愛馬のレントゲンを見てみよう")).toBeTruthy();
		expect(
			screen.getByText(
				"CD・USB・メールでもらった「.dcm」ファイルやフォルダに対応",
			),
		).toBeTruthy();
		expect(screen.getByText("自動で見やすく")).toBeTruthy();
		expect(screen.getByText("長さ・角度を測る")).toBeTruthy();
		expect(screen.getByText("メモを残す")).toBeTruthy();
	});
});
