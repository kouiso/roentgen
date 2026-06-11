#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import process from "node:process";

const defaults = {
	releaseDir: "release",
	output: "release/SHA256SUMS.txt",
};

const printHelp = () => {
	console.log(`Roentgen release checksum generator

Usage:
  node scripts/generate-release-checksums.mjs [options]

Options:
  --release-dir <path>  release成果物ディレクトリ (default: release)
  --output <path>       checksum出力ファイル (default: release/SHA256SUMS.txt)
  --help                このヘルプを表示
`);
};

const parseArgs = (argv) => {
	const options = { ...defaults };
	for (let index = 0; index < argv.length; index += 1) {
		const arg = argv[index];
		const next = () => {
			const value = argv[index + 1];
			if (!value || value.startsWith("--")) {
				throw new Error(`${arg} requires a value`);
			}
			index += 1;
			return value;
		};

		switch (arg) {
			case "--release-dir":
				options.releaseDir = next();
				break;
			case "--output":
				options.output = next();
				break;
			case "--help":
			case "-h":
				printHelp();
				process.exit(0);
				break;
			default:
				throw new Error(`Unknown option: ${arg}`);
		}
	}
	return options;
};

const isReleaseArtifact = (fileName) =>
	/\.(appimage|blockmap|dmg|exe)$/i.test(fileName) ||
	/^latest(?:-[a-z0-9]+)?\.ya?ml$/i.test(fileName);

const sha256File = (filePath) =>
	createHash("sha256").update(readFileSync(filePath)).digest("hex");

const run = () => {
	const options = parseArgs(process.argv.slice(2));
	const releaseDir = resolve(options.releaseDir);
	const outputPath = resolve(options.output);

	if (!existsSync(releaseDir)) {
		throw new Error(`Release directory does not exist: ${releaseDir}`);
	}

	const files = readdirSync(releaseDir)
		.filter(isReleaseArtifact)
		.sort((a, b) => a.localeCompare(b));

	if (files.length === 0) {
		throw new Error(`No release artifacts found in: ${releaseDir}`);
	}

	if (dirname(outputPath) !== releaseDir && !existsSync(dirname(outputPath))) {
		throw new Error(`Output directory does not exist: ${dirname(outputPath)}`);
	}

	const rows = files.map((fileName) => {
		const artifactPath = join(releaseDir, fileName);
		return `${sha256File(artifactPath)}  ${fileName}`;
	});

	writeFileSync(outputPath, `${rows.join("\n")}\n`, "utf-8");
	console.log(`Wrote ${rows.length} checksums to ${outputPath}`);
};

run();
