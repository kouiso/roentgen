import log from "electron-log/main";

// レンダラーのconsole.*とウィンドウのライフサイクル障害をelectron-logへ転送する。
// PHI規約: 患者タグやフルパスはログに書かない（basenameのみ）。

const MAX_TEXT_LENGTH = 2048;
const MAX_PERSISTED_TEXT_LENGTH = 8192;
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
const PATH_SEGMENT = `[^\\s/\\\\"'\`:]+`;
const SPACED_SEGMENT = `${PATH_SEGMENT}(?:[ \\t]+${PATH_SEGMENT})*`;
const DICOM_PATH_SEGMENT = `[^\\s/\\\\"'\`]+`;
const DICOM_SPACED_SEGMENT = `${DICOM_PATH_SEGMENT}(?:[ \\t]+${DICOM_PATH_SEGMENT})*`;
// 区切り側を列挙するとformat文字などを漏らすため、ファイル名が続く場合だけ除外する。
const DICOM_BOUNDARY = "(?![\\p{L}\\p{N}_])";
const DICOM_URL_PATH_PATTERN = /\.(?:dcm|dicom)(?![\p{L}\p{N}_])/iu;
const TRAILING_URL_BOUNDARY_PATTERN = /[\p{P}\p{S}]+$/u;
// 区切りは1つ以上。ログには `C:\\Users\\...` のようにエスケープ済みの
// バックスラッシュがそのまま載ることがあり (JSON化されたエラーなど)、
// 1つ固定にすると Windows パスを取りこぼす。
const ABSOLUTE_PATH_PATTERN = new RegExp(
	[
		`[A-Za-z]:\\\\+(?:${SPACED_SEGMENT}\\\\+)*${PATH_SEGMENT}`,
		`/+(?:${SPACED_SEGMENT}/+)*${SPACED_SEGMENT}/+${PATH_SEGMENT}`,
	].join("|"),
	"g",
);

const DICOM_PATH_PATTERN = new RegExp(
	`(?:[A-Za-z]:[\\\\/]+|\\\\\\\\+|(?:\\.\\.?[\\\\/]+)+|(?<!\\S)[\\\\/]+)(?:${DICOM_SPACED_SEGMENT}[\\\\/]+)*${DICOM_SPACED_SEGMENT}\\.(?:dcm|dicom)${DICOM_BOUNDARY}`,
	"giu",
);
const DICOM_RELATIVE_PATH_PATTERN = new RegExp(
	`(?<!\\S)${DICOM_PATH_SEGMENT}(?:[ \\t]+${DICOM_PATH_SEGMENT})?[\\\\/]+(?:${DICOM_SPACED_SEGMENT}[\\\\/]+)*${DICOM_SPACED_SEGMENT}\\.(?:dcm|dicom)${DICOM_BOUNDARY}`,
	"giu",
);
const DICOM_BASENAME_PATTERN = new RegExp(
	`[^\\s"'(),;{}[\\]]+\\.(?:dcm|dicom)${DICOM_BOUNDARY}`,
	"giu",
);
const URL_PATTERN = /https?:\/\/[^\s"'<>]+/gi;
const URL_MARKER_PATTERN = /__LOG_URL_(\d+)__/g;
const JSON_MEMBER_PATTERN =
	/("((?:\\.|[^"\\])*)"\s*:\s*)("(?:\\.|[^"\\])*"|[^,}\]\s]+)/gu;
const SECRET_KEY_SOURCE =
	"x-figma-token|token|(?:access|refresh|id|api|auth)[_-]?token|client[_-]?secret|secret|password|passwd|api[_-]?key|authorization|cookie|set-cookie";

const normalizeKey = (key: string): string =>
	key.replace(/([a-z\d])([A-Z])/g, "$1_$2").toLowerCase();
const isSecretKey = (key: string): boolean => {
	const normalized = normalizeKey(key);
	return (
		/^(?:x-figma-token|token|(?:access|refresh|id|api|auth)[_-]?token|client[_-]?secret|secret|password|passwd|api[_-]?key|authorization|cookie|set-cookie)$/.test(
			normalized,
		) || /(?:^|[_-])token(?:$|[_-])/.test(normalized)
	);
};
const isPhiKey = (key: string): boolean =>
	/^(?:patientname|patientid|patient_name|patient_id|studyuid|study_uid)$/i.test(
		normalizeKey(key),
	);

const redactJsonFields = (
	text: string,
	predicate: (key: string) => boolean,
	replacement: string,
): string =>
	text.replace(JSON_MEMBER_PATTERN, (match, prefix, encodedKey) => {
		try {
			const key: unknown = JSON.parse(`"${encodedKey}"`);
			return typeof key === "string" && predicate(key)
				? `${prefix}${JSON.stringify(replacement)}`
				: match;
		} catch {
			return match;
		}
	});

const sanitizeUrl = (raw: string): string => {
	let rawUrl: URL;
	try {
		rawUrl = new URL(raw);
		let pathname = rawUrl.pathname;
		try {
			pathname = decodeURIComponent(pathname);
		} catch {
			// 壊れたpercent encodingでも、未encodeの拡張子は安全側で判定する。
		}
		if (DICOM_URL_PATH_PATTERN.test(pathname)) return "[DICOM]";
	} catch {
		return raw;
	}
	const trailing = TRAILING_URL_BOUNDARY_PATTERN.exec(raw)?.[0] ?? "";
	const candidate = trailing ? raw.slice(0, -trailing.length) : raw;
	try {
		const url = trailing ? new URL(candidate) : rawUrl;
		let changed = false;
		if (url.password) {
			url.password = "***";
			changed = true;
		}
		for (const key of new Set(url.searchParams.keys())) {
			if (!isSecretKey(key)) continue;
			url.searchParams.set(key, "***");
			changed = true;
		}
		return changed ? `${url.toString()}${trailing}` : raw;
	} catch {
		return raw;
	}
};

const transformOutsideUrls = (
	text: string,
	transform: (value: string) => string,
): string => {
	const urls: string[] = [];
	const protectedText = text.replace(URL_PATTERN, (raw) => {
		const safe = sanitizeUrl(raw);
		urls.push(safe);
		return `__LOG_URL_${urls.length - 1}__`;
	});
	return transform(protectedText).replace(
		URL_MARKER_PATTERN,
		(_marker, index) => urls[Number(index)] ?? "[URL]",
	);
};

export const scrubPaths = (text: string): string =>
	transformOutsideUrls(text, (value) =>
		value.replace(ABSOLUTE_PATH_PATTERN, (match) => basenameOf(match) || match),
	);

const redactKeyValue = (
	text: string,
	keys: string,
	replacement: string,
	allowSpaces = false,
): string =>
	text.replace(
		new RegExp(
			`(["']?(?:${keys})["']?\\s*[:=]\\s*)(?:"(?:\\\\.|[^"\\\\])*"|'(?:\\\\.|[^'\\\\])*'|${allowSpaces ? "[^,;}&\\n]+" : "[^\\s,;}&]+"})`,
			"giu",
		),
		`$1${replacement}`,
	);

export const redactSecrets = (text: string): string =>
	redactKeyValue(
		redactJsonFields(text, isSecretKey, "***")
			.replace(/figd_[A-Za-z0-9_-]+/gi, "figd_***")
			.replace(/\b(?:gh[pousr]|github_pat)_[A-Za-z0-9_]+\b/gi, "[REDACTED]")
			.replace(
				/(["']?authorization["']?\s*[:=]\s*)(?:Bearer|Basic)\s+[^\s,;}&]+/giu,
				"$1***",
			)
			.replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer ***"),
		SECRET_KEY_SOURCE,
		"***",
	);

export const sanitizeLogText = (text: string): string => {
	const withoutFields = redactKeyValue(
		redactJsonFields(redactSecrets(text), isPhiKey, "[PHI]"),
		"PatientName|PatientID|patientName|patientId|studyUid",
		"[PHI]",
		true,
	);
	const sanitized = transformOutsideUrls(withoutFields, (value) =>
		value
			.replace(DICOM_PATH_PATTERN, "[DICOM]")
			.replace(DICOM_RELATIVE_PATH_PATTERN, "[DICOM]")
			.replace(DICOM_BASENAME_PATTERN, "[DICOM]")
			.replace(ABSOLUTE_PATH_PATTERN, (match) => basenameOf(match) || match)
			.replace(/(?<![\d.])(?:\d+\.){2,}\d+(?![\d.])/g, "[UID]"),
	);
	return sanitized.length > MAX_PERSISTED_TEXT_LENGTH
		? `${sanitized.slice(0, MAX_PERSISTED_TEXT_LENGTH - TRUNCATED_SUFFIX.length)}${TRUNCATED_SUFFIX}`
		: sanitized;
};

export const serializeLogArgument = (value: unknown): string => {
	try {
		if (typeof value === "string") return value;
		if (value instanceof Error) return value.stack ?? value.message;
		const serialized = JSON.stringify(value);
		if (serialized !== undefined) return serialized;
	} catch {
		// 循環参照や例外を投げる Proxy は String へフォールバックする。
	}
	try {
		return String(value);
	} catch {
		return "[unserializable]";
	}
};

export const sanitizeLogArgument = (value: unknown): string =>
	sanitizeLogText(serializeLogArgument(value));

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
