# WSL headless verification - 2026-05-07

## 判定

WSLで実行可能な範囲はPASS。Electron GUI / AppImage / runtime smoke / Electron E2Eは局長直命によりWSLでは実行していない。

| 項目 | 結果 |
|---|---|
| lint | PASS、109 files |
| typecheck | PASS |
| P0座標再投影target tests | PASS、3 files / 80 tests |
| release packaging guard tests | PASS、1 file / 7 tests |
| unit tests | PASS、41 files / 498 tests |
| renderer headless E2E | PASS、8 tests、dynamic port 46321 |
| 残留プロセス | なし |

## 実行コマンド

```bash
pnpm lint
pnpm typecheck
pnpm exec vitest run src/__tests__/release-packaging-config.test.ts
pnpm exec vitest run src/utils/measurement-math.test.ts src/components/viewer/__tests__/annotation-overlay.test.tsx src/components/viewer/__tests__/measurement-overlay.test.tsx
pnpm test
pnpm test:e2e -- --project=renderer
for pid in $(pgrep -f 'scripts/runtime-[s]moke|e2e/vite-renderer.config.t[s]|node_modules/.pnpm/electron[@/]|electron-builder --linu[x]|playwright tes[t]' || true); do
  cwd=$(readlink "/proc/$pid/cwd" 2>/dev/null || true)
  case "$cwd" in "$PWD"*) ps -fp "$pid" -o pid=,ppid=,cmd= ;; esac
done
```

## 結果メモ

- `pnpm test` の `viewer failed` stack traceは `src/components/__tests__/error-boundary.test.tsx` の意図的なthrow。終了コードは0。
- `pnpm test` の最新結果は 41 files / 498 tests passed。
- P0座標再投影target testsは 3 files / 80 tests passed。
- release packaging guard testsは 1 file / 7 tests passed。
- renderer E2Eは `scripts/run-e2e.mjs` の空きport動的割当により 46321 を使用。
- renderer E2Eは `e2e/overlay-pixel.spec.ts` を含み、canvas fixture上のSVG overlayをscreenshot PNG解析でpixel-level確認する。
- overlay pixel specは `--repeat-each=2` で 4 passed を追加確認。fixture API待ちと短いretryで初期reload由来のflakyを抑止する。
- renderer E2Eは `e2e/app-launch.spec.ts` で純黒単色ではないbody背景、gradient、dropzone accent surfaceも確認する。
- `scripts/release-gate-check.mjs` と `scripts/perf-soak.mjs` はWSL検知時に即時拒否する。
- 残留プロセス確認はROENTGEN repo cwdでscopeし、出力なし。広い `scripts/runtime-smoke.mjs` pgrepは他projectのruntime smokeを拾うため、ROENTGEN証跡ではcwdを確認して混同しない。
- 承認promptはキャンセル済み。昇格や承認を要求せず、非昇格の既存test/script/代替確認だけで継続した。

## WSLで実行しなかったもの

- `pnpm smoke:runtime`
- `pnpm test:e2e -- --project=electron`
- AppImage / unpacked Electron binary / desktop GUI起動
- `pnpm release:gate`
- `node --expose-gc scripts/perf-soak.mjs`

Mac mini実画面確認は `docs/macmini-runtime-verification.md` と `docs/verification/2026-05-07/macmini-runtime-e2e.md` で扱う。
