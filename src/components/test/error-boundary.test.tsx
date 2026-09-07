// @vitest-environment happy-dom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ErrorBoundary } from "../error-boundary";

const ThrowingChild = () => {
	throw new Error("viewer failed");
};

describe("ErrorBoundary", () => {
	let clipboardDescriptor: PropertyDescriptor | undefined;

	beforeEach(() => {
		clipboardDescriptor = Object.getOwnPropertyDescriptor(
			navigator,
			"clipboard",
		);
	});

	afterEach(() => {
		vi.restoreAllMocks();
		if (clipboardDescriptor) {
			Object.defineProperty(navigator, "clipboard", clipboardDescriptor);
		} else {
			Reflect.deleteProperty(navigator, "clipboard");
		}
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

	it("copies error diagnostics with stack details", async () => {
		vi.spyOn(console, "error").mockImplementation(() => undefined);
		const writeText = vi.fn().mockResolvedValue(undefined);
		Object.defineProperty(navigator, "clipboard", {
			configurable: true,
			value: { writeText },
		});

		render(
			<ErrorBoundary>
				<ThrowingChild />
			</ErrorBoundary>,
		);

		fireEvent.click(screen.getByRole("button", { name: "詳細をコピー" }));

		await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
		expect(writeText).toHaveBeenCalledWith(
			expect.stringContaining("Message: viewer failed"),
		);
		expect(writeText).toHaveBeenCalledWith(expect.stringContaining("Stack:\n"));
		expect(writeText).toHaveBeenCalledWith(
			expect.stringContaining("Component stack:\n"),
		);
		expect(
			await screen.findByText("エラー詳細をクリップボードにコピーしました"),
		).toBeTruthy();
	});
});
