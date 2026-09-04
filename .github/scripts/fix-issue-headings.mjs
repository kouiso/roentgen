/**
 * コードフェンス内を維持したまま、Issue本文の見出しだけを一段上げる。
 */
export const fixIssueHeadings = (body) => {
	let fence = null;
	return body
		.split("\n")
		.map((line) => {
			const marker = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
			if (fence !== null) {
				if (
					marker &&
					marker[1][0] === fence.kind &&
					marker[1].length >= fence.length &&
					marker[2].trim() === ""
				) {
					fence = null;
				}
				return line;
			}

			if (marker) {
				fence = { kind: marker[1][0], length: marker[1].length };
				return line;
			}
			if (line.startsWith("#### ")) return line.replace(/^#### /, "### ");
			if (line.startsWith("### ")) return line.replace(/^### /, "## ");
			return line;
		})
		.join("\n");
};
