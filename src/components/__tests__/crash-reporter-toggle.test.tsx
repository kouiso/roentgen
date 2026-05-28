// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CrashReporterToggle } from "../crash-reporter-toggle";

const setElectronAPI = ({
	enabled,
	requiresRestart,
}: {
	enabled: boolean;
	requiresRestart?: boolean;
}) => {
	const getStatus = vi.fn().mockResolvedValue({ enabled });
	const setEnabled = vi.fn().mockResolvedValue({
		enabled: !enabled,
		requiresRestart: requiresRestart ?? false,
	});

	Object.defineProperty(window, "electronAPI", {
		configurable: true,
		value: {
			crashReporter: {
				getStatus,
				setEnabled,
			},
		},
	});

	return { getStatus, setEnabled };
};

describe("CrashReporterToggle", () => {
	afterEach(() => {
		vi.restoreAllMocks();
		Object.defineProperty(window, "electronAPI", {
			configurable: true,
			value: undefined,
		});
	});

	it("exposes a stable accessible toggle state", async () => {
		setElectronAPI({ enabled: true });
		render(<CrashReporterToggle />);

		const toggle = await screen.findByRole("button", {
			name: "クラッシュレポート設定",
		});

		expect(toggle.getAttribute("aria-pressed")).toBe("true");
		expect(screen.getByText("レポート有効")).toBeTruthy();
	});

	it("toggles crash reporting through the Electron bridge", async () => {
		const { setEnabled } = setElectronAPI({ enabled: false });
		render(<CrashReporterToggle />);

		const toggle = await screen.findByRole("button", {
			name: "クラッシュレポート設定",
		});
		fireEvent.click(toggle);

		await waitFor(() => {
			expect(setEnabled).toHaveBeenCalledWith(true);
		});
		expect(toggle.getAttribute("aria-pressed")).toBe("true");
		expect(screen.getByText("レポート有効")).toBeTruthy();
	});

	it("keeps the stable name when disabling requires restart", async () => {
		setElectronAPI({ enabled: true, requiresRestart: true });
		render(<CrashReporterToggle />);

		const toggle = await screen.findByRole("button", {
			name: "クラッシュレポート設定",
		});
		fireEvent.click(toggle);

		await screen.findByText("要再起動");
		expect(toggle.getAttribute("aria-pressed")).toBe("false");
		expect(
			screen.getByRole("button", { name: "クラッシュレポート設定" }),
		).toBeTruthy();
	});
});
