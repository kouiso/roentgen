# Reference implementation overlay review - 2026-05-07

## 判定

注釈 / マーキング / 計測位置ずれP0について、参考実装2件を `macmini-lan` 上で読み取り確認した。ROENTGEN側の保存単位は画像ピクセル座標で、viewport / resize / pan / rotation / flip ごとに表示座標へ再投影する方針であり、参考実装の事故防止方針と矛盾しない。

| 項目 | 結果 |
|---|---|
| 参考実装A参照 | PASS |
| 参考実装B参照 | PASS |
| WSL GUI起動 | 未実施 / 禁止 |
| ROENTGEN P0回帰テスト | PASS |
| renderer pixel-level反証 | PASS |
| 実画面runtime確認 | Mac mini側で未実施 |

## 実施方法

WSLローカルには参考実装のリポジトリが存在しないため、`ssh -o BatchMode=yes macmini-lan` で対象ファイルを読み取り確認した。Electron、AppImage、デスクトップGUI、ブラウザGUIはWSL側で起動していない。秘密値や `.env` は参照していない。

参照対象:

| repo | path |
|---|---|
| 参考実装A | `<reference-impl-a repo>` |
| 参考実装B | `<reference-impl-b repo>` |

## 参考実装A

確認ファイル:

| file | 確認内容 |
|---|---|
| `MGDicomSilverlight/PR/GraphicObject.cs` | DICOM PRの図形注釈単位に `PIXEL` / `DISPLAY` があり、`GraphicAnnotationUnits = "PIXEL"` を既定にしている |
| `MGGraphicSilverlight/Annotation/DisplayApplication.cs` | 保存時は表示倍率 `rate` で割った値を持ち、表示時は `GetDevicePoint(rate, data)` で現在倍率へ戻す |
| `MGGraphicSilverlight/Annotation/DisplayApplication.cs` | `ImageRotation` / `ImageHorizontalFlip` を保持し、表示再構成時に回転・反転を適用する |

読み取り結果:

- `GraphicObject` はDICOM Presentation Stateの図形データを扱い、保存単位は表示pixel固定ではなく `PIXEL` を既定にする。
- `SetAnnotation(... rate ...)` は線分、楕円、矩形、自由線などの図形点を現在表示倍率から正規化して保存する。
- `CreateAnnotationFigures(... rate ...)` は保存済みの図形データを `GetDevicePoint` 経由で現在表示倍率へ再投影する。
- 回転と水平反転は `SpatialTransformation` として保持され、表示図形の再構成時に反映される。

## 参考実装B

確認ファイル:

| file | 確認内容 |
|---|---|
| `src/hooks/Viewer/useRender.ts` | `OpenSeadragon` を使い、画像zoomを `imageToViewportZoom` でviewport zoomへ変換する |
| `src/hooks/Viewer/useRender.ts` | `zoomTo` / `panTo` 後に `viewport.getCenter()` をviewer stateへ保持する |
| `src/hooks/Viewer/useLayout.ts` | `centerPoint` と `overlayList` をworld / image stateへ保持する |

読み取り結果:

- OSDのviewport stateを中心点・zoomとして保持し、同期や再表示時にviewportへ戻している。
- overlayはworld / imageの状態に紐付けられており、単純な画面絶対座標だけを保存する構造ではない。
- 参考実装Bは臨床注釈の保存実装そのものではなく、OSD viewport / world stateの扱いの参考として照合した。

## ROENTGEN照合

| ROENTGEN | 照合結果 |
|---|---|
| `src/types/annotation.ts` | `AnnotationPoint` は画像ピクセル座標として保存し、viewport / resizeごとにSVG表示座標へ再投影する |
| `src/types/measurement.ts` | `MeasurementPoint` は画像ピクセル座標として保存し、viewport / resizeごとにSVG表示座標へ再投影する |
| `src/utils/measurement-math.ts` | `containerToImageCoord` と `imageToContainerCoord` で画像座標と表示座標を相互変換する |
| `src/components/viewer/annotation-overlay.tsx` | OSD viewport eventとResizeObserverで注釈表示座標を再投影する |
| `src/components/viewer/measurement-overlay.tsx` | OSD viewport eventとResizeObserverで計測表示座標を再投影する |

回帰テスト:

| test | 覆う事故クラス |
|---|---|
| `src/utils/measurement-math.test.ts` | pan、非正方画像、portrait画像、rotation、horizontal / vertical flip、round-trip |
| `src/components/viewer/__tests__/annotation-overlay.test.tsx` | resize、OSD viewport change、rotation、flip、配置中の点・テキスト |
| `src/components/viewer/__tests__/measurement-overlay.test.tsx` | resize、OSD viewport change、rotation、vertical flip、配置中の点・preview線 |
| `e2e/overlay-pixel.spec.ts` | headless Chromium上でSVG overlayをcanvas fixtureへ実描画し、resize / pan / zoom 後も注釈・計測色が期待pixelへ再投影されること |

## 異論 / 反証

- 参考実装AはDICOM GSPS / Silverlight実装であり、ROENTGENのSVG overlayとAPIは一致しない。照合対象は「表示座標を保存しない」「表示条件ごとに再投影する」という事故クラスである。
- 参考実装Bは臨床注釈保存の参考実装ではない。OpenSeadragon viewport / world stateの同期とoverlay紐付けの参考として扱う。
- この照合は実画面runtime確認や獣医師UATの代替ではない。Mac mini runtime / Electron実画面、署名、UATは別gateとして残る。

## 結論

参考実装との方針差分は現時点で見つからない。ROENTGEN側は画像座標保存とviewport再投影を型、変換関数、overlay実装、unit回帰、renderer pixel-level E2Eで保持している。

ただし、renderer headlessのpixel-level反証はMac mini実画面runtime確認や獣医師UATの代替ではない。Mac mini runtime / Electron実画面、外部UAT、署名/配布は別gateとして未完のまま扱う。
