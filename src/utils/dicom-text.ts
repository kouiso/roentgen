// DICOM 文字列タグのデコードと人名整形
// 国内の動物病院の装置は SpecificCharacterSet を "ISO_IR 6"（ASCII）と宣言したまま
// Shift_JIS で馬名・飼い主名を書き込むことがある。dicom-parser の string() は
// 1 バイト = 1 文字で読むため、そのままだと日本語が文字化けする。

const ESC = 0x1b;

const tryDecode = (
	encoding: string,
	bytes: Uint8Array,
	fatal: boolean,
): string | null => {
	try {
		return new TextDecoder(encoding, { fatal }).decode(bytes);
	} catch {
		return null;
	}
};

const isAscii = (bytes: Uint8Array): boolean => {
	for (const byte of bytes) {
		if (byte >= 0x80 || byte === ESC) return false;
	}
	return true;
};

const trimDicomPadding = (value: string): string =>
	value.replace(/[\0\s]+$/u, "").replace(/^\s+/u, "");

export const decodeDicomText = (
	bytes: Uint8Array,
	specificCharacterSet?: string,
): string => {
	const charset = (specificCharacterSet ?? "").toUpperCase();

	if (isAscii(bytes)) {
		return trimDicomPadding(tryDecode("utf-8", bytes, false) ?? "");
	}

	if (charset.includes("ISO_IR 192")) {
		return trimDicomPadding(tryDecode("utf-8", bytes, false) ?? "");
	}

	// ISO 2022 系はエスケープシーケンスで漢字集合を切り替えるため専用デコーダに任せる
	if (bytes.includes(ESC) || charset.includes("2022 IR 87")) {
		const decoded = tryDecode("iso-2022-jp", bytes, true);
		if (decoded !== null) return trimDicomPadding(decoded);
	}

	const latinDeclared = /ISO_IR 1(00|01|09|10|44|48)|ISO_IR 12[67]/u.test(
		charset,
	);
	const candidates = latinDeclared
		? ["utf-8", "windows-1252"]
		: ["utf-8", "shift_jis"];
	for (const encoding of candidates) {
		const decoded = tryDecode(encoding, bytes, true);
		if (decoded !== null) return trimDicomPadding(decoded);
	}

	return trimDicomPadding(tryDecode("windows-1252", bytes, false) ?? "");
};

// PN 型は「アルファベット=漢字=よみ」の 3 グループで、各グループは ^ 区切り。
// 一覧では最初の読めるグループだけを出し、残りは補足として返す。
export type FormattedPersonName = {
	primary: string;
	all: string[];
};

export const formatPersonName = (
	value: string | undefined | null,
): FormattedPersonName | null => {
	if (!value) return null;
	const groups = value
		.split("=")
		.map((group) => group.replace(/\^+/gu, " ").replace(/\s+/gu, " ").trim())
		.filter((group) => group.length > 0);
	const unique = Array.from(new Set(groups));
	const [primary] = unique;
	if (!primary) return null;
	return { primary, all: unique };
};

export const formatPersonNameText = (
	value: string | undefined | null,
): string => formatPersonName(value)?.all.join(" / ") ?? "";
