# Roentgen performance / soak 手順

## 目的

DICOM parse層の継続負荷を同じ入力で繰り返し実行し、release gateに必要な性能証跡を残す。GUI描画、GPU、実インストーラー起動はUATまたはE2Eで扱い、このsoakでは患者情報を出力しない。

## 実行コマンド

局長直命により、WSLではこのsoakを実行しない。WSLで実行してよいのは lint / typecheck / unit / renderer headless E2E まで。以下はCIまたは `macmini-lan` 側で実行する。

```bash
node --expose-gc scripts/perf-soak.mjs \
  --dicom-dir public \
  --iterations 30 \
  --warmup 3 \
  --output docs/verification/$(date +%F)/perf-soak.md
```

## 判定基準

| 指標 | release gate基準 |
|---|---:|
| DICOM parse p95 | 250ms以下 |
| RSS peak増加 | 96MiB以下 |
| 入力DICOM | 1件以上、Part 10 `DICM` markerあり |
| PHI出力 | なし |

## 出力

既定では `docs/verification/YYYY-MM-DD/perf-soak.md` にMarkdown証跡を出力する。証跡にはOS、Node.js、入力DICOMのサイズとsha256、parse平均/p50/p95/最大、RSS/heapの開始・終了・peakを含める。

## 範囲外

- 実インストーラーのGUI起動確認
- WW/WCドラッグ、パン、ズームなどの体感操作
- 獣医師UATの合否判定

これらは `docs/uat-template.md` とE2E証跡で扱う。

## WSL誤実行防止

`scripts/perf-soak.mjs` はWSLを検知した場合に即時拒否する。過去のWSL soak証跡はhistoricalとして保持し、現行の再実行はCIまたはMac mini側で扱う。
