# Performance Soak Evidence - 2026-05-07

## 判定

| 項目 | 結果 |
|---|---|
| 総合判定 | PASS |
| parse p95 | 0.23 ms / 上限 250.00 ms |
| RSS peak増加 | 0.13 MiB / 上限 96.00 MiB |
| サンプル数 | 30 parse (1 file x 30 loops) |

## 実行環境

| 項目 | 値 |
|---|---|
| 実行日時 | 2026-05-07T05:11:18.097Z |
| OS | Linux 6.6.87.2-microsoft-standard-WSL2 x64 |
| Node.js | v24.11.1 |
| GC | enabled (--expose-gc) |
| コマンド | `node --expose-gc scripts/perf-soak.mjs --dicom-dir public --iterations 30 --warmup 3 --max-p95-ms 250 --max-rss-growth-mb 96 --output docs/verification/2026-05-07/perf-soak.md` |

## 入力DICOM

| file | bytes | sha256 | image | frames | transfer syntax |
|---|---:|---|---:|---:|---|
| `public/test.dcm` | 9590846 | `adfc50b5e4fca923975c02ecc3cf39a22ac111abd066ed704698fde9a62783c6` | 1996x2396 | 1 | 1.2.840.10008.1.2.1 |

## 計測値

| 指標 | 値 |
|---|---:|
| parse平均 | 0.09 ms |
| parse p50 | 0.06 ms |
| parse p95 | 0.23 ms |
| parse最大 | 0.25 ms |
| RSS開始 | 69.14 MiB |
| RSS peak | 69.27 MiB |
| RSS終了 | 69.27 MiB |
| RSS終了増減 | 0.13 MiB |
| heap開始 | 4.96 MiB |
| heap終了 | 4.98 MiB |

## 注記

- 患者名、患者ID、検査記述などのPHIは出力しない。
- このsoakはDICOM parse層の継続負荷を対象とする。GUI操作、GPU描画、インストーラー起動のUATは別証跡で扱う。
- RSS判定はCI/ローカル環境差が大きいため、release gateではp95とpeak増加量を併記して判断する。
