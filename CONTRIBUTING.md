# CONTRIBUTING

## 開発フロー

1. `main` から作業ブランチを作る: `git checkout -b feature/<短い説明>`
2. 変更は小さく分け、1コミット1目的で記録する。
3. コミットメッセージは `fix: ...`、`feat: ...`、`docs: ...` のように目的が分かる形にする。
4. PRには目的、主な変更点、確認したコマンド、リスクを短く書く。
5. レビュー指摘は追加コミットで対応し、既存の無関係な変更は巻き戻さない。

## セットアップ

```bash
pnpm install
```

Node.js と pnpm は `package.json` の `packageManager` に合わせる。

## 品質チェック

通常の変更後は次を通す。

```bash
pnpm typecheck
pnpm lint
pnpm test --run
```

Lint は BiomeJS (`biome check .`)。自動整形できる差分は `pnpm fix` で直す。
ユニットテストは Vitest。壊れたテストは `.skip` や `@ts-ignore` で隠さず、原因を直す。

## E2E

Electron E2E は Playwright で実行する。

```bash
pnpm exec playwright test --project=electron --reporter=line
```

Linux のヘッドレス環境では `xvfb-run` が必要になる場合がある。

## PRレビュー

医療画像ビューアのため、レビューでは特に以下を確認する。

- DICOM患者情報や画像データをログ・外部送信していないこと
- ファイルアクセスが明示的なユーザー選択範囲に限定されていること
- 計測・注釈・削除など臨床操作のUXが誤操作に強いこと
- 保存データの互換性が保たれていること
