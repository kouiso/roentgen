#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { builtinModules } from "node:module";
import os from "node:os";
import { dirname, relative, resolve } from "node:path";
import process from "node:process";

const defaults = {
	output: "docs/verification/2026-05-07/release-gate-check.md",
};

const WSL_RELEASE_GATE_REFUSAL_MESSAGE =
	"Refusing to run ROENTGEN release gate in WSL. WSL is limited to lint, typecheck, unit tests, and renderer headless E2E; run release:gate on CI or macmini-lan.";

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
			case "--output":
				options.output = next();
				break;
			case "--help":
			case "-h":
				console.log(`Usage: node scripts/release-gate-check.mjs [--output <path>]`);
				process.exit(0);
				break;
			default:
				throw new Error(`Unknown option: ${arg}`);
		}
	}
	return options;
};

const repoRoot = resolve(dirname(new URL(import.meta.url).pathname), "..");
const readText = (path) => readFileSync(resolve(repoRoot, path), "utf-8");
const exists = (path) => existsSync(resolve(repoRoot, path));
const status = (passed) => (passed ? "PASS" : "FAIL");
const manualStatus = (passed) => (passed ? "PASS" : "PENDING");
const builtinModuleNames = new Set(
	builtinModules.flatMap((moduleName) => [
		moduleName,
		moduleName.replace(/^node:/, ""),
	]),
);

const isWslHost = () => {
	try {
		return readFileSync("/proc/sys/kernel/osrelease", "utf-8")
			.toLowerCase()
			.includes("microsoft");
	} catch {
		return false;
	}
};

const sha512Base64 = (path) =>
	createHash("sha512")
		.update(readFileSync(resolve(repoRoot, path)))
		.digest("base64");

const sha256Hex = (path) =>
	createHash("sha256")
		.update(readFileSync(resolve(repoRoot, path)))
		.digest("hex");

const addCheck = (checks, name, passed, detail) => {
	checks.push({ name, passed, detail });
};

const parseSha256Sums = (text) =>
	text
		.trim()
		.split(/\r?\n/)
		.filter(Boolean)
		.map((line) => {
			const match = line.match(/^([a-f0-9]{64})\s+(.+)$/i);
			return {
				file: match?.[2]?.trim() ?? "",
				sha256: match?.[1]?.toLowerCase() ?? "",
				valid: Boolean(match),
			};
		});

const getYamlValue = (yaml, key) => {
	const match = yaml.match(new RegExp(`^${key}:\\s*'?([^'\\n]+)'?`, "m"));
	return match?.[1]?.trim() ?? "";
};

const getYamlSize = (yaml) => {
	const match = yaml.match(/^    size:\s*(\d+)/m);
	return match ? Number(match[1]) : 0;
};

const listAsar = (asarPath) => {
	const candidates = [
		resolve(repoRoot, "node_modules/.pnpm/node_modules/.bin/asar"),
		resolve(repoRoot, "node_modules/.bin/asar"),
	];
	const asarBin = candidates.find((candidate) => existsSync(candidate));
	if (!asarBin) {
		throw new Error("asar command was not found in node_modules");
	}
	return execFileSync(asarBin, ["list", resolve(repoRoot, asarPath)], {
		encoding: "utf-8",
	})
		.split("\n")
		.map((line) => line.trim())
		.filter(Boolean);
};

const isRuntimePackageSpecifier = (specifier) =>
	/^(@[a-z0-9][a-z0-9._~-]*\/[a-z0-9][a-z0-9._~-]*|[a-z0-9][a-z0-9._~-]*)(\/[a-z0-9._~/-]+)?$/i.test(
		specifier,
	);

const packageRootForSpecifier = (specifier) =>
	specifier.startsWith("@")
		? specifier.split("/").slice(0, 2).join("/")
		: specifier.split("/")[0];

const findRuntimeBareRequires = () => {
	const distElectronPath = resolve(repoRoot, "dist-electron");
	if (!existsSync(distElectronPath)) return [];

	const runtimeBareRequires = new Map();
	const requirePattern = /require\(\s*([`"'])([^`"']+)\1\s*\)/g;
	for (const fileName of readdirSync(distElectronPath).filter((file) =>
		file.endsWith(".js"),
	)) {
		const source = readFileSync(resolve(distElectronPath, fileName), "utf-8");
		let match = requirePattern.exec(source);
		while (match) {
			const specifier = match[2];
			const normalized = specifier.replace(/^node:/, "");
			if (
				!specifier.startsWith(".") &&
				specifier !== "electron" &&
				!builtinModuleNames.has(specifier) &&
				!builtinModuleNames.has(normalized) &&
				isRuntimePackageSpecifier(specifier)
			) {
				const packageName = packageRootForSpecifier(specifier);
				const dependency = runtimeBareRequires.get(specifier) ?? {
					specifier,
					packageName,
					files: new Set(),
				};
				dependency.files.add(fileName);
				runtimeBareRequires.set(specifier, dependency);
			}
			match = requirePattern.exec(source);
		}
	}

	return Array.from(runtimeBareRequires.values()).map((dependency) => ({
		...dependency,
		files: Array.from(dependency.files).sort(),
	}));
};

const asarContainsPackage = (asarFiles, packageName) =>
	asarFiles.includes(`/node_modules/${packageName}`) ||
	asarFiles.some((file) => file.startsWith(`/node_modules/${packageName}/`));

const run = async () => {
	const options = parseArgs(process.argv.slice(2));
	const wslHost = isWslHost();
	if (wslHost) {
		throw new Error(WSL_RELEASE_GATE_REFUSAL_MESSAGE);
	}
	const checks = [];

	addCheck(
		checks,
		"release gate doc exists",
		exists("docs/release-gate-2026-05-07.md"),
		"docs/release-gate-2026-05-07.md",
	);
	addCheck(
		checks,
		"UAT template exists",
		exists("docs/uat-template.md"),
		"docs/uat-template.md",
	);
	addCheck(
		checks,
		"signing split doc exists",
		exists("docs/signing-notarization-gate.md"),
		"docs/signing-notarization-gate.md",
	);
	addCheck(
		checks,
		"performance soak evidence is PASS",
		exists("docs/verification/2026-05-07/perf-soak.md") &&
			readText("docs/verification/2026-05-07/perf-soak.md").includes(
				"| 総合判定 | PASS |",
			),
		"docs/verification/2026-05-07/perf-soak.md",
	);
	const runtimeSmokeScript = exists("scripts/runtime-smoke.mjs")
		? readText("scripts/runtime-smoke.mjs")
		: "";
	const e2eRunnerScript = exists("scripts/run-e2e.mjs")
		? readText("scripts/run-e2e.mjs")
		: "";
	const macminiProcedure = exists("docs/macmini-runtime-verification.md")
		? readText("docs/macmini-runtime-verification.md")
		: "";
	const releaseGateDoc = exists("docs/release-gate-2026-05-07.md")
		? readText("docs/release-gate-2026-05-07.md")
		: "";
	const referenceReviewPath =
		"docs/verification/2026-05-07/reference-implementation-overlay-review.md";
	const referenceReview = exists(referenceReviewPath)
		? readText(referenceReviewPath)
		: "";
	const referenceReviewComplete =
		referenceReview.includes(
			"/Users/kouiso/ghq/reference-impl-a",
		) &&
		referenceReview.includes(
			"/Users/kouiso/ghq/reference-impl-b",
		) &&
		referenceReview.includes('GraphicAnnotationUnits = "PIXEL"') &&
		referenceReview.includes("GetDevicePoint") &&
		referenceReview.includes("OpenSeadragon") &&
		referenceReview.includes("imageToContainerCoord");
	const macminiRuntimeEvidencePath =
		"docs/verification/2026-05-07/macmini-runtime-e2e.md";
	const macminiRuntimeEvidence = exists(macminiRuntimeEvidencePath)
		? readText(macminiRuntimeEvidencePath)
		: "";
	const macminiRuntimeComplete =
		macminiRuntimeEvidence.includes("| Mac mini runtime smoke | PASS |") &&
		macminiRuntimeEvidence.includes("| Mac mini Electron E2E | PASS |") &&
		macminiRuntimeEvidence.includes("| runtime short-exit guard | PASS |") &&
		macminiRuntimeEvidence.includes("| residual process sweep | PASS |") &&
		macminiRuntimeEvidence.includes("| port/listener cleanup | PASS |") &&
		macminiRuntimeEvidence.includes("| UI color / non-black-only | PASS |");
	if (wslHost) {
		addCheck(
			checks,
			"WSL runtime smoke guard refuses Electron desktop launch",
			runtimeSmokeScript.includes(
				"Refusing to run ROENTGEN runtime smoke in WSL",
			) &&
				runtimeSmokeScript.includes("--preflight") &&
				!runtimeSmokeScript.includes("ROENTGEN_ALLOW_WSL_GUI"),
			"scripts/runtime-smoke.mjs",
		);
		addCheck(
			checks,
			"WSL Electron E2E guard refuses desktop launch",
			e2eRunnerScript.includes(
				"Refusing to run ROENTGEN Electron desktop tests in WSL",
			) &&
				e2eRunnerScript.includes("macmini-lan") &&
				!e2eRunnerScript.includes("ROENTGEN_ALLOW_WSL_GUI"),
			"scripts/run-e2e.mjs",
		);
		addCheck(
			checks,
			"Mac mini runtime/Electron verification procedure exists",
			macminiProcedure.includes("macmini-lan") &&
				macminiProcedure.includes("pnpm smoke:runtime") &&
				macminiProcedure.includes("--project=electron"),
			"docs/macmini-runtime-verification.md",
		);
		addCheck(
			checks,
			"Mac mini runtime/Electron evidence template exists",
			exists(macminiRuntimeEvidencePath),
			macminiRuntimeEvidencePath,
		);
		addCheck(
			checks,
			"Mac mini evidence requires process/port/short-exit/color gates",
			[
				"| runtime short-exit guard |",
				"| residual process sweep |",
				"| port/listener cleanup |",
				"| UI color / non-black-only |",
			].every((row) => macminiRuntimeEvidence.includes(row)),
			macminiRuntimeEvidencePath,
		);
	} else {
		addCheck(
			checks,
			"runtime/Electron evidence is PASS",
			macminiRuntimeComplete,
			macminiRuntimeEvidencePath,
		);
	}
	addCheck(
		checks,
		"renderer E2E evidence is PASS",
		exists("docs/verification/2026-05-07/renderer-e2e.md") &&
			readText("docs/verification/2026-05-07/renderer-e2e.md").includes(
				"| renderer E2E | PASS |",
		),
		"docs/verification/2026-05-07/renderer-e2e.md",
	);
	const annotationType = exists("src/types/annotation.ts")
		? readText("src/types/annotation.ts")
		: "";
	const measurementType = exists("src/types/measurement.ts")
		? readText("src/types/measurement.ts")
		: "";
	const annotationOverlayTest = exists(
		"src/components/viewer/__tests__/annotation-overlay.test.tsx",
	)
		? readText("src/components/viewer/__tests__/annotation-overlay.test.tsx")
		: "";
	const measurementOverlayTest = exists(
		"src/components/viewer/__tests__/measurement-overlay.test.tsx",
	)
		? readText("src/components/viewer/__tests__/measurement-overlay.test.tsx")
		: "";
	const measurementMathTest = exists("src/utils/measurement-math.test.ts")
		? readText("src/utils/measurement-math.test.ts")
		: "";
	const overlayPixelSpec = exists("e2e/overlay-pixel.spec.ts")
		? readText("e2e/overlay-pixel.spec.ts")
		: "";
	const overlayPixelFixture = exists("e2e/overlay-pixel-fixture.tsx")
		? readText("e2e/overlay-pixel-fixture.tsx")
		: "";
	addCheck(
		checks,
		"P0 annotation/measurement coordinates are image-space",
		annotationType.includes("画像ピクセル座標") &&
			measurementType.includes("画像ピクセル座標") &&
			annotationType.includes("再投影") &&
			measurementType.includes("再投影"),
		"src/types/annotation.ts, src/types/measurement.ts",
	);
	addCheck(
		checks,
		"P0 annotation SVG reprojection regression tests exist",
		annotationOverlayTest.includes(
			"reprojects annotation coordinates after the viewer container resizes",
		) &&
			annotationOverlayTest.includes(
				"reprojects stored image-coordinate annotations after OSD viewport changes",
			) &&
			annotationOverlayTest.includes(
				"projects rectangle ROI corners through viewport rotation",
			) &&
			annotationOverlayTest.includes(
				"projects ellipse ROI through viewport rotation",
			) &&
			annotationOverlayTest.includes(
				"配置中のフリーハンド点とテキスト入力をresize後も画像座標から再投影する",
			),
		"src/components/viewer/__tests__/annotation-overlay.test.tsx",
	);
	addCheck(
		checks,
		"P0 measurement SVG reprojection regression tests exist",
		measurementOverlayTest.includes(
			"reprojects measurement coordinates after the viewer container resizes",
		) &&
			measurementOverlayTest.includes(
				"reprojects stored image-coordinate measurements after OSD viewport changes",
			) &&
			measurementOverlayTest.includes(
				"projects stored measurements through rotation around the image center while panned",
			) &&
			measurementOverlayTest.includes(
				"projects stored measurements through vertical flip",
			) &&
			measurementOverlayTest.includes(
				"配置中の計測点とプレビュー線をresize後も画像座標から再投影する",
			),
		"src/components/viewer/__tests__/measurement-overlay.test.tsx",
	);
	addCheck(
		checks,
		"P0 image coordinate projection math covers pan/rotation/flip round-trip",
		measurementMathTest.includes(
			"uses the image center, not the panned viewport center, for rotation projection",
		) &&
			measurementMathTest.includes(
				"round-trips vertical flip using image-coordinate storage",
		),
		"src/utils/measurement-math.test.ts",
	);
	addCheck(
		checks,
		"P0 renderer pixel-level overlay reprojection E2E exists",
		overlayPixelSpec.includes("decodePng") &&
			overlayPixelSpec.includes("hasPixelNear") &&
			overlayPixelSpec.includes('method: "setSize"') &&
			overlayPixelSpec.includes("args: [800, 400]") &&
			overlayPixelSpec.includes("setViewport") &&
			overlayPixelFixture.includes("<MeasurementOverlay") &&
			overlayPixelFixture.includes("<AnnotationOverlay") &&
			overlayPixelFixture.includes("../app.css"),
		"e2e/overlay-pixel.spec.ts, e2e/overlay-pixel-fixture.tsx",
	);
	addCheck(
		checks,
		"P0 reference implementation review is documented",
		referenceReviewComplete &&
			releaseGateDoc.includes("参考実装照合") &&
			macminiProcedure.includes(
				"/Users/kouiso/ghq/reference-impl-a",
			) &&
			macminiProcedure.includes(
				"/Users/kouiso/ghq/reference-impl-b",
			),
		referenceReviewPath,
	);
	const appCss = exists("app.css") ? readText("app.css") : "";
	addCheck(
		checks,
		"UI theme is not black-only",
		["--color-accent", "--color-accent-warm", "--color-accent-berry"].every(
			(token) => appCss.includes(token),
		) && appCss.includes("dropzone-surface"),
		"app.css accent tokens and dropzone surface",
	);

	const latestLinuxPath = "release/latest-linux.yml";
	const linuxBinaryPath = "release/linux-unpacked/roentgen";
	const appAsarPath = "release/linux-unpacked/resources/app.asar";
	const builderConfig = exists("electron-builder.yml")
		? readText("electron-builder.yml")
		: "";
	const packageJson = exists("package.json")
		? JSON.parse(readText("package.json"))
		: {};
	const appImagePath = `release/${getYamlValue(builderConfig, "productName") || "Roentgen"}-${packageJson.version}.AppImage`;
	const appImageExists = exists(appImagePath);
	const latestLinuxExists = exists(latestLinuxPath);
	const linuxBinaryExists = exists(linuxBinaryPath);
	const appAsarExists = exists(appAsarPath);

	addCheck(
		checks,
		"Linux AppImage artifact name is explicit",
		/artifactName:\s*\$\{productName\}-\$\{version\}\.\$\{ext\}/.test(
			builderConfig,
		),
		"electron-builder.yml",
	);
	addCheck(
		checks,
		"build-time Vite/font packages are devDependencies",
		["@tailwindcss/vite", "@fontsource/ibm-plex-mono"].every(
			(packageName) =>
				packageJson.devDependencies?.[packageName] &&
				!packageJson.dependencies?.[packageName],
		),
		"package.json",
	);
	addCheck(checks, "Linux AppImage exists", appImageExists, appImagePath);
	addCheck(checks, "Linux unpacked binary exists", linuxBinaryExists, linuxBinaryPath);
	addCheck(checks, "Linux app.asar exists", appAsarExists, appAsarPath);

	if (appAsarExists) {
		const asarFiles = listAsar(appAsarPath);
		const runtimeBareRequires = findRuntimeBareRequires();
		const missingRuntimeDependencies = runtimeBareRequires.filter(
			(dependency) => !asarContainsPackage(asarFiles, dependency.packageName),
		);
		addCheck(
			checks,
			"app.asar contains renderer entry",
			asarFiles.includes("/dist/index.html"),
			"/dist/index.html",
		);
		addCheck(
			checks,
			"app.asar contains Electron entrypoints",
			asarFiles.includes("/dist-electron/main.js") &&
				asarFiles.includes("/dist-electron/preload.js"),
			"/dist-electron/main.js, /dist-electron/preload.js",
		);
		addCheck(
			checks,
			"app.asar excludes DICOM fixtures",
			!asarFiles.some((file) => /\.(dcm|dicom)$/i.test(file)),
			"no *.dcm or *.dicom files",
		);
		addCheck(
			checks,
			"app.asar excludes source maps",
			!asarFiles.some((file) => file.endsWith(".map")),
			"no *.map files",
		);
		addCheck(
			checks,
			"app.asar packages runtime bare require dependencies",
			missingRuntimeDependencies.length === 0,
			runtimeBareRequires.length === 0
				? "no runtime bare requires"
				: runtimeBareRequires
						.map(
							(dependency) =>
								`${dependency.specifier} (${dependency.files.join(", ")})`,
						)
						.join("; "),
		);
	}

	if (appImageExists && latestLinuxExists) {
		const latestLinux = readText(latestLinuxPath);
		const manifestSha512 = getYamlValue(latestLinux, "sha512");
		const manifestSize = getYamlSize(latestLinux);
		const appImageSize = statSync(resolve(repoRoot, appImagePath)).size;
		addCheck(
			checks,
			"latest-linux.yml sha512 matches AppImage",
			manifestSha512 === sha512Base64(appImagePath),
			latestLinuxPath,
		);
		addCheck(
			checks,
			"latest-linux.yml size matches AppImage",
			manifestSize === appImageSize,
			`${manifestSize} / ${appImageSize}`,
		);
	} else {
		addCheck(
			checks,
			"latest-linux.yml can be checked",
			false,
			`${latestLinuxPath} or ${appImagePath} missing`,
		);
	}

	const checksumPath = "release/SHA256SUMS.txt";
	const checksumExists = exists(checksumPath);
	addCheck(checks, "SHA256SUMS.txt exists", checksumExists, checksumPath);
	if (checksumExists && appImageExists && latestLinuxExists) {
		const checksumRows = parseSha256Sums(readText(checksumPath));
		const expectedChecksums = new Map([
			[relative("release", appImagePath), sha256Hex(appImagePath)],
			["latest-linux.yml", sha256Hex(latestLinuxPath)],
		]);
		const checksumMap = new Map(
			checksumRows.map((row) => [row.file, row.sha256]),
		);
		const checksumNames = checksumRows.map((row) => row.file);
		addCheck(
			checks,
			"SHA256SUMS.txt lines are valid",
			checksumRows.length > 0 && checksumRows.every((row) => row.valid),
			checksumPath,
		);
		addCheck(
			checks,
			"SHA256SUMS.txt matches current Linux release artifacts",
			checksumRows.length === expectedChecksums.size &&
				Array.from(expectedChecksums.entries()).every(
					([file, sha256]) => checksumMap.get(file) === sha256,
				),
			checksumPath,
		);
		addCheck(
			checks,
			"SHA256SUMS.txt excludes non-release debug files",
			!checksumNames.some((file) => file.includes("builder-debug")),
			"builder-debug.yml excluded",
		);
	}

	if (linuxBinaryExists && process.platform === "linux") {
		const lddOutput = execFileSync("ldd", [resolve(repoRoot, linuxBinaryPath)], {
			encoding: "utf-8",
		});
		addCheck(
			checks,
			"Linux binary has no missing shared libraries",
			!lddOutput.includes("not found"),
			"ldd release/linux-unpacked/roentgen",
		);
	}

	const releaseWorkflow = exists(".github/workflows/release.yml")
		? readText(".github/workflows/release.yml")
		: "";
	const linuxJobStart = releaseWorkflow.indexOf("build-linux:");
	const linuxPackageStart = releaseWorkflow.indexOf(
		"Package (AppImage)",
		linuxJobStart,
	);
	const linuxWorkflowRunsBeforePackage = (needle) => {
		const index = releaseWorkflow.indexOf(needle, linuxJobStart);
		return (
			linuxJobStart >= 0 &&
			linuxPackageStart > linuxJobStart &&
			index > linuxJobStart &&
			index < linuxPackageStart
		);
	};
	addCheck(
		checks,
		"release workflow includes Linux job",
		releaseWorkflow.includes("build-linux:") &&
			releaseWorkflow.includes("pnpm dist --linux --publish never"),
		".github/workflows/release.yml",
	);
	addCheck(
		checks,
		"release workflow does not publish package artifacts before checksums",
		[
			"pnpm dist --mac --publish never",
			"pnpm dist --win --publish never",
			"pnpm dist --linux --publish never",
		].every((command) => releaseWorkflow.includes(command)) &&
			!releaseWorkflow.includes("--publish always") &&
			releaseWorkflow.includes("Publish artifacts and checksums") &&
			releaseWorkflow.includes("fail_on_unmatched_files: true"),
		".github/workflows/release.yml",
	);
	const qualityGateJobStart = releaseWorkflow.indexOf("quality-gates:");
	const qualityGateRuns = (needle) => {
		const index = releaseWorkflow.indexOf(needle, qualityGateJobStart);
		const buildMacStart = releaseWorkflow.indexOf("build-mac:");
		return (
			qualityGateJobStart >= 0 &&
			buildMacStart > qualityGateJobStart &&
			index > qualityGateJobStart &&
			index < buildMacStart
		);
	};
	addCheck(
		checks,
		"release workflow gates all OS package jobs behind quality-gates",
		releaseWorkflow.includes("quality-gates:") &&
			["build-mac:", "build-win:", "build-linux:"].every((jobName) => {
				const jobStart = releaseWorkflow.indexOf(jobName);
				const nextJobStart = releaseWorkflow
					.slice(jobStart + jobName.length)
					.search(/\n  [a-z0-9_-]+:/);
				const jobBody =
					nextJobStart >= 0
						? releaseWorkflow.slice(
								jobStart,
								jobStart + jobName.length + nextJobStart,
							)
						: releaseWorkflow.slice(jobStart);
				return jobBody.includes("needs: quality-gates");
			}) &&
			[
				"pnpm lint",
				"pnpm typecheck",
				"pnpm test",
				"pnpm exec playwright install --with-deps chromium",
				"pnpm test:e2e -- --project=renderer",
			].every(qualityGateRuns),
		".github/workflows/release.yml",
	);
	addCheck(
		checks,
		"release workflow runs Linux headless gates before AppImage publish",
		[
			"pnpm lint",
			"pnpm typecheck",
			"pnpm test",
			"pnpm exec playwright install --with-deps chromium",
			"pnpm test:e2e -- --project=renderer",
		].every(linuxWorkflowRunsBeforePackage),
		".github/workflows/release.yml",
	);
	const linuxReleaseGateStart = releaseWorkflow.indexOf(
		"Release gate",
		linuxPackageStart,
	);
	const linuxPublishStart = releaseWorkflow.indexOf(
		"Publish artifacts and checksums",
		linuxPackageStart,
	);
	addCheck(
		checks,
		"release workflow verifies Linux package before publishing artifacts",
		linuxPackageStart > linuxJobStart &&
			linuxReleaseGateStart > linuxPackageStart &&
			linuxPublishStart > linuxReleaseGateStart &&
			releaseWorkflow.includes("pnpm release:checksums") &&
			releaseWorkflow.includes("cp release/SHA256SUMS.txt release/SHA256SUMS-linux.txt") &&
			releaseWorkflow.includes("pnpm release:gate") &&
			[
				"release/*.AppImage",
				"release/latest-linux.yml",
				"release/SHA256SUMS-linux.txt",
			].every((artifact) => releaseWorkflow.includes(artifact)),
		".github/workflows/release.yml",
	);
	addCheck(
		checks,
		"release workflow publishes per-OS checksums",
		["SHA256SUMS-macos.txt", "SHA256SUMS-windows.txt", "SHA256SUMS-linux.txt"].every(
			(name) => releaseWorkflow.includes(name),
		),
		".github/workflows/release.yml",
	);

	const passed = checks.every((check) => check.passed);
	const outputPath = resolve(repoRoot, options.output);
	const rows = checks
		.map(
			(check) =>
				`| ${check.name} | ${status(check.passed)} | ${check.detail} |`,
		)
		.join("\n");
	const manualRows = [
		{
			name: "参考実装照合",
			result: manualStatus(referenceReviewComplete),
			detail: referenceReviewPath,
		},
		{
			name: "Mac mini runtime/Electron実画面確認",
			result: manualStatus(macminiRuntimeComplete),
			detail: macminiRuntimeEvidencePath,
		},
		{
			name: "Mac mini runtime短時間終了防止",
			result: manualStatus(
				macminiRuntimeEvidence.includes(
					"| runtime short-exit guard | PASS |",
				),
			),
			detail: macminiRuntimeEvidencePath,
		},
		{
			name: "Mac mini 残留process確認",
			result: manualStatus(
				macminiRuntimeEvidence.includes("| residual process sweep | PASS |"),
			),
			detail: macminiRuntimeEvidencePath,
		},
		{
			name: "Mac mini port/listener cleanup",
			result: manualStatus(
				macminiRuntimeEvidence.includes("| port/listener cleanup | PASS |"),
			),
			detail: macminiRuntimeEvidencePath,
		},
		{
			name: "Mac mini UI色確認",
			result: manualStatus(
				macminiRuntimeEvidence.includes(
					"| UI color / non-black-only | PASS |",
				),
			),
			detail: macminiRuntimeEvidencePath,
		},
		{
			name: "獣医師UAT",
			result: "PENDING",
			detail: "実検査DICOMと獣医師評価者が必要",
		},
		{
			name: "macOS署名/notarization",
			result: "PENDING",
			detail: "Apple Developer ID証明書とnotarytool認証が必要",
		},
		{
			name: "Windows Authenticode",
			result: "PENDING",
			detail: "code signing certificateとtimestamp検証が必要",
		},
	]
		.map((check) => `| ${check.name} | ${check.result} | ${check.detail} |`)
		.join("\n");
	const markdown = `# Release gate check - 2026-05-07

## 判定

| 項目 | 結果 |
|---|---|
| release gate check | ${status(passed)} |
| final release readiness | BLOCKED |
| WSL host | ${wslHost ? "yes" : "no"} |
| OS | ${os.type()} ${os.release()} ${os.arch()} |
| Node.js | ${process.version} |

## チェック結果

| check | result | detail |
|---|---|---|
${rows}

## 手動 / 別環境 gate

| check | result | detail |
|---|---|---|
${manualRows}

## 異論 / 反証

- GitHub Release配布は完全な外部待ちではない。package artifactを \`--publish never\` で生成し、checksum / release gateを通した後に公開するworkflowをrelease gate check対象に含める。
- WSLでElectron GUI、Electron E2E、runtime smoke、AppImage GUI起動は実行しない。release:gate自体もWSLでは拒否し、CIまたはmacmini-lan側で実行する。
- 以前のWSL runtime smoke PASSは現行gateの実画面証跡として扱わない。runtime短時間終了とreal Electron E2Eはmacmini-lan側で再実施し、Mac mini証跡を埋める。
- Mac mini runtime/Electron実画面確認は、runtime smoke、real Electron E2E、短時間終了防止、残留process確認、port/listener cleanup、UI色確認がすべてPASSになるまで完了扱いにしない。
- renderer E2E port衝突は外部待ちではない。test:e2e -- --project=renderer をWSL-safe headless証跡に含める。
- 注釈/計測renderer pixel-level反証は外部待ちではない。SVG overlayをcanvas fixture上で実描画し、screenshot PNGを解析して期待pixelに残ることをrenderer E2Eで確認する。
- UIが黒一色に戻る問題は外部待ちではない。accent tokenとdropzone surfaceをrelease gate check対象に含める。
- 参考実装A / 参考実装Bはリポジトリ外・ローカル限定でWSL側には存在しないが、macmini-lanへSSH読み取りで座標保存/viewport再投影を照合済み。GUI起動確認の代替にはしない。
- 一方でmacOS notarization、Windows Authenticode、獣医師UATは証明書・外部評価者が必要なため、このcheckではPASS条件に含めない。
- 「局長審査可」はMac mini runtime/Electron確認、UAT合格、署名/notarization、GitHub Release artifact公開まで完了してから。

## 外部 / 別環境待ち

| blocker | 待ち理由 |
|---|---|
| Mac mini runtime/Electron実画面確認 | WSLでは実行禁止。macmini-lan側でruntime smoke、Electron E2E、短時間終了防止、残留process/port、UI色確認を実施する |
| 獣医師UAT | 実検査DICOMと獣医師評価者が必要 |
| macOS署名/notarization | Apple Developer ID証明書とnotarytool認証が必要 |
| Windows署名 | Authenticode証明書とtimestamp検証が必要 |
`;

	await mkdir(dirname(outputPath), { recursive: true });
	await writeFile(outputPath, markdown, "utf-8");
	console.log(
		`Release gate check: ${status(passed)} (${relative(repoRoot, outputPath)})`,
	);
	if (!passed) process.exitCode = 1;
};

run().catch((error) => {
	console.error(error instanceof Error ? error.message : error);
	process.exitCode = 1;
});
