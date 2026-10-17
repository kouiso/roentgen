# Roentgen 機能対応表 — 参照ビューア機能セットとの突き合わせ (2026-10-09)

> 対象: roentgen main @ 6be2213 (v0.2.0 + #141〜#145 マージ済み)
> 基準: 獣医用 DICOM ビューアの標準機能セット（市販獣医ビューア VETWILL 相当）+ 参照実装A/Bの照合記録
> 証跡: `[コード]` = 実装ファイル確認、`[e2e]` = Electron E2E、`[unit]` = Vitest、`[doc]` = ドキュメント記載のみ

## 判定サマリ

| 区分 | 達成状況 |
|---|---|
| 表示・操作系（ビューア中核） | **全項目実装済み** |
| 計測・注釈系 | 距離/角度/図形/手書きは済。**VHS計測（椎骨心臓比）のみ未実装** |
| データ出入力 | 読込・PNG保存・印刷は済。**DICOM再エクスポート・検査情報編集は未実装** |
| DICOM通信（PACS） | **全未実装**（設計上ファイルビューアのため） |
| アプリ基盤 | 自動更新・設定画面・.dcm関連付け宣言・初回ガイドが未実装 |

## 1. 表示・操作

| 機能 | 状態 | 証跡 |
|---|---|---|
| 画像送り（スタックスクロール/スライダ） | ✅ | `stack-slider.tsx`, `use-viewer-slider.ts` |
| 拡大/縮小 | ✅ | `use-viewer-controls.ts`（ホイール・キー・ボタン）|
| 中心移動（パン） | ✅ | `use-mouse-interaction.ts` |
| 回転/反転 | ✅ | 90°回転・左右反転・リセット [e2e: geometry.spec] |
| コントラスト調整（WW/WC） | ✅ | ドラッグ調整＋馬プリセット（骨/軟部/蹄骨）＋オーナープリセット [e2e: baseline.spec] |
| 白黒反転 | ✅ | `tool-panel.tsx`「白黒を反転」 |
| 非正方ピクセル補正 | ✅ | #142 [e2e: geometry.spec] |
| タイル表示（サムネイル） | ✅ | `thumbnail-panel.tsx` |
| シネ表示（CINE再生） | ✅ | `use-cine-mode.ts`、マルチフレーム全フレーム対応（#144修正済）[e2e: large-ct-performance.spec] |
| 比較表示（複数ペイン） | ✅ | 1x1 / 2x1 / 1x2 / 2x2 レイアウト `use-viewer-layout.ts` |
| 方向マーカー | ✅ | 馬用語（背/腹/内/外/近位/遠位）＋DICOM略号切替、回転追従（#145）[e2e: direction-markers.spec] |
| 撮影情報オーバーレイ | ✅ | `image-overlay.tsx`（70+タグ） |
| 全画面表示 | ✅ | `tool-panel.tsx` |
| キーボードショートカット | ✅ | `use-keyboard-shortcuts.ts` |

## 2. 計測・注釈

| 機能 | 状態 | 証跡 |
|---|---|---|
| 距離計測（mm実測キャリブレーション） | ✅ | `use-measurement.ts` [e2e: measurement.spec] |
| 角度計測 | ✅ | 同上 [e2e: measurement.spec] |
| **VHS計測（椎骨心臓比スコア）** | ❌ **未実装** | 獣医特有の計測。コード内に該当実装なし |
| 文字注釈 | ✅ | `annotation-overlay.tsx` |
| 矢印 | ✅ | 同上（回転・反転・再起動で位置保持 #113修正済） |
| 手書き | ✅ | 同上 [e2e: freehand-annotation.spec] |
| 四角/丸で囲む | ✅ | 同上 |
| 注釈自動保存・復元 | ✅ | 画像ピクセル座標で保存・再投影（参照実装と同一方針、照合PASS済） |
| 注釈一括削除（確認付き） | ✅ | 「全クリア」確認ダイアログ（#49） |

## 3. データ出入力

| 機能 | 状態 | 証跡 |
|---|---|---|
| DICOMファイル/フォルダ読込 | ✅ | D&D＋再帰スキャン＋進捗＋キャンセル |
| DICOMDIR読込 | ✅ | `dicomdir-parser.ts` [unit: dicomdir-parser.test] |
| 非DICOM/破損ファイルのエラー表示 | ✅ | 日本語メッセージ [e2e: corrupt-file.spec] |
| スクリーンショット保存（PNG、オーバーレイ合成込み） | ✅ | `composite-canvas.ts`（#76修正済） |
| 印刷（注釈合成込み） | ✅ | `print-image.ts` |
| **DICOM再エクスポート（DICOMDIR/ファイル出力）** | ❌ **未実装** | 読込専用 |
| **検査情報編集（患者名/生年月日/検査記述）** | ❌ **未実装** | 表示のみ |
| Google Drive連携 | ✅ | `google-drive.ts`（OAuth、キーチェーン保存）— 参照元にない独自機能 |

## 4. DICOM通信（PACS）

| 機能 | 状態 | 証跡 |
|---|---|---|
| DICOM画像受信（C-STORE SCP） | ❌ 未実装 | ファイルビューア設計 |
| Query/Retrieve（C-FIND/C-MOVE） | ❌ 未実装 | 同上 |
| DICOM送信（C-STORE SCU） | ❌ 未実装 | 同上 |

> 注: 参照実装A（Silverlight系）はローカルファイルビューア系。DICOM通信は市販PACSビューアの標準機能だが、Roentgenの用途（手持ちDICOMを見る）では不要と判断できる範囲。PACS連携が必要になった時点で検討。

## 5. アプリ基盤・その他

| 機能 | 状態 | 証跡 |
|---|---|---|
| Sentryクラッシュレポート（同意制） | ✅ | #141（同意なし送信0件を実機確認） |
| PHI秘匿ログ | ✅ | `electron/main.ts` 永続ログ秘匿 |
| ウィンドウサイズ/最終WW/WC復元 | ✅ | `before-quit` で保存 |
| 設定画面（Preferences） | ⚠️ 部分 | `drive-setup-panel` と `crash-reporter-toggle` はあるが統一設定画面なし |
| .dcm ファイル関連付け | ⚠️ 部分 | `app.on("open-file")` ハンドラは実装済みだが `electron-builder.yml` に `fileAssociations` 宣言なし → OS関連付け未登録 |
| 自動更新（autoUpdater） | ❌ 未実装 | `electron-updater` 依存なし |
| 初回ガイド/ヘルプUI | ❌ 未実装 | onboarding なし |
| i18n（日英切替） | ❌ 未実装 | 日本語のみ（用途上問題なしと考えられる） |
| macOS署名/notarization | ❌ 未実施 | 自分用ビルドは不要（配布時は証明書要） |
| モダリティ対応（CR/DR/CT/US/MRI） | ✅ | cornerstoneベース、>500MB CT動作確認済（#144） |

## まとめ — ビューアとしての実用判定

**閲覧・計測・注釈の中核機能は市販獣医ビューアと同等以上**（馬用語マーカー・馬プリセット・Drive連携は独自の上乗せ）。

未実装で「参照元と同等」と言えない項目:
1. **VHS計測** — 獣医特有の計測。獣医さんに見せる用途があるなら実装価値あり
2. **DICOM再エクスポート / 検査情報編集** — 自分用なら重要度低
3. **DICOM通信（PACS）** — 用途上不要と判断可能
4. **自動更新 / .dcm関連付け宣言 / 統一設定画面 / 初回ガイド** — アプリ基盤の完成度（監査の feature-completeness 75点の残分）
