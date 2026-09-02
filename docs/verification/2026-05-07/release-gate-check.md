# Release gate check - 2026-05-07

> 注意: この記録は局長直命前にWSLで取得したhistorical static証跡。現行運用では `pnpm release:gate` はWSLで拒否し、CIまたは `macmini-lan` 側で再実行する。現行WSL証跡は `docs/verification/2026-05-07/wsl-headless-verification.md` を参照する。

## 判定

| 項目 | 結果 |
|---|---|
| release gate check | HISTORICAL PASS |
| final release readiness | BLOCKED |
| WSL host | yes |
| OS | Linux 6.6.87.2-microsoft-standard-WSL2 x64 |
| Node.js | v24.11.1 |

## チェック結果

| check | result | detail |
|---|---|---|
| release gate doc exists | PASS | docs/release-gate-2026-05-07.md |
| UAT template exists | PASS | docs/uat-template.md |
| signing split doc exists | PASS | docs/signing-notarization-gate.md |
| performance soak evidence is PASS | PASS | docs/verification/2026-05-07/perf-soak.md |
| WSL runtime smoke guard refuses Electron desktop launch | PASS | scripts/runtime-smoke.mjs |
| WSL Electron E2E guard refuses desktop launch | PASS | scripts/run-e2e.mjs |
| Mac mini runtime/Electron verification procedure exists | PASS | docs/macmini-runtime-verification.md |
| Mac mini runtime/Electron evidence template exists | PASS | docs/verification/2026-05-07/macmini-runtime-e2e.md |
| renderer E2E evidence is PASS | PASS | docs/verification/2026-05-07/renderer-e2e.md |
| P0 annotation/measurement coordinates are image-space | PASS | src/types/annotation.ts, src/types/measurement.ts |
| P0 annotation SVG reprojection regression tests exist | PASS | src/components/viewer/__tests__/annotation-overlay.test.tsx |
| P0 measurement SVG reprojection regression tests exist | PASS | src/components/viewer/__tests__/measurement-overlay.test.tsx |
| P0 image coordinate projection math covers pan/rotation/flip round-trip | PASS | src/utils/measurement-math.test.ts |
| P0 renderer pixel-level overlay reprojection E2E exists | PASS | e2e/overlay-pixel.spec.ts, e2e/overlay-pixel-fixture.tsx |
| P0 reference implementation review is documented | PASS | docs/verification/2026-05-07/reference-implementation-overlay-review.md |
| UI theme is not black-only | PASS | app.css accent tokens and dropzone surface |
| Linux AppImage exists | PASS | release/Roentgen-0.1.0.AppImage |
| Linux unpacked binary exists | PASS | release/linux-unpacked/roentgen |
| Linux app.asar exists | PASS | release/linux-unpacked/resources/app.asar |
| app.asar contains renderer entry | PASS | /dist/index.html |
| app.asar contains Electron entrypoints | PASS | /dist-electron/main.js, /dist-electron/preload.js |
| app.asar excludes DICOM fixtures | PASS | no *.dcm or *.dicom files |
| app.asar excludes source maps | PASS | no *.map files |
| latest-linux.yml sha512 matches AppImage | PASS | release/latest-linux.yml |
| latest-linux.yml size matches AppImage | PASS | 146718876 / 146718876 |
| SHA256SUMS.txt exists | PASS | release/SHA256SUMS.txt |
| SHA256SUMS.txt lines are valid | PASS | release/SHA256SUMS.txt |
| SHA256SUMS.txt matches current Linux release artifacts | PASS | release/SHA256SUMS.txt |
| SHA256SUMS.txt excludes non-release debug files | PASS | builder-debug.yml excluded |
| Linux binary has no missing shared libraries | PASS | ldd release/linux-unpacked/roentgen |
| release workflow includes Linux job | PASS | .github/workflows/release.yml |
| release workflow publishes per-OS checksums | PASS | .github/workflows/release.yml |

## 手動 / 別環境 gate

| check | result | detail |
|---|---|---|
| 参考実装照合 | PASS | docs/verification/2026-05-07/reference-implementation-overlay-review.md |
| Mac mini runtime/Electron実画面確認 | PENDING | docs/verification/2026-05-07/macmini-runtime-e2e.md |
| Mac mini runtime短時間終了防止 | PENDING | docs/verification/2026-05-07/macmini-runtime-e2e.md |
| Mac mini 残留process確認 | PENDING | docs/verification/2026-05-07/macmini-runtime-e2e.md |
| Mac mini port/listener cleanup | PENDING | docs/verification/2026-05-07/macmini-runtime-e2e.md |
| Mac mini UI色確認 | PENDING | docs/verification/2026-05-07/macmini-runtime-e2e.md |
| 獣医師UAT | PENDING | 実検査DICOMと獣医師評価者が必要 |
| macOS署名/notarization | PENDING | Apple Developer ID証明書とnotarytool認証が必要 |
| Windows Authenticode | PENDING | code signing certificateとtimestamp検証が必要 |

## 異論 / 反証

- GitHub Release配布は完全な外部待ちではない。Linux jobとchecksum公開はrepo内workflowで整備できるためrelease gate check対象に含める。
- WSLでElectron GUI、Electron E2E、runtime smoke、AppImage GUI起動は実行しない。現行運用ではrelease:gate自体もWSLで拒否し、CIまたはmacmini-lan側で再実行する。
- 以前のWSL runtime smoke PASSは現行gateの実画面証跡として扱わない。runtime短時間終了とreal Electron E2Eはmacmini-lan側で再実施し、Mac mini証跡を埋める。
- Mac mini runtime/Electron実画面確認は、runtime smoke、real Electron E2E、短時間終了防止、残留process確認、port/listener cleanup、UI色確認がすべてPASSになるまで完了扱いにしない。
- renderer E2E port衝突は外部待ちではない。test:e2e -- --project=renderer をWSL-safe headless証跡に含める。
- 注釈/計測renderer pixel-level反証は外部待ちではない。SVG overlayをcanvas fixture上で実描画し、screenshot PNGを解析して期待pixelに残ることをrenderer E2Eで確認する。
- UIが黒一色に戻る問題は外部待ちではない。accent tokenとdropzone surfaceをrelease gate check対象に含める。
- 参考実装 参考実装A / 参考実装B はWSLローカルには存在しないが、macmini-lanへSSH読み取りで座標保存/viewport再投影を照合済み。GUI起動確認の代替にはしない。
- 一方でmacOS notarization、Windows Authenticode、獣医師UATは証明書・外部評価者が必要なため、このcheckではPASS条件に含めない。
- 「局長審査可」はMac mini runtime/Electron確認、UAT合格、署名/notarization、GitHub Release artifact公開まで完了してから。

## 外部 / 別環境待ち

| blocker | 待ち理由 |
|---|---|
| Mac mini runtime/Electron実画面確認 | WSLでは実行禁止。macmini-lan側でruntime smoke、Electron E2E、短時間終了防止、残留process/port、UI色確認を実施する |
| 獣医師UAT | 実検査DICOMと獣医師評価者が必要 |
| macOS署名/notarization | Apple Developer ID証明書とnotarytool認証が必要 |
| Windows署名 | Authenticode証明書とtimestamp検証が必要 |
