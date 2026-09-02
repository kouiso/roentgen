# Mac mini runtime / Electron verification

## 目的

WSLではROENTGENのデスクトップGUI、Electron E2E、runtime smoke、AppImage GUI起動を実行しない。フォーカスを奪って入力を妨げるため、WSLで実行してよいのは unit / lint / typecheck / renderer headless E2E まで。

Electron実画面、real Electron E2E、runtime短時間終了確認は `macmini-lan` 側で実施し、証跡を `docs/verification/YYYY-MM-DD/` に記録する。2026-05-07の記録先は `docs/verification/2026-05-07/macmini-runtime-e2e.md`。

## WSLで実行してよい確認

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm test:e2e -- --project=renderer
```

## macmini-lanで実行する確認

以下はMac mini側のターミナルで実行する。WSL上では実行しない。

```bash
cd <roentgen repo>
pnpm install --frozen-lockfile
pnpm build
pnpm typecheck
pnpm test
pnpm test:e2e -- --project=renderer
pnpm test:e2e -- --project=electron
pnpm smoke:runtime
pgrep -fl 'Roentgen|Electron|runtime-smoke|playwright|vite' || true
lsof -nP -iTCP -sTCP:LISTEN | grep -E 'Roentgen|Electron|node|vite|playwright' || true
pnpm release:checksums
pnpm release:gate
```

`pnpm smoke:runtime` は `Window created` 到達後に規定時間より前に終了しないことを記録する。`pnpm test:e2e -- --project=electron` は実Electronの起動だけでなく、初期画面の色が黒一色に戻っていないことも証跡化する。実行後は `pgrep` と `lsof` でruntime-smoke / Electron / Playwright / Vite の残留processと関連LISTEN portがないことを確認する。

## 参考実装確認

注釈/マーキング/計測位置ズレはP0 safety bugとして扱う。Mac mini側では、ROENTGENの実画面確認前に参考実装の座標保存・SVG/overlay再投影の実装を確認する。

2026-05-07時点の照合証跡は `docs/verification/2026-05-07/reference-implementation-overlay-review.md` に記録済み。参考実装またはROENTGENのoverlay/座標変換を変更した場合は、以下を再実行して証跡を更新する。

```bash
cd /Users/kouiso/ghq/reference-impl-a
git status --short
rg -n "OpenSeadragon|overlay|svg|viewport|imageTo|world|annotation|measurement|markup|resize" .

cd /Users/kouiso/ghq/reference-impl-b
git status --short
rg -n "OpenSeadragon|overlay|svg|viewport|imageTo|world|annotation|measurement|markup|resize" .
```

確認観点:

- 注釈/計測の保存値が表示pixelではなく画像座標または世界座標であること。
- pan / zoom / resize / rotation / flip 時に保存座標から表示座標へ再投影していること。
- ROENTGEN側の回帰テストが参考実装と同じ事故クラスを覆っていること。

macOS配布artifact確認を行う場合:

```bash
cd <roentgen repo>
pnpm dist:mac
codesign --verify --deep --strict "release/mac/Roentgen.app"
```

notarizationはDeveloper ID証明書とnotarytool認証が揃ってから実施する。

## 判定メモ

- renderer headless E2E PASS は real Electron E2E の代替ではない。
- Mac mini runtime/Electron実画面確認は、runtime smoke、real Electron E2E、短時間終了防止、残留process確認、port/listener cleanup、UI色確認がすべてPASSになるまで完了扱いにしない。
- WSLでの `pnpm smoke:runtime` は禁止。script側もWSLでは拒否する。
- `pnpm smoke:runtime` はpreflightでWSLを拒否してからbuild/runtime確認へ進む。
- `pnpm test:e2e -- --project=electron` とproject未指定のE2EはWSLで拒否する。WSLでは `pnpm test:e2e -- --project=renderer` のみ実行する。
- `pnpm release:gate` とperformance soakもWSLでは拒否する。Mac miniまたはCI側で再実行する。
- Linux AppImageのhash/manifest/ldd確認はheadless証跡として扱えるが、GUI起動確認はWSLでは行わない。
