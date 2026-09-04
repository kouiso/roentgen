import log from "electron-log/main";

// レンダラーのconsole.*とウィンドウのライフサイクル障害をelectron-logへ転送する。
// PHI規約: 患者タグやフルパスはログに書かない（basenameのみ）。

const MAX_TEXT_LENGTH = 2048;
// ERR_ABORTED — 遷移のキャンセルで出るだけで障害ではない。
const ABORTED_ERROR_CODE = -3;
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

// POSIX: 区切りを1つ以上含む絶対パス / Windows: ドライブレター始まり。
// 中間セグメントは空白を許す — 患者フォルダ名に空白が入っていても
// ("/Users/x/患者 太郎/img.dcm") パス全体を1つとして拾い、basename だけ残すため。
// 末尾 (basename) は空白を許さない。許すと後続の語や次のパスまで飲み込み、
// メッセージが壊れる。
const PATH_SEGMENT = `[^\\s/\\\\"'\`]+`;
const SPACED_SEGMENT = `${PATH_SEGMENT}(?:[ \\t]+${PATH_SEGMENT})*`;
const ABSOLUTE_PATH_PATTERN = new RegExp(
	[
		// UNC (\\\\server\\share\\...): Windows の共有に置いた DICOM でよく使う形。
		// ドライブレターより先に見る (先に見ないと後続の分岐が途中まで食う)。
		`\\\\{2,}(?:${SPACED_SEGMENT}\\\\+)*${PATH_SEGMENT}`,
		`[A-Za-z]:\\\\+(?:${SPACED_SEGMENT}\\\\+)*${PATH_SEGMENT}`,
		`/+(?:${SPACED_SEGMENT}/+)*${SPACED_SEGMENT}/+${PATH_SEGMENT}`,
	].join("|"),
	"g",
);

export const scrubPaths = (text: string): string =>
	text.replace(ABSOLUTE_PATH_PATTERN, (match) => basenameOf(match) || match);

export const redactSecrets = (text: string): string =>
	text
		.replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/g, "Bearer ***")
		.replace(/\b(?:gh[pousr]|github_pat)_[A-Za-z0-9_]+\b/g, "[REDACTED]");

export const sanitizeLogText = (text: string): string =>
	redactSecrets(scrubPaths(text));

export const sanitizeRendererConsoleMessage = (details: {
	level: string;
	message: string;
	sourceId: string;
	lineNumber: number;
}): { level: RendererLogLevel; text: string } => {
	const full = `[renderer] ${sanitizeLogText(details.message)} (${basenameOf(details.sourceId)}:${details.lineNumber})`;
	const text =
		full.length > MAX_TEXT_LENGTH
			? `${full.slice(0, MAX_TEXT_LENGTH - TRUNCATED_SUFFIX.length)}${TRUNCATED_SUFFIX}`
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
			// ERR_ABORTED (-3) はリダイレクトや遷移キャンセルで普通に出る。
			// error として数えると logs:digest の件数が実害のない行で埋まる。
			if (errorCode === ABORTED_ERROR_CODE) return;
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
			`[window] preload-error (${basenameOf(preloadPath)}): ${sanitizeLogText(error.message)}`,
		);
	});
};
