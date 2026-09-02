# Runtime smoke evidence - 2026-05-07

> 注意: この記録は過去のWSL実行証跡であり、現行release gateのruntime/Electron実画面確認としては採用しない。WSLではROENTGENのElectron GUI、runtime smoke、AppImage GUI起動を禁止し、現行証跡は `docs/verification/2026-05-07/macmini-runtime-e2e.md` にMac mini側で記録する。

## 判定

| 項目 | 結果 |
|---|---|
| runtime smoke | HISTORICAL PASS / 現行gate対象外 |
| 継続時間 | 30000ms |
| 起動確認 | `Window created` 到達 |
| renderer port | 動的割当 |
| DISPLAYなし | 当時は `xvfb-run -a` を使用。現在はWSL実行禁止 |

## 実行コマンド

```bash
pnpm smoke:runtime
```

## 結果

```text
Roentgen runtime smoke: PASS (Window created, 30000ms alive)
```

## 確認範囲

- `pnpm build` 後の `dist-electron/main.js` を起動。
- Vite renderer serverは空きportを動的取得し、`--strictPort` で起動。
- Electron main processが `Window created` を出す前に終了、または指定時間内に出さない場合はFAILにする。
- Electron processが指定時間より前に終了した場合はFAILにする。
- 終了時にVite/Electron child processを停止する。

## 注記

このsmokeは短時間終了・port衝突・headless起動失敗の早期検知が目的だったが、現行運用ではWSLで再実行しない。runtime短時間終了防止とreal Electron E2Eは `macmini-lan` 側で再取得する。
