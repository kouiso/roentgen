#!/usr/bin/env node
import { createHash, createHmac, randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import {
	basename,
	dirname,
	extname,
	join,
	relative,
	resolve,
} from "node:path";
import { performance } from "node:perf_hooks";
import process from "node:process";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const dicomParser = require("dicom-parser");

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..");

const defaults = {
	dicomDir: "public",
	iterations: 30,
	warmup: 3,
	maxP95Ms: 250,
	maxRssGrowthMb: 96,
	output: "",
};

const WSL_PERF_SOAK_REFUSAL_MESSAGE =
	"Refusing to run ROENTGEN performance soak in WSL. WSL is limited to lint, typecheck, unit tests, and renderer headless E2E; run performance soak on CI or macmini-lan.";

const isWslHost = () => {
	try {
		return readFileSync("/proc/sys/kernel/osrelease", "utf-8")
			.toLowerCase()
			.includes("microsoft");
	} catch {
		return false;
	}
};

const printHelp = () => {
	console.log(`Roentgen DICOM performance soak

Usage:
  node --expose-gc scripts/perf-soak.mjs [options]

Options:
  --dicom-dir <path>          DICOMを再帰検索するディレクトリ (default: public)
  --iterations <number>      計測ループ回数 (default: 30)
  --warmup <number>          ウォームアップ回数 (default: 3)
  --max-p95-ms <number>      1ファイルparse p95の上限ms (default: 250)
  --max-rss-growth-mb <num>  RSS peak増加量の上限MiB (default: 96)
  --output <path>            Markdown証跡の出力先
  --help                     このヘルプを表示
`);
};

const readNumberOption = (value, name) => {
	const parsed = Number(value);
	if (!Number.isFinite(parsed) || parsed < 0) {
		throw new Error(`${name} must be a non-negative number: ${value}`);
	}
	return parsed;
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
			case "--dicom-dir":
				options.dicomDir = next();
				break;
			case "--iterations":
				options.iterations = readNumberOption(next(), arg);
				break;
			case "--warmup":
				options.warmup = readNumberOption(next(), arg);
				break;
			case "--max-p95-ms":
				options.maxP95Ms = readNumberOption(next(), arg);
				break;
			case "--max-rss-growth-mb":
				options.maxRssGrowthMb = readNumberOption(next(), arg);
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

	if (options.iterations < 1) {
		throw new Error("--iterations must be at least 1");
	}

	return options;
};

const formatTokyoDate = (date) =>
	new Intl.DateTimeFormat("en-CA", {
		timeZone: "Asia/Tokyo",
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	}).format(date);

const formatMs = (value) => `${value.toFixed(2)} ms`;
const formatMb = (value) => `${value.toFixed(2)} MiB`;

const mb = (bytes) => bytes / 1024 / 1024;

const sha256 = (buffer) =>
	createHash("sha256").update(buffer).digest("hex");

// パス匿名化ラベルは実行ごとに使い捨てのランダム鍵でHMAC化する（レポートには鍵を残さない）。
// 無塩のsha256だと、患者名/馬名の候補を総当たりしてハッシュを突き合わせれば元パスを
// 復元できてしまう — これはPHI/馬名を公開レポートから隠す目的そのものを無効化する。
const pathRedactionKey = randomBytes(32);
const redactPath = (value) =>
	createHmac("sha256", pathRedactionKey).update(Buffer.from(value)).digest("hex").slice(0, 12);

const isDicomFileName = (filePath) => {
	const extension = extname(filePath).toLowerCase();
	return extension === ".dcm" || extension === ".dicom";
};

// public/corrupt-fixture はDICOMマジックバイトを意図的に欠いた回帰テスト用データ
// なので、性能計測のデフォルトスキャン対象からは除外する（含めると assertDicomMagic が
// 必ず例外を投げ、pnpm perf:soak がデフォルト引数のままでは完走できなくなる）。
// ディレクトリ名ではなく絶対パスで照合する — 名前だけで除外すると、
// 任意の --dicom-dir 配下にたまたま同名のディレクトリがあった場合、
// そこに含まれる正当なDICOMデータまで計測対象から漏れてしまう。
const EXCLUDED_DIR_PATHS = new Set([resolve(repoRoot, "public/corrupt-fixture")]);

const listDicomFiles = async (rootDir) => {
	const found = [];

	const walk = async (dir) => {
		const entries = await readdir(dir, { withFileTypes: true });
		entries.sort((a, b) => a.name.localeCompare(b.name));

		for (const entry of entries) {
			const entryPath = join(dir, entry.name);
			if (entry.isDirectory() && EXCLUDED_DIR_PATHS.has(resolve(entryPath))) {
				continue;
			}
			if (entry.isDirectory()) {
				await walk(entryPath);
				continue;
			}
			if (entry.isFile() && isDicomFileName(entry.name)) {
				found.push(entryPath);
			}
		}
	};

	await walk(rootDir);
	return found;
};

const assertDicomMagic = (filePath, buffer) => {
	const marker = buffer.subarray(128, 132).toString("ascii");
	if (buffer.byteLength < 132 || marker !== "DICM") {
		throw new Error(`${filePath} is not a Part 10 DICOM file`);
	}
};

const parseDicomBuffer = (buffer) => {
	const bytes = new Uint8Array(
		buffer.buffer,
		buffer.byteOffset,
		buffer.byteLength,
	);
	return dicomParser.parseDicom(bytes);
};

const metadataFromDataSet = (dataSet) => ({
	rows: dataSet.uint16("x00280010") ?? 0,
	columns: dataSet.uint16("x00280011") ?? 0,
	frames: Number.parseInt(dataSet.string("x00280008") ?? "1", 10) || 1,
	transferSyntax: dataSet.string("x00020010")?.trim() || "unknown",
	modality: dataSet.string("x00080060")?.trim() || "unknown",
});

// Math.max(...values) はvaluesが大きいとエンジンの引数上限を超えて例外になるため使わない
const maxOf = (values) => values.reduce((a, b) => (b > a ? b : a), -Infinity);

const percentile = (values, percentileValue) => {
	if (values.length === 0) return 0;
	const sorted = [...values].sort((a, b) => a - b);
	const rank = Math.ceil((percentileValue / 100) * sorted.length) - 1;
	const index = Math.min(Math.max(rank, 0), sorted.length - 1);
	return sorted[index];
};

const mean = (values) =>
	values.length === 0
		? 0
		: values.reduce((sum, value) => sum + value, 0) / values.length;

const rssMb = () => mb(process.memoryUsage().rss);
const heapMb = () => mb(process.memoryUsage().heapUsed);

const run = async () => {
	const options = parseArgs(process.argv.slice(2));
	if (isWslHost()) {
		throw new Error(WSL_PERF_SOAK_REFUSAL_MESSAGE);
	}
	const startedAt = new Date();
	const date = formatTokyoDate(startedAt);
	const dicomRoot = resolve(repoRoot, options.dicomDir);

	if (!existsSync(dicomRoot)) {
		throw new Error(`DICOM directory does not exist: ${dicomRoot}`);
	}

	const filePaths = await listDicomFiles(dicomRoot);
	if (filePaths.length === 0) {
		throw new Error(`No DICOM files found in: ${dicomRoot}`);
	}

	const files = [];
	for (const filePath of filePaths) {
		const buffer = await readFile(filePath);
		assertDicomMagic(filePath, buffer);
		const dataSet = parseDicomBuffer(buffer);
		files.push({
			filePath,
			relativePath: relative(repoRoot, filePath),
			buffer,
			sizeBytes: buffer.byteLength,
			sha256: sha256(buffer),
			...metadataFromDataSet(dataSet),
		});
	}

	const timedParse = (file) => {
		const start = performance.now();
		const dataSet = parseDicomBuffer(file.buffer);
		const elapsedMs = performance.now() - start;
		// 主要タグに触れて、parse結果が実際に利用可能であることを確認する。
		const rows = dataSet.uint16("x00280010");
		const columns = dataSet.uint16("x00280011");
		if (!rows || !columns) {
			throw new Error(`${file.relativePath} is missing Rows/Columns tags`);
		}
		return elapsedMs;
	};

	for (let loop = 0; loop < options.warmup; loop += 1) {
		for (const file of files) timedParse(file);
	}

	if (global.gc) global.gc();
	const rssStartMb = rssMb();
	const heapStartMb = heapMb();
	const rssSamplesMb = [rssStartMb];
	const parseSamplesMs = [];

	for (let loop = 0; loop < options.iterations; loop += 1) {
		for (const file of files) {
			parseSamplesMs.push(timedParse(file));
		}
		if (global.gc && (loop + 1) % 5 === 0) global.gc();
		rssSamplesMb.push(rssMb());
	}

	if (global.gc) global.gc();
	const rssEndMb = rssMb();
	const heapEndMb = heapMb();
	const rssPeakMb = maxOf([...rssSamplesMb, rssEndMb]);
	const p50Ms = percentile(parseSamplesMs, 50);
	const p95Ms = percentile(parseSamplesMs, 95);
	const maxMs = maxOf(parseSamplesMs);
	const avgMs = mean(parseSamplesMs);
	const rssPeakGrowthMb = Math.max(0, rssPeakMb - rssStartMb);
	const rssEndGrowthMb = rssEndMb - rssStartMb;
	const passed =
		p95Ms <= options.maxP95Ms &&
		rssPeakGrowthMb <= options.maxRssGrowthMb;

	const outputPath = resolve(
		repoRoot,
		options.output || `docs/verification/${date}/perf-soak.md`,
	);
	// ファイルパス（ファイル名に患者名等が含まれ得る）はPHIとして扱い、公開リポジトリに
	// コミットされるこのレポートには残さない。代わりにパスのハッシュで匿名化した識別子を使う。
	// --dicom-dir 自体も患者/馬名を含むディレクトリ名を指し得るため、同様にハッシュ化する。
	const dicomDirLabel = `<dicom-dir-${redactPath(options.dicomDir)}>`;
	const artifactRows = files
		.map(
			(file) =>
				`| \`dicom-${redactPath(file.relativePath)}\` | ${file.sizeBytes} | \`${file.sha256}\` | ${file.rows}x${file.columns} | ${file.frames} | ${file.transferSyntax} |`,
		)
		.join("\n");

	const markdown = `# Performance Soak Evidence - ${date}

## 判定

| 項目 | 結果 |
|---|---|
| 総合判定 | ${passed ? "PASS" : "FAIL"} |
| parse p95 | ${formatMs(p95Ms)} / 上限 ${formatMs(options.maxP95Ms)} |
| RSS peak増加 | ${formatMb(rssPeakGrowthMb)} / 上限 ${formatMb(options.maxRssGrowthMb)} |
| サンプル数 | ${parseSamplesMs.length} parse (${files.length} file x ${options.iterations} loops) |

## 実行環境

| 項目 | 値 |
|---|---|
| 実行日時 | ${startedAt.toISOString()} |
| OS | ${os.type()} ${os.release()} ${os.arch()} |
| Node.js | ${process.version} |
| GC | ${global.gc ? "enabled (--expose-gc)" : "disabled"} |
| コマンド | \`node${global.gc ? " --expose-gc" : ""} scripts/${basename(
		fileURLToPath(import.meta.url),
	)} --dicom-dir ${dicomDirLabel} --iterations ${options.iterations} --warmup ${options.warmup} --max-p95-ms ${options.maxP95Ms} --max-rss-growth-mb ${options.maxRssGrowthMb} --output ${relative(
		repoRoot,
		outputPath,
	)}\` |

## 入力DICOM

| file | bytes | sha256 | image | frames | transfer syntax |
|---|---:|---|---:|---:|---|
${artifactRows}

## 計測値

| 指標 | 値 |
|---|---:|
| parse平均 | ${formatMs(avgMs)} |
| parse p50 | ${formatMs(p50Ms)} |
| parse p95 | ${formatMs(p95Ms)} |
| parse最大 | ${formatMs(maxMs)} |
| RSS開始 | ${formatMb(rssStartMb)} |
| RSS peak | ${formatMb(rssPeakMb)} |
| RSS終了 | ${formatMb(rssEndMb)} |
| RSS終了増減 | ${formatMb(rssEndGrowthMb)} |
| heap開始 | ${formatMb(heapStartMb)} |
| heap終了 | ${formatMb(heapEndMb)} |

## 注記

- 患者名、患者ID、検査記述などのPHIは出力しない。
- このsoakはDICOM parse層の継続負荷を対象とする。GUI操作、GPU描画、インストーラー起動のUATは別証跡で扱う。
- RSS判定はCI/ローカル環境差が大きいため、release gateではp95とpeak増加量を併記して判断する。
`;

	await mkdir(dirname(outputPath), { recursive: true });
	await writeFile(outputPath, markdown, "utf-8");

	console.log(
		[
			`Performance soak: ${passed ? "PASS" : "FAIL"}`,
			`p95=${formatMs(p95Ms)} rssPeakGrowth=${formatMb(rssPeakGrowthMb)}`,
			`evidence=${relative(repoRoot, outputPath)}`,
		].join("\n"),
	);

	if (!passed) process.exitCode = 1;
};

run().catch((error) => {
	console.error(error instanceof Error ? error.message : error);
	process.exitCode = 1;
});
