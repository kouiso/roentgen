import assert from "node:assert/strict";
import test from "node:test";

import { fixIssueHeadings } from "./fix-issue-headings.mjs";

test("通常のH3とH4だけを一段上げる", () => {
	assert.equal(fixIssueHeadings("### A\n#### B\n## C"), "## A\n### B\n## C");
});

test("コードフェンス内の見出しを変更しない", () => {
	const body = "### A\n```js\n### code\n```\n#### B";
	assert.equal(fixIssueHeadings(body), "## A\n```js\n### code\n```\n### B");
});

test("開始より短いマーカーではフェンスを閉じない", () => {
	const body = "````md\n```\n### code\n````\n### outside";
	assert.equal(fixIssueHeadings(body), "````md\n```\n### code\n````\n## outside");
});

test("末尾に文字があるマーカーではフェンスを閉じない", () => {
	const body = "~~~\n~~~not-close\n### code\n~~~\n### outside";
	assert.equal(fixIssueHeadings(body), "~~~\n~~~not-close\n### code\n~~~\n## outside");
});
