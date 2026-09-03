import log from "electron-log/main";

// レンダラーのconsole.*とウィンドウのライフサイクル障害をelectron-logへ転送する。
// PHI規約: 患者タグやフルパスはログに書かない（basenameのみ）。

const MAX_TEXT_LENGTH = 2048;
const TRUNCATED_SUFFIX = "…[truncated]";

type RendererLogLevel = "error" | "warn" | "info" | "debug";

type ConsoleMessageEvent =
	Electron.Event<Electron.WebContentsConsoleMessageEventParams>;

export const toLogLevel = (level: string): RendererLogLevel => {
	switch (level) {
		case "error":
		case "info":
		case "debug":
			return level;
		case "warning":
			return "warn";
		default:
			return "info";
	}
};

export const basenameOf = (source: string): string => {
	if (!source) return "";
	const withoutQuery = source.replace(/[?#].*$/, "");
	const segments = withoutQuery.split(/[\\/]/).filter((s) => s.length > 0);
	return segments[segments.length - 1] ?? "";
};

// POSIX: 区切りを1つ以上含む絶対パス / Windows: ドライブレター始まり
const ABSOLUTE_PATH_PATTERN =
	/[A-Za-z]:\\[^\s"'`]+|\/[^\s/"'`]+(?:\/[^\s/"'`]+)+/g;

export const scrubPaths = (text: string): string =>
	text.replace(ABSOLUTE_PATH_PATTERN, (match) => basenameOf(match) || match);

export const sanitizeRendererConsoleMessage = (details: {
	level: string;
	message: string;
	sourceId: string;
	lineNumber: number;
}): { level: RendererLogLevel; text: string } => {
	const full = `[renderer] ${scrubPaths(details.message)} (${basenameOf(details.sourceId)}:${details.lineNumber})`;
	const text =
		full.length > MAX_TEXT_LENGTH
			? `${full.slice(0, MAX_TEXT_LENGTH)}${TRUNCATED_SUFFIX}`
			: full;
	return { level: toLogLevel(details.level), text };
};

export const attachRendererConsoleForwarding = (
	webContents: Electron.WebContents,
): void => {
	webContents.on("console-message", (event: ConsoleMessageEvent) => {
		const { level, text } = sanitizeRendererConsoleMessage({
			level: event.level,
			message: event.message,
			sourceId: event.sourceId,
			lineNumber: event.lineNumber,
		});
		log[level](text);
	});
};

export const attachWindowLifecycleLogging = (
	webContents: Electron.WebContents,
): void => {
	webContents.on(
		"did-fail-load",
		(_event, errorCode, errorDescription, validatedURL) => {
			log.error(
				`[window] did-fail-load code=${errorCode} ${errorDescription} (${basenameOf(validatedURL)})`,
			);
		},
	);
	webContents.on("render-process-gone", (_event, details) => {
		log.error(
			`[window] render-process-gone reason=${details.reason} exitCode=${details.exitCode}`,
		);
	});
	webContents.on("unresponsive", () => {
		log.warn("[window] unresponsive");
	});
	webContents.on("preload-error", (_event, preloadPath, error) => {
		log.error(
			`[window] preload-error (${basenameOf(preloadPath)}): ${error.message}`,
		);
	});
};
