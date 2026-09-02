# Renderer E2E evidence - 2026-05-07

## 判定

| 項目 | 結果 |
|---|---|
| renderer E2E | PASS |
| test files | `e2e/app-launch.spec.ts`, `e2e/overlay-pixel.spec.ts` |
| tests | 8 passed |
| port | `scripts/run-e2e.mjs` による動的割当（今回: 46321） |

## 実行コマンド

```bash
pnpm test:e2e -- --project=renderer
```

## 結果

```text
Running 8 tests using 1 worker
8 passed (7.4s)
```

## 確認範囲

- renderer projectのみ実行。WSLではElectron GUI / Electron E2E / runtime smoke / AppImage GUI起動を行わない。
- `ROENTGEN_E2E_PORT` 未指定時は空きportを動的取得。
- Playwright webServerは `e2e/vite-renderer.config.ts` と `--strictPort` を使用。
- 初期画面、ドロップゾーン、ステータス表示、console errorなし、黒一色でない背景とaccent surfaceを確認。
- `e2e/overlay-pixel.spec.ts` は実ブラウザで `MeasurementOverlay` / `AnnotationOverlay` をcanvas fixture上に描画し、screenshot PNGを解析してresize、pan、zoom後も期待pixelに計測/注釈色が残ることを確認。
- overlay pixel specはVite初期reload由来の `Execution context was destroyed` flakyを防ぐため、fixture API待ちと短いretryを追加済み。`--repeat-each=2` で 4 passed を確認。

## 注記

Electron実機操作の完全E2Eではない。real Electron suiteと獣医師UATは別gateで扱う。
