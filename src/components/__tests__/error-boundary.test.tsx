// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ErrorBoundary } from "../error-boundary";

const ThrowingChild = () => {
	throw new Error("viewer failed");
};

describe("ErrorBoundary", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("catches child render errors and shows the reload button", () => {
		vi.spyOn(console, "error").mockImplementation(() => undefined);

		render(
			<ErrorBoundary>
				<ThrowingChild />
			</ErrorBoundary>,
		);

		expect(screen.getByText("ビューアでエラーが発生しました")).toBeTruthy();
		expect(screen.getByText("viewer failed")).toBeTruthy();
		expect(screen.getByRole("button", { name: "再読み込み" })).toBeTruthy();
	});
});
