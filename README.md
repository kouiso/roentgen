ルバーノのレントゲンビューア — DICOM画像デスクトップアプリ

## 開発環境セットアップ

- Node.js は `package.json` の `engines.node`（20.19 以上の 20 系、22.12 以上の 22 系、24 以上）を使います。CI と同じ版は `.node-version` にあります。合わない版では `pnpm install` が理由付きで止まります。
- pnpm 9以上を使用します。
- 依存関係をインストールします。

```bash
pnpm install
```

## ローカル実行

Vite と vite-plugin-electron により、renderer と Electron main process の両方を起動します。

```bash
pnpm dev
```

## 検証コマンド

| コマンド | 内容 |
| --- | --- |
| `pnpm typecheck` | TypeScript の型検証 |
| `pnpm lint` | Biome によるフォーマットと lint |
| `pnpm test` | Vitest のユニットテスト |
| `pnpm build` | TypeScript と Vite のビルド |

## E2E (Real Electron)

renderer のみを対象にした Playwright suite は `e2e/app-launch.spec.ts` で、project は `renderer` です。

real-Electron suite は `_electron.launch()` で実際の Electron main process を起動し、`e2e/electron/*.spec.ts` にあります。project は `electron` です。

```bash
# 全 projects
pnpm exec playwright test

# Renderer のみ
pnpm exec playwright test --project=renderer

# Real Electron のみ
pnpm exec playwright test --project=electron
```

real-Electron project は helpers 経由で `pnpm build` を実行し、`webServer` config は使用しません。Vite dev server の lifecycle は suite 側で管理します。
