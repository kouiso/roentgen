# Roentgen release gate - 2026-05-07

## 現状

| 領域 | 状態 | 証跡 / 次アクション |
|---|---|---|
| DICOM/local | 良好 | 既存テストとローカル確認済みとして扱う |
| Linux package | historical静的証跡あり、現行差分artifactは再生成待ち | `docs/verification/2026-05-07/linux-package-evidence.md` |
| UAT | テンプレート整備済み、実施待ち | `docs/uat-template.md` を `docs/uat-YYYY-MM-DD.md` に複製して実施 |
| release配布証跡 | Linux historical証跡、CI/Mac mini向けrelease gate check、workflow checksum整備済み。現行artifact再生成とGitHub Release本番公開は未実施 | `docs/verification/2026-05-07/release-gate-check.md` |
| performance/soak | PASS証跡生成済み | `docs/verification/2026-05-07/perf-soak.md` |
| runtime / Electron実画面 | Mac mini側で実施必須。WSL実行は禁止。runtime/Electron、残留process/port、短時間終了、色確認が揃うまで未完 | `docs/macmini-runtime-verification.md`, `docs/verification/2026-05-07/macmini-runtime-e2e.md` |
| renderer E2E | WSL headlessでPASS | `docs/verification/2026-05-07/renderer-e2e.md` |
| 注釈/計測位置ずれP0 | 回帰テスト対象 | 画像座標保存、pan/rotation/flip/resize時のSVG再投影をunitで検証 |
| 注釈/計測pixel-level反証 | WSL renderer headlessでPASS | `e2e/overlay-pixel.spec.ts` でSVG/canvas表示位置のpixel checkを実施 |
| 参考実装照合 | PASS。macmini-lanへSSH読み取りで確認済み | `docs/verification/2026-05-07/reference-implementation-overlay-review.md` |
| docs整合 | release gate、UAT、soak、署名切り分けを追加 | READMEと完成条件へリンク |
| 署名/notarization | 外部待ち | `docs/signing-notarization-gate.md` |

## この環境で完了できたもの

- UAT実施記録テンプレートを追加した。
- DICOM parse性能soakスクリプトを追加した。
- Linux AppImageの配布証跡をMarkdown化した。ただし現行差分を含むartifact再生成はCIまたはMac mini側で未実施。
- 署名/notarizationに必要な外部入力を切り分けた。
- release workflowにLinux AppImage jobとOS別SHA256SUMS公開を追加した。
- release workflowは各OSのartifactを `--publish never` で生成し、checksum生成後に `softprops/action-gh-release` で公開する。`pnpm release:gate` はLinux jobでのみ実行し、その公開もchecksum / release gate後にする。macOS/Windows jobはchecksum生成後に公開し、release:gateの結果には依存しない（既存main workflowの構成を踏襲）。
- Linux release jobは AppImage を公開する前に `pnpm release:checksums` と `pnpm release:gate` を実行する。
- release workflowは全OS package jobを共通 `quality-gates` jobの後段にし、macOS/Windowsもlocal/headless gate未通過のままpackageしない。
- Linux release jobはAppImage公開前に `lint` / `typecheck` / `unit` / renderer headless E2E を実行する。
- CI/Mac mini向けrelease gate checkを追加し、AppImageと`latest-linux.yml`のsha512/size整合を自動確認できるようにした。
- `@tailwindcss/vite` と `@fontsource/ibm-plex-mono` をdevDependenciesへ移し、ビルド時依存がproduction node_modulesとしてapp.asarへ混入するリスクを下げた。
- release gate checkに、`dist-electron` のbare `require(...)` が参照するruntime packageをapp.asar内の `node_modules` と照合するcheckを追加した。
- WSLではElectron GUI/runtime/AppImage実画面を起動しない方針に合わせ、runtime smokeとElectron E2EをMac mini実施手順へ分離した。
- WSL許可範囲を lint / typecheck / unit / renderer headless E2E に固定し、`release:gate` とperformance soakはscript側でもWSL実行を拒否する。
- renderer headlessに注釈/計測pixel-level反証を追加し、SVG overlayをcanvas fixture上で実描画してscreenshot PNGの期待pixelを検証する。

## gate checklist

| check | 状態 | 証跡 |
|---|---|---|
| release gate doc | ✅ | `docs/release-gate-2026-05-07.md` |
| UAT template | ✅ | `docs/uat-template.md` |
| signing/notarization split | ✅ | `docs/signing-notarization-gate.md` |
| performance soak | ✅ PASS / WSL再実行禁止 | `docs/verification/2026-05-07/perf-soak.md`, `scripts/perf-soak.mjs` |
| WSL runtime起動禁止ガード | ✅ PASS | `scripts/runtime-smoke.mjs`, `scripts/run-e2e.mjs` |
| WSL headless再検証 | ✅ PASS | `docs/verification/2026-05-07/wsl-headless-verification.md` |
| Mac mini runtime短時間終了防止 | ⏳ 別環境実施待ち | `docs/verification/2026-05-07/macmini-runtime-e2e.md` |
| Mac mini real Electron E2E | ⏳ 別環境実施待ち | `docs/verification/2026-05-07/macmini-runtime-e2e.md` |
| Mac mini residual process / port cleanup | ⏳ 別環境実施待ち | runtime-smoke / Electron / Playwright / Vite の残留processと関連LISTEN portなし |
| Mac mini UI色確認 | ⏳ 別環境実施待ち | Electron実画面またはE2E screenshotで黒一色でないこと |
| renderer E2E port衝突対策 | ✅ PASS | `docs/verification/2026-05-07/renderer-e2e.md` |
| 注釈/計測SVG再投影回帰 | ✅ PASS | `src/utils/measurement-math.test.ts`, `src/components/viewer/__tests__/annotation-overlay.test.tsx`, `src/components/viewer/__tests__/measurement-overlay.test.tsx` |
| 注釈/計測renderer pixel-level反証 | ✅ PASS | `e2e/overlay-pixel.spec.ts`, `e2e/overlay-pixel-fixture.tsx` |
| 参考実装照合 | ✅ PASS | `docs/verification/2026-05-07/reference-implementation-overlay-review.md` |
| Linux AppImage metadata/hash | ✅ historical PASS / 現行artifact再生成待ち | `docs/verification/2026-05-07/linux-package-evidence.md` |
| Linux AppImage artifact名固定 | ✅ | `electron-builder.yml` |
| app.asar entrypoints | ✅ PASS | `dist/index.html`, `dist-electron/main.js`, `dist-electron/preload.js` |
| app.asar package hygiene | ✅ PASS | DICOM fixtureとsourcemapを配布artifactから除外 |
| app.asar runtime bare require照合 | ✅ gate追加 / CI-Mac mini実行対象 | `scripts/release-gate-check.mjs` |
| build-time dependency区分 | ✅ | `@tailwindcss/vite`, `@fontsource/ibm-plex-mono` はdevDependencies |
| `latest-linux.yml` sha512/size | ✅ historical PASS / WSL再実行禁止 | `docs/verification/2026-05-07/release-gate-check.md`, `scripts/release-gate-check.mjs` |
| release workflow Linux job | ✅ | `.github/workflows/release.yml` |
| release workflow artifact公開前gate | ✅ | `--publish never` で生成し、checksum / Linux release gate後に公開 |
| release workflow 全OS quality-gates依存 | ✅ | `quality-gates` 後に macOS / Windows / Linux package job を実行 |
| release workflow Linux headless gate | ✅ | `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:e2e -- --project=renderer` |
| release workflow checksums | ✅ | `SHA256SUMS-macos.txt`, `SHA256SUMS-windows.txt`, `SHA256SUMS-linux.txt` |
| UI黒一色回避 | ✅ headless確認済み / Mac mini実画面は別gate | `app.css` accent tokens / `e2e/app-launch.spec.ts` |
| Mac mini real Electron / runtime再確認 | ⏳ 環境待ち | WSLではGUI起動禁止。`docs/macmini-runtime-verification.md` |
| 獣医師UAT | ⏳ 外部待ち | 実検査DICOMと獣医師評価者が必要 |
| macOS notarization | ⏳ 外部待ち | Developer ID / notarytool認証が必要 |
| Windows Authenticode | ⏳ 外部待ち | code signing certificateが必要 |

## release gateの残り

| blocker | この環境での扱い | 完了条件 |
|---|---|---|
| Mac mini runtime/Electron実画面確認 | WSLでは実行禁止。手順と記録テンプレートまで完了 | `pnpm smoke:runtime`, `pnpm test:e2e -- --project=electron`, 短時間終了防止、残留process/port cleanup、UI色確認をmacmini-lanでPASS |
| SHORT-RUNTIME audit | WSLではruntime再現禁止。失敗入力として扱い未完固定 | 2026-05-07T14:52Zの `SHORT-RUNTIME after test/runtime failure` を `docs/verification/2026-05-07/macmini-runtime-e2e.md` に記録し、Mac miniで再現ログを取得 |
| 獣医師UAT | テンプレートまで完了 | 獣医師1名以上がU1-U7を合格し「日常使用可」を明示 |
| macOS署名/notarization | 外部待ち | Developer ID署名、notarization、staple検証 |
| Windows署名 | 外部待ち | Authenticode署名とtimestamp検証 |
| GitHub Release本番配布 | タグ・権限・署名済みartifact待ち | dmg/exe/AppImage/checksum/release note添付 |
| dependency区分変更後のartifact再生成 | WSLではAppImage/Electron起動禁止。package rebuildはCIまたはMac mini側で実施 | 再生成後のapp.asarでbuild-time依存混入が減り、runtime bare require照合がPASS |
| 全OS package jobのquality-gates依存 | repo workflowで修正済み。WSLではworkflow実行しない | 次回GitHub Actions releaseで `quality-gates` PASS後にmacOS/Windows/Linux package jobが開始されること |
| release artifact公開前gate | repo workflowで修正済み。WSLではworkflow実行しない | Linux AppImageは `pnpm release:gate` PASS後にGitHub Releaseへ添付されること |

## blocker分類

| 分類 | blocker | 証跡 / 扱い |
|---|---|---|
| 外部待ち | 獣医師UAT | 実検査DICOMと獣医師評価者が必要。`docs/uat-template.md` で記録する |
| 外部待ち | macOS署名/notarization | Developer ID証明書、notarytool認証、staple検証が必要。`docs/signing-notarization-gate.md` |
| 外部待ち | Windows Authenticode | code signing certificateとtimestamp検証が必要。`docs/signing-notarization-gate.md` |
| 外部待ち | GitHub Release本番配布 | 署名済みdmg/exe/AppImage/checksum/release note/UAT結果を揃えてから公開。local greenでは代替しない |
| 環境不安定 / 別環境未検証 | Mac mini runtime/Electron実画面 | WSL実行禁止。`docs/verification/2026-05-07/macmini-runtime-e2e.md` のruntime smoke、Electron E2E、短時間終了防止、残留process、port/listener cleanup、UI色確認が全PASSになるまで未完 |
| 環境不安定 / 別環境未検証 | SHORT-RUNTIME after test/runtime failure | audit検知を失敗入力として扱う。Mac miniでruntime smoke/Electron E2Eの失敗ログ、再現条件、process/port/UI色を取得するまで未完 |
| 環境不安定 / 別環境未検証 | dependency区分変更後のartifact再生成とrelease gate再実行 | WSLでは `release:gate` が拒否される。CIまたはmacmini-lanで再生成artifactに対し `pnpm release:checksums` / `pnpm release:gate` を実行する |
| 環境不安定 / 別環境未検証 | WSL残留ROENTGEN process | 2026-05-07T14:48Z sweepではROENTGEN関連process出力なし。継続してPROMPT_IDLE / stale / port衝突を稼働扱いにしない |
| 実装修正対象 | 現時点のpackage/release gateコードblocker | WSL許可範囲のlint/typecheck/unit/renderer headless/P0 pixel-level/参考実装照合では未検出。Mac mini gateで短時間終了、黒一色UI、port残留、runtime bare require不整合が出た場合は外部待ちにせず実装修正対象へ戻す |

## 推奨コマンド

WSLで実行してよいheadless確認:

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm test:e2e -- --project=renderer
```

`pnpm release:gate` やperformance soakは配布gate用の静的/Node確認だが、局長直命のWSL許可コマンドには含めない。必要な場合はCIまたはMac mini側で実行する。

Mac mini側で実行するGUI/runtime確認:

```bash
pnpm test:e2e -- --project=electron
pnpm smoke:runtime
```

正式配布前は、上記に加えて対象OSごとの署名済みartifactでUATを実施する。
