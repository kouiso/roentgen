# Reference Repositories

roentgen の設計・実装判断の基準となる参照リポジトリ。
実装AIはパリティ確認・機能追加時に必ずこの情報を意識すること。

## renkeibox (`secret-ritmo/renkeibox`, TypeScript, branch: develop)

主要な移植元。以下のファイル対応関係がある：

| 参照元 | roentgen |
|---|---|
| `useRender.ts` | use-cornerstone.ts, use-open-sea-dragon.ts |
| `useDicom.ts` | use-mouse-interaction.ts, use-viewer-controls.ts |
| `useShortcut.ts` | use-mouse-interaction.ts |
| `useOverlay.ts` | use-image-overlay.ts |
| `useViewerSlider.ts` | use-viewer-slider.ts |

アクセス: `gh api repos/secret-ritmo/renkeibox/contents/<path>`

## mgboxviewer (`secret-ritmo/mgboxviewer`, C#, branch: master)

馬向け方向マーカー（Dorsal/Palmar/Lateral/Medial）等の獣医療固有機能の参照実装。

アクセス: `gh api repos/secret-ritmo/mgboxviewer/contents/<path>`

---

## 機能パリティ状況

**roentgen に実装済み（参照リポと同等）:**
- WW/WC 調整、Rescale Slope/Intercept、Modality LUT / VOI LUT
- Overlay Planes、解剖学方向マーカー、マルチフレーム＋スライダー

**未実装（参照リポにはある）:**
- GSPS (Grayscale Softcopy Presentation State) 送信
- PACS 接続 (C-MOVE / C-STORE)

---

## 馬用途の特記事項

- CR/DR 大判（35×43cm）→ メモリ・描画パフォーマンスが重要
- 獣医方向表記: Dorsal/Palmar/Lateral/Medial（ヒトの L/R/A/P と異なる）
- プリセット WW/WC 参考値: 骨 300/1500、軟部組織 40/400
- 重要な計測: 蹄骨角度、関節間隙幅
