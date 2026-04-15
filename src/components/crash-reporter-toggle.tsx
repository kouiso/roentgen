import { ShieldCheck, ShieldOff } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

/**
 * OPT-IN toggle for Sentry crash reporting.
 *
 * Shows current consent status and lets the user toggle it.
 * Changes that disable an active Sentry session require an app restart.
 */
export const CrashReporterToggle = () => {
	const [enabled, setEnabled] = useState<boolean | null>(null);
	const [requiresRestart, setRequiresRestart] = useState(false);

	useEffect(() => {
		window.electronAPI?.crashReporter
			.getStatus()
			.then(({ enabled: e }) => setEnabled(e))
			.catch(() => setEnabled(false));
	}, []);

	const toggle = useCallback(async () => {
		const api = window.electronAPI;
		if (!api || enabled === null) return;

		const result = await api.crashReporter.setEnabled(!enabled);
		setEnabled(result.enabled);
		setRequiresRestart(result.requiresRestart);
	}, [enabled]);

	if (enabled === null) return null;

	return (
		<button
			type="button"
			onClick={toggle}
			className="chip transition-colors hover:border-white/10 hover:text-zinc-200"
			title={
				requiresRestart
					? "再起動後にクラッシュレポートが無効化されます"
					: enabled
						? "クラッシュレポート: 有効（クリックで無効化）"
						: "クラッシュレポート: 無効（クリックで有効化）"
			}
		>
			{enabled ? (
				<ShieldCheck size={11} className="text-emerald-400" />
			) : (
				<ShieldOff size={11} className="text-zinc-500" />
			)}
			<span className="font-sans">
				{requiresRestart
					? "要再起動"
					: enabled
						? "レポート有効"
						: "レポート無効"}
			</span>
		</button>
	);
};
