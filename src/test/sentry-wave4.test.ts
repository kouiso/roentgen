import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const sentryInitMock = vi.hoisted(() => vi.fn());
const electronState = vi.hoisted(() => ({
	userDataPath: "",
}));

vi.mock("@sentry/electron/main", () => ({
	init: sentryInitMock,
}));

vi.mock("electron", () => ({
	app: {
		getPath: vi.fn(() => electronState.userDataPath),
	},
}));

vi.mock("electron-log/main", () => ({
	default: {
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
	},
}));

describe("Sentry Wave 4 polish", () => {
	beforeEach(async () => {
		vi.resetModules();
		sentryInitMock.mockReset();
		electronState.userDataPath = await mkdtemp(
			join(tmpdir(), "roentgen-sentry-"),
		);
		process.env.SENTRY_DSN = "https://example@sentry.invalid/1";
	});

	it("S5: does not initialize Sentry when the opt-in flag is absent", async () => {
		const { initSentryIfConsented } = await import("../../electron/sentry");

		await initSentryIfConsented();

		expect(sentryInitMock).not.toHaveBeenCalled();
	});

	it("S5: does not initialize Sentry when the opt-in flag is false", async () => {
		await writeFile(
			join(electronState.userDataPath, "crash-reporter-prefs.json"),
			JSON.stringify({ enabled: false }),
		);
		const { initSentryIfConsented } = await import("../../electron/sentry");

		await initSentryIfConsented();

		expect(sentryInitMock).not.toHaveBeenCalled();
	});
});
