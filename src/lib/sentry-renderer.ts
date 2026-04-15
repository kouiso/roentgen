/**
 * Sentry renderer-side initialization — OPT-IN only
 *
 * Call initSentryRenderer() early in the app lifecycle (e.g. in main.tsx).
 * It checks opt-in status via IPC before initializing the Sentry renderer SDK.
 *
 * IMPORTANT: Never sends DICOM patient data (PII/PHI) to Sentry.
 */

let initialized = false;

export async function initSentryRenderer(): Promise<void> {
	if (initialized) return;

	const api = window.electronAPI;
	if (!api) return; // Not running in Electron

	try {
		const { enabled } = await api.crashReporter.getStatus();
		if (!enabled) return;

		const SentryRenderer = await import("@sentry/electron/renderer");

		SentryRenderer.init({
			// DSN is configured in the main process — renderer forwards events via IPC
			beforeSend(event) {
				// Strip any user PII that might have been auto-collected
				if (event.user) {
					event.user = { id: event.user.id };
				}
				return event;
			},
		});

		initialized = true;
	} catch {
		// Sentry init failure should never break the app
	}
}
