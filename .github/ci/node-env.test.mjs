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
