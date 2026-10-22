import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

const read = (path) =>
	readFileSync(fileURLToPath(new URL(`../../${path}`, import.meta.url)), "utf8");

// ローカルと CI が同じ Node を選べるよう、版の正本を .node-version に置く。
// ここが workflow や engines とずれたら、実行環境の差が回帰に見える前に落とす
const pinned = read(".node-version").trim();
const pinnedMajor = Number(pinned.split(".")[0]);

const parseVersion = (text) => {
	const [major, minor = "0", patch = "0"] = text
		.replace(/^v/, "")
		.split(".")
		.map((part) => (/^[xX*]$/.test(part) ? "0" : part));
	return [Number(major), Number(minor), Number(patch)];
};
const compare = (a, b) => {
	for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] - b[i];
	return 0;
};
// 一つの比較子（>=1.2.3 / ^1.2.3 / 22 など）が version を許すか
const comparatorAllows = (comparator, version) => {
	const [, op, raw] = comparator.match(/^(>=|<=|>|<|=|\^|~)?(.+)$/);
	const base = parseVersion(raw);
	const isPartial = raw.replace(/^v/, "").split(".").length < 3;
	const parts = raw.replace(/^v/, "").split(".");
	if (op === ">=") return compare(version, base) >= 0;
	if (op === ">") return compare(version, base) > 0;
	if (op === "<=") return compare(version, base) <= 0;
	if (op === "<") return compare(version, base) < 0;
	if (op === "^") {
		const upper = base[0] > 0 ? [base[0] + 1, 0, 0] : [0, base[1] + 1, 0];
		return compare(version, base) >= 0 && compare(version, upper) < 0;
	}
	if (op === "~") {
		return (
			compare(version, base) >= 0 &&
			compare(version, [base[0], base[1] + 1, 0]) < 0
		);
	}
	// 演算子なしは「22」「6.*」のような major/minor 指定か完全一致
	if (isPartial || parts.some((p) => /^[xX*]$/.test(p))) {
		return parts.every(
			(p, i) => /^[xX*]$/.test(p) || Number(p) === version[i],
		);
	}
	return compare(version, base) === 0;
};
// "a || b c" 形式の範囲を version が満たすか
const rangeAllows = (range, version) =>
	range.split("||").some((clause) => {
		const normalized = clause
			.trim()
			.replace(/(>=|<=|>|<|=|\^|~)\s+/g, "$1");
		if (normalized === "" || normalized === "*") return true;
		return normalized
			.split(/\s+/)
			.every((comparator) => comparatorAllows(comparator, version));
	});
// engines.node の各節の下限（これより下は宣言上も使わせない版）
const floorsOf = (range) =>
	range.split("||").map((clause) => {
		const floor = clause.trim().match(/\d+(\.\d+){0,2}/)?.[0];
		assert.ok(floor, `cannot read a floor from "${clause}"`);
		return parseVersion(floor);
	});

const lockfileEngines = () => {
	const found = new Map();
	let current = null;
	for (const line of read("pnpm-lock.yaml").split("\n")) {
		const header = line.match(/^ {2}'?([^\s'][^']*?)'?:$/);
		if (header) current = header[1];
		const engines = line.match(/^ {4}engines: \{node: '?([^}']+?)'?[,}]/);
		if (engines && current) found.set(current, engines[1]);
	}
	return found;
};

test(".node-version is a plain major or full version", () => {
	assert.match(pinned, /^\d+(\.\d+){0,2}$/);
});

test("release gate and CI workflows use the pinned Node", () => {
	for (const file of ["ci.yml", "license-check.yml", "release.yml"]) {
		const versions = [
			...read(`.github/workflows/${file}`).matchAll(
				/node-version:\s*"?([\d.]+)"?/g,
			),
		].map((m) => m[1]);
		assert.ok(versions.length > 0, `${file} has no setup-node version`);
		for (const version of versions) {
			assert.equal(version, pinned, `${file} uses Node ${version}`);
		}
	}
});

test("engines.node allows the pinned major", () => {
	const { engines } = JSON.parse(read("package.json"));
	assert.ok(engines?.node, "package.json has no engines.node");
	const allowedMajors = engines.node
		.split("||")
		.map((clause) => Number(clause.trim().match(/\d+/)?.[0]));
	assert.ok(
		allowedMajors.includes(pinnedMajor),
		`engines.node (${engines.node}) excludes ${pinned}`,
	);
});

test("pnpm refuses an unsupported Node instead of failing later", () => {
	assert.match(read(".npmrc"), /^engine-strict=true$/m);
});

// engine-strict の下では、依存が要る Node より下を engines.node が許すと
// 宣言どおりの版で pnpm install が止まる。lockfile の依存側と突き合わせる
test("every Node floor in engines.node satisfies each lockfile dependency", () => {
	const { engines } = JSON.parse(read("package.json"));
	const dependencies = lockfileEngines();
	assert.ok(
		dependencies.size > 100,
		`lockfile engines were not read (${dependencies.size})`,
	);
	const rejected = [];
	for (const floor of floorsOf(engines.node)) {
		for (const [name, range] of dependencies) {
			if (!rangeAllows(range, floor)) {
				rejected.push(`${name} needs ${range}, engines allows ${floor.join(".")}`);
			}
		}
	}
	assert.deepEqual(rejected, []);
});

test("range matcher reads the forms the lockfile uses", () => {
	assert.equal(rangeAllows(">=22.12.0", [20, 20, 2]), false);
	assert.equal(rangeAllows(">=22.12.0", [22, 12, 0]), true);
	assert.equal(rangeAllows("^20.19.0 || ^22.13.0 || >=24.0.0", [22, 12, 9]), false);
	assert.equal(rangeAllows("^20.19.0 || ^22.13.0 || >=24.0.0", [22, 13, 0]), true);
	assert.equal(rangeAllows("18 || 20 || >=22", [24, 0, 0]), true);
	assert.equal(rangeAllows(">=9.3.0 || >=8.10.0 <9.0.0", [8, 9, 0]), false);
	assert.equal(rangeAllows(">= 0.4", [22, 13, 0]), true);
	assert.equal(rangeAllows("6.*", [22, 13, 0]), false);
});
