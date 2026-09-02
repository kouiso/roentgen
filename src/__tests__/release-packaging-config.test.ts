import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const repoFile = (path: string) =>
	readFileSync(resolve(process.cwd(), path), "utf-8");

describe("release packaging static gates", () => {
	it("keeps Linux AppImage metadata and package hygiene configured", () => {
		const builderConfig = repoFile("electron-builder.yml");
		const packageJson = JSON.parse(repoFile("package.json")) as {
			dependencies: Record<string, string>;
			devDependencies: Record<string, string>;
		};

		expect(builderConfig).toContain("buildResources: build");
		expect(builderConfig).toContain("  - dist/**/*");
		expect(builderConfig).toContain("  - dist-electron/**/*");
		expect(builderConfig).toContain("  - '!**/*.map'");
		expect(builderConfig).toContain("  - '!dist/**/*.dcm'");
		expect(builderConfig).toContain("  - '!dist/**/*.dicom'");
		expect(builderConfig).toContain("  - '!node_modules/**/*.map'");
		expect(packageJson.dependencies["@tailwindcss/vite"]).toBeUndefined();
		expect(
			packageJson.dependencies["@fontsource/ibm-plex-mono"],
		).toBeUndefined();
		expect(packageJson.devDependencies["@tailwindcss/vite"]).toBeDefined();
		expect(
			packageJson.devDependencies["@fontsource/ibm-plex-mono"],
		).toBeDefined();
		expect(builderConfig).toContain("linux:");
		expect(builderConfig).toContain("  category: Science;MedicalSoftware");
		expect(builderConfig).toContain("  icon: icons");
		expect(builderConfig).toMatch(
			/artifactName:\s*\$\{productName\}-\$\{version\}\.\$\{ext\}/,
		);
		expect(builderConfig).toContain("target: AppImage");
	});

	it("keeps release workflow split by OS with per-OS checksums", () => {
		const releaseWorkflow = repoFile(".github/workflows/release.yml");

		expect(releaseWorkflow).toContain("quality-gates:");
		expect(releaseWorkflow).toContain("build-mac:");
		expect(releaseWorkflow).toContain("build-win:");
		expect(releaseWorkflow).toContain("build-linux:");
		expect(releaseWorkflow).toContain("needs: quality-gates");
		expect(releaseWorkflow).toContain("pnpm dist --mac --publish never");
		expect(releaseWorkflow).toContain("pnpm dist --win --publish never");
		expect(releaseWorkflow).toContain("pnpm dist --linux --publish never");
		expect(releaseWorkflow).not.toContain("--publish always");
		expect(releaseWorkflow).toContain("Verify headless gates");
		expect(releaseWorkflow).toContain("pnpm lint");
		expect(releaseWorkflow).toContain("pnpm typecheck");
		expect(releaseWorkflow).toContain("pnpm test");
		expect(releaseWorkflow).toContain(
			"pnpm exec playwright install --with-deps chromium",
		);
		expect(releaseWorkflow).toContain("pnpm test:e2e -- --project=renderer");
		expect(releaseWorkflow).toContain("pnpm release:gate");
		expect(releaseWorkflow).toContain("Publish artifacts and checksums");
		expect(releaseWorkflow).toContain("fail_on_unmatched_files: true");
		expect(releaseWorkflow).toContain("release/*.AppImage");
		expect(releaseWorkflow).toContain("release/*.dmg");
		expect(releaseWorkflow).toContain("release/*.exe");
		expect(releaseWorkflow).toContain("release/SHA256SUMS-macos.txt");
		expect(releaseWorkflow).toContain("release/SHA256SUMS-windows.txt");
		expect(releaseWorkflow).toContain("release/SHA256SUMS-linux.txt");
	});

	it("keeps WSL desktop launch guards in front of runtime and Electron E2E", () => {
		const packageJson = JSON.parse(repoFile("package.json")) as {
			scripts: Record<string, string>;
		};
		const runtimeSmoke = repoFile("scripts/runtime-smoke.mjs");
		const e2eRunner = repoFile("scripts/run-e2e.mjs");

		expect(packageJson.scripts["smoke:runtime"]).toMatch(
			/runtime-smoke\.mjs --preflight &&/,
		);
		expect(runtimeSmoke).toContain(
			"Refusing to run ROENTGEN runtime smoke in WSL",
		);
		expect(runtimeSmoke).not.toContain("ROENTGEN_ALLOW_WSL_GUI");
		expect(e2eRunner).toContain(
			"Refusing to run ROENTGEN Electron desktop tests in WSL",
		);
		expect(e2eRunner).toContain("WSL is limited to renderer headless E2E");
		expect(e2eRunner).not.toContain("ROENTGEN_ALLOW_WSL_GUI");
	});

	it("refuses non-headless release gates in WSL", () => {
		const releaseGate = repoFile("scripts/release-gate-check.mjs");
		const perfSoak = repoFile("scripts/perf-soak.mjs");

		expect(releaseGate).toContain(
			"Refusing to run ROENTGEN release gate in WSL",
		);
		expect(releaseGate).toContain(
			"WSL is limited to lint, typecheck, unit tests, and renderer headless E2E",
		);
		expect(releaseGate).not.toMatch(
			/process\.env\.ROENTGEN_ALLOW_WSL_GUI|ROENTGEN_ALLOW_WSL_GUI\s*=/,
		);
		expect(perfSoak).toContain(
			"Refusing to run ROENTGEN performance soak in WSL",
		);
		expect(perfSoak).toContain(
			"WSL is limited to lint, typecheck, unit tests, and renderer headless E2E",
		);
		expect(perfSoak).not.toContain("ROENTGEN_ALLOW_WSL_PERF_SOAK");
	});

	it("keeps release gate coverage for packaged runtime dependencies", () => {
		const releaseGate = repoFile("scripts/release-gate-check.mjs");

		expect(releaseGate).toContain("# Release gate check - 2026-05-07");
		expect(releaseGate).not.toContain("# Release gate local check");
		expect(releaseGate).toContain("findRuntimeBareRequires");
		expect(releaseGate).toContain(
			"release workflow gates all OS package jobs behind quality-gates",
		);
		expect(releaseGate).toContain(
			"release workflow verifies Linux package before publishing artifacts",
		);
		expect(releaseGate).toContain(
			"release workflow does not publish package artifacts before checksums",
		);
		expect(releaseGate).toContain(
			"app.asar packages runtime bare require dependencies",
		);
		expect(releaseGate).toContain(
			"build-time Vite/font packages are devDependencies",
		);
		expect(releaseGate).toContain("isRuntimePackageSpecifier");
	});

	it("keeps release gate coverage for P0 renderer pixel-level overlay checks", () => {
		const releaseGate = repoFile("scripts/release-gate-check.mjs");
		const rendererSpec = repoFile("e2e/overlay-pixel.spec.ts");
		const rendererFixture = repoFile("e2e/overlay-pixel-fixture.tsx");
		const playwrightConfig = repoFile("playwright.config.ts");

		expect(releaseGate).toContain(
			"P0 renderer pixel-level overlay reprojection E2E exists",
		);
		expect(releaseGate).toContain("e2e/overlay-pixel.spec.ts");
		expect(rendererSpec).toContain("decodePng");
		expect(rendererSpec).toContain("hasPixelNear");
		expect(rendererSpec).toContain('method: "setSize"');
		expect(rendererSpec).toContain("args: [800, 400]");
		expect(rendererSpec).toContain("setViewport");
		expect(rendererFixture).toContain("<MeasurementOverlay");
		expect(rendererFixture).toContain("<AnnotationOverlay");
		expect(rendererFixture).toContain("../app.css");
		expect(playwrightConfig).toContain("overlay-pixel");
	});

	it("documents Mac mini handoff for reference implementations and real GUI checks", () => {
		const releaseGate = repoFile("docs/release-gate-2026-05-07.md");
		const macminiProcedure = repoFile("docs/macmini-runtime-verification.md");
		const macminiEvidence = repoFile(
			"docs/verification/2026-05-07/macmini-runtime-e2e.md",
		);
		const releaseGateScript = repoFile("scripts/release-gate-check.mjs");

		expect(releaseGate).toContain("参考実装照合");
		expect(releaseGate).toContain("Mac mini residual process / port cleanup");
		expect(releaseGate).toContain("Mac mini UI色確認");
		expect(releaseGate).toContain("SHORT-RUNTIME after test/runtime failure");
		expect(macminiProcedure).toContain("/Users/kouiso/ghq/reference-impl-a");
		expect(macminiProcedure).toContain("/Users/kouiso/ghq/reference-impl-b");
		expect(macminiProcedure).toContain("pnpm smoke:runtime");
		expect(macminiProcedure).toContain("pnpm test:e2e -- --project=electron");
		expect(macminiProcedure).toContain("pgrep -fl");
		expect(macminiProcedure).toContain("lsof -nP -iTCP -sTCP:LISTEN");
		expect(macminiProcedure).toContain("UI色確認");
		expect(macminiEvidence).toContain("| runtime short-exit guard |");
		expect(macminiEvidence).toContain("| residual process sweep |");
		expect(macminiEvidence).toContain("| port/listener cleanup |");
		expect(macminiEvidence).toContain("| UI color / non-black-only |");
		expect(macminiEvidence).toContain(
			"SHORT-RUNTIME after test/runtime failure",
		);
		expect(releaseGateScript).toContain(
			'macminiRuntimeEvidence.includes("| runtime short-exit guard | PASS |")',
		);
		expect(releaseGateScript).toContain(
			'macminiRuntimeEvidence.includes("| residual process sweep | PASS |")',
		);
		expect(releaseGateScript).toContain(
			'macminiRuntimeEvidence.includes("| port/listener cleanup | PASS |")',
		);
		expect(releaseGateScript).toContain(
			'macminiRuntimeEvidence.includes("| UI color / non-black-only | PASS |")',
		);
		expect(macminiProcedure).not.toContain(
			"node --expose-gc scripts/perf-soak.mjs",
		);
	});
});
