# Roentgen 多角的レビュー

## 参考リポジトリとの比較

| 観点 | renkeibox (React/TS) | mgboxviewer (C#/Silverlight) | **roentgen (本リポジトリ)** |
|------|---------------------|------------------------------|---------------------------|
| UI基盤 | React + MUI + Redux | Silverlight/WPF + XAML | React + Tailwind + Hooks |
| DICOM描画 | Cornerstone.js | 自前Codec + HLSL Shader | Cornerstone + OpenSeadragon |
| PACS連携 | Axios + Web API | C-MOVE / C-STORE (DICOM Network) | なし (ローカルファイルのみ) |
| デスクトップ | Web App | Silverlight | **Electron** |
| 規模 | 大規模 (患者管理/協業/レポート) | 大規模 (予約/レポート/GSPS) | **小規模・ビューア特化** |

---

## 1. アーキテクチャ評価 ★★★★☆

**良い点:**
- Hooks による関心の分離が明確 (`useDicomLoader`, `useCornerstone`, `useOpenSeaDragon`, `useViewerControls` など)
- Electron の Context Isolation + preload パターンでセキュリティ確保
- OpenSeadragon + Cornerstone のブリッジ設計が独創的（OSD の tileDrawing イベントで cornerstone.renderToCanvas を呼ぶ方式）

**改善点:**
- **状態管理がバラバラ**: 各 Hook が独自に `useState` / `useRef` を持ち、Hook 間の依存が暗黙的。コンポーネント数が増えると破綻しやすい → Zustand 等の軽量ストアの導入を検討
- **DicomViewer.tsx が God Component 化**: 9つの Hook を orchestrate しており、props/ref のバケツリレーが複雑

---

## 2. DICOM 機能評価 ★★★★☆

**実装済み (renkeibox/mgboxviewer と同等):**
- WW/WC 調整、Rescale Slope/Intercept
- Modality LUT / VOI LUT
- Overlay Planes (60xx)
- 解剖学方向マーカー (L/R, A/P, H/F)
- マルチフレーム対応 + スライダー

**未実装 (参考リポジトリにはある):**
- ❌ アノテーション (計測線、テキスト描画、矩形) — mgboxviewer にはフル実装あり
- ❌ GSPS (Grayscale Softcopy Presentation State) 送信
- ❌ PACS 接続 (C-MOVE / C-STORE) — ローカルファイルのみ
- ❌ 複数レイアウト (タイル、分割、比較表示) — mgboxviewer の主要機能
- ❌ プリセット WW/WC (骨、肺、軟部組織等の定型値)

---

## 3. コード品質 ★★★★☆

**良い点:**
- TypeScript strict モード (`noUnusedLocals`, `noUncheckedIndexedAccess`)
- Biome による統一的リンティング
- 日本語コメントで医療画像ロジックの意図が明確

**改善点:**
- **`biome-ignore` の多用**: cornerstone / OSD / dicom-parser の型定義がないため `lint/suspicious/noExplicitAny` 抑制が頻発 → `@types` パッケージか自前 `.d.ts` で型を補完すべき
- **エラーハンドリング不足**: 破損 DICOM ファイルのリカバリーがない。`parseDicom` が例外を投げた場合の UI フィードバックが弱い
- **マジックナンバー**: `PRELOAD_COUNT=10`, サムネイルサイズ `100x80` 等がハードコード → 設定化推奨

---

## 4. パフォーマンス評価 ★★★★☆

**良い点:**
- 先読みプリロード (前後10フレーム)
- imageDataMap キャッシュ (rawData を DicomFileInfo から除外)
- OSD single-level TileSource でオーバーヘッド削減

**改善点:**
- **Web Worker 未使用**: DICOM パース + ピクセルデータ生成がメインスレッド上 → 大きなファイル (CT 512枚等) で UI がフリーズする可能性
- **メモリ管理**: imageDataMap のエントリ解放タイミングが不明。ファイルクリア時に適切に GC されているか要確認
- **サムネイル生成**: 100x80 RGBA を全フレーム分一括生成 — 数百フレームで重くなる → lazy 生成に変更を推奨

---

## 5. セキュリティ評価 ★★★★★

**良い点 (Electron セキュリティのお手本):**
- `contextIsolation: true` + `nodeIntegration: false`
- Preload 経由のみで IPC 公開
- `allowedPaths` Set によるファイルアクセス制限
- 動的 CSP (dev: unsafe-eval 許可 / prod: self 制限)
- `load-test-dicom` は dev モードのみ

**改善点:**
- `allowedPaths` はファイル選択ダイアログ経由で追加されるが、パスのバリデーション (ディレクトリトラバーサル防止) が甘い可能性 → `path.resolve` + 正規化チェック推奨

---

## 6. テスト・CI/CD ★☆☆☆☆

**最大の弱点:**
- テストフレームワーク未導入 (Jest/Vitest なし)
- テストファイルが一つもない
- CI/CD パイプラインなし (GitHub Actions 等)
- renkeibox は GitLab CI、mgboxviewer は VS のビルドパイプラインがある

**推奨:**
1. Vitest + React Testing Library 導入
2. DICOM パーサーのユニットテスト (境界値: 空ファイル、破損ヘッダー、異常タグ)
3. Cornerstone ブリッジの integration test
4. GitHub Actions で lint + type-check + test を自動化

---

## 7. UX/UI 評価 ★★★★☆

**良い点:**
- ダークテーマが医療画像ビューアとして適切
- アイコン + ツールチップの直感的操作
- ドラッグ&ドロップによるファイル読み込み
- サムネイルパネルでフレーム一覧

**改善点:**
- キーボードショートカット未実装 (矢印キーでフレーム切替、R で回転等)
- タッチ/ジェスチャー対応が限定的 (Hammer.js 入っているが活用度不明)
- フルスクリーンモード未実装

---

## 8. 馬のレントゲン用途での評価

馬 (equine) のレントゲンは通常のヒト医療画像と以下が異なります:

- **画像サイズが大きい**: 馬の肢部 CR は 35x43cm 等大判 → メモリ・描画パフォーマンスが重要
- **DICOM Modality**: 主に CR (Computed Radiography) / DR (Digital Radiography)
- **獣医学的方向表記**: ヒトの L/R/A/P ではなく Dorsal/Palmar/Lateral/Medial が標準

**推奨対応:**
1. 大画像の段階的読み込み (progressive rendering)
2. 獣医学的方向マーカーへのカスタマイズオプション
3. 馬体部位のプリセット WW/WC (骨: 300/1500, 軟部組織: 40/400 等)
4. 計測ツール (蹄骨角度、関節間隙幅 等の距離・角度計測)

---

## 総合評価

| カテゴリ | スコア |
|---------|--------|
| アーキテクチャ | ★★★★☆ |
| DICOM 機能 | ★★★★☆ |
| コード品質 | ★★★★☆ |
| パフォーマンス | ★★★★☆ |
| セキュリティ | ★★★★★ |
| テスト・CI/CD | ★☆☆☆☆ |
| UX/UI | ★★★★☆ |

**総評**: Cornerstone + OpenSeadragon + Electron という組み合わせで、renkeibox/mgboxviewer の DICOM 描画コア部分を現代的なスタックで再実装した良質なプロジェクト。セキュリティとアーキテクチャの設計は参考リポジトリを上回る。最優先で対応すべきは **テスト基盤の整備** と **馬用途に特化した機能拡張** (計測ツール、獣医学方向表記、プリセット WW/WC)。
