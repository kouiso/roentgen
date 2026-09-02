# Mac mini runtime / Electron evidence - 2026-05-07

## 判定

2026-05-07T14:52Z auditで `SHORT-RUNTIME after test/runtime failure` を検知。短時間終了は成功扱いしない。WSLではruntime smoke / Electron GUIを起動しないため、失敗ログ本体はこの環境で再取得しない。`macmini-lan` で再現ログ、終了時刻、process/port/UI色確認を取得するまで未完。

| 項目 | 結果 |
|---|---|
| Mac mini runtime smoke | 未実施 |
| Mac mini Electron E2E | 未実施 |
| runtime短時間終了防止 | 未実施 |
| 残留process確認 | 未実施 |
| port/listener cleanup | 未実施 |
| UI色確認 | 未実施 |
| 実行環境 | `macmini-lan` |
| WSL実行 | 禁止 |

## audit failure input

| time | signal | status | required follow-up |
|---|---|---|---|
| 2026-05-07T14:52Z | SHORT-RUNTIME after test/runtime failure | 未解消 | Mac miniでruntime smoke / Electron E2Eの失敗ログ、短時間終了の再現条件、残留process、LISTEN port、UI色screenshotを取得 |

再現条件:

- `macmini-lan` で `pnpm smoke:runtime` を実行し、`Window created` 到達後に規定時間前へ終了した場合は失敗として記録する。
- `pnpm test:e2e -- --project=electron` が短時間で落ちる、window生成前に落ちる、またはport/processを残す場合は失敗として記録する。
- renderer headless E2Eの短時間PASSはruntime smokeの代替証跡にしない。

## 実行コマンド

以下は `macmini-lan` 側で実行する。WSLでは実行しない。

```bash
cd <roentgen repo>
git status --short
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
pnpm test:e2e -- --project=renderer
pnpm test:e2e -- --project=electron
pnpm smoke:runtime
pgrep -fl 'Roentgen|Electron|runtime-smoke|playwright|vite' || true
lsof -nP -iTCP -sTCP:LISTEN | grep -E 'Roentgen|Electron|node|vite|playwright' || true
```

## 記録欄

| check | result | output / note |
|---|---|---|
| Mac mini runtime smoke | 未実施 |  |
| Mac mini Electron E2E | 未実施 |  |
| runtime short-exit guard | 未実施 | `Window created` 後、規定時間前に終了しないこと |
| residual process sweep | 未実施 | runtime-smoke / Electron / Playwright / Vite の残留なし |
| port/listener cleanup | 未実施 | E2E/runtime後に関連LISTEN portなし |
| UI color / non-black-only | 未実施 | Electron実画面またはE2E screenshotで黒一色でないこと |
| renderer headless E2E | 未実施 |  |
| unit/typecheck | 未実施 |  |

## 判定基準

- `pnpm smoke:runtime` が `Window created` 到達後、指定時間より前に終了しない。
- `pnpm test:e2e -- --project=electron` が実Electronの起動、DICOM読込、主要UI操作でPASSする。
- Electron E2Eまたは実画面screenshotでUIが黒一色に戻っていないことを確認する。
- port衝突、関連LISTEN port、runtime-smoke / Electron / Playwright / Vite の残留processが出た場合は修正して再実行する。
- `Mac mini runtime smoke`, `Mac mini Electron E2E`, `runtime short-exit guard`, `residual process sweep`, `port/listener cleanup`, `UI color / non-black-only` がすべてPASSになるまで、runtime/Electron実画面確認は完了扱いにしない。
