// @vitest-environment happy-dom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AnnotationSaveStatusBadge } from "../dicom-viewer";

describe("AnnotationSaveStatusBadge", () => {
	it("does not render while idle", () => {
		render(<AnnotationSaveStatusBadge status="idle" />);

		expect(screen.queryByRole("status")).toBeNull();
	});

	it("shows a pending save status", () => {
		render(<AnnotationSaveStatusBadge status="pending" />);

		const status = screen.getByRole("status");
		expect(status.textContent).toBe("注釈を保存中");
		expect(status.getAttribute("aria-live")).toBe("polite");
	});

	it("shows a saved status", () => {
		render(<AnnotationSaveStatusBadge status="saved" />);

		expect(screen.getByRole("status").textContent).toBe("注釈を保存しました");
	});

	it("shows a failed save status", () => {
		render(<AnnotationSaveStatusBadge status="error" />);

		expect(screen.getByRole("status").textContent).toBe(
			"注釈の保存に失敗しました",
		);
	});
});
