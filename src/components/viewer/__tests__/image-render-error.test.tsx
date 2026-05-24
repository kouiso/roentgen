// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ImageRenderErrorBanner } from "../viewer-pane";

describe("ImageRenderErrorBanner", () => {
	it("shows actionable image render recovery guidance", () => {
		render(
			<ImageRenderErrorBanner message="broken.dcm の画像表示に失敗しました" />,
		);

		expect(screen.getByRole("alert").textContent).toContain(
			"画像表示に失敗しました",
		);
		expect(
			screen.getByText("broken.dcm の画像表示に失敗しました"),
		).toBeTruthy();
		expect(
			screen.getByText(
				"別フレームを選択するか、ファイルを読み込み直してください。",
			),
		).toBeTruthy();
	});
});
