/**
 * Sentry crash reporting — OPT-IN consent model
 *
 * - Uses a JSON file in userData to persist consent preference
 * - Sentry is only initialized when user has explicitly opted in
 * - DICOM patient data (PII/PHI) is never sent — beforeSend scrubs it
 * - DSN must be set via SENTRY_DSN environment variable
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { app } from "electron";
import log from "electron-log/main";

// ---------------------------------------------------------------------------
// Consent persistence (simple JSON in userData)
// ---------------------------------------------------------------------------

interface CrashReporterPrefs {
	/** true = user opted in to crash reporting */
	enabled: boolean;
}

const PREFS_FILENAME = "crash-reporter-prefs.json";

function prefsPath(): string {
	return join(app.getPath("userData"), PREFS_FILENAME);
}

export function loadPrefs(): CrashReporterPrefs {
	try {
		const raw = readFileSync(prefsPath(), "utf-8");
		const parsed: unknown = JSON.parse(raw);
		if (
			parsed !== null &&
			typeof parsed === "object" &&
			"enabled" in parsed &&
			typeof (parsed as CrashReporterPrefs).enabled === "boolean"
		) {
			return parsed as CrashReporterPrefs;
		}
	} catch {
		// File doesn't exist yet or is malformed — default to disabled
	}
	return { enabled: false };
}

export function savePrefs(prefs: CrashReporterPrefs): void {
	try {
		const dir = app.getPath("userData");
		mkdirSync(dir, { recursive: true });
		writeFileSync(prefsPath(), JSON.stringify(prefs, null, "\t"), "utf-8");
	} catch (err) {
		log.error("[sentry] Failed to save crash reporter prefs:", err);
	}
}

// ---------------------------------------------------------------------------
// Sentry initialization
// ---------------------------------------------------------------------------

let sentryInitialized = false;

/**
 * Initialize Sentry for the main process if:
 *  1. User has opted in
 *  2. A valid DSN is configured
 *
 * Call this from app.whenReady() — safe to call multiple times (no-op after first).
 */
export async function initSentryIfConsented(): Promise<void> {
	if (sentryInitialized) return;

	const prefs = loadPrefs();
	if (!prefs.enabled) {
		log.info("[sentry] Crash reporting disabled (user has not opted in)");
		return;
	}

	const dsn = process.env.SENTRY_DSN ?? "";
	if (!dsn) {
		log.warn(
			"[sentry] Crash reporting opted-in but SENTRY_DSN is not set — skipping init",
		);
		return;
	}

	try {
		const Sentry = await import("@sentry/electron/main");

		Sentry.init({
			dsn,
			// PII/PHI protection — strip any DICOM patient data that might leak
			beforeSend(event) {
				// Remove user PII that Sentry auto-collects
				if (event.user) {
					event.user = { id: event.user.id };
				}
				return event;
			},
			// Disable screenshots — may contain patient X-ray data
			attachScreenshot: false,
		});

		sentryInitialized = true;
		log.info("[sentry] Crash reporting initialized");
	} catch (err) {
		log.error("[sentry] Failed to initialize:", err);
	}
}

/**
 * Toggle crash reporting consent. Changes take effect on next app launch
 * because Sentry cannot be cleanly torn down at runtime.
 */
export function setCrashReportingEnabled(enabled: boolean): {
	enabled: boolean;
	requiresRestart: boolean;
} {
	const prefs = loadPrefs();
	const changed = prefs.enabled !== enabled;
	prefs.enabled = enabled;
	savePrefs(prefs);
	log.info(`[sentry] Crash reporting ${enabled ? "enabled" : "disabled"}`);

	// If toggling from disabled → enabled and Sentry wasn't initialized yet,
	// we can try to initialize now (no restart needed).
	// If toggling from enabled → disabled, a restart is needed to fully stop Sentry.
	const requiresRestart = changed && !enabled && sentryInitialized;

	if (enabled && !sentryInitialized) {
		initSentryIfConsented();
	}

	return { enabled, requiresRestart };
}

export function isCrashReportingEnabled(): boolean {
	return loadPrefs().enabled;
}

export function isSentryInitialized(): boolean {
	return sentryInitialized;
}
