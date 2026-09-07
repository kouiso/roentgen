# RUNBOOK

## ローカル起動

```bash
pnpm install
pnpm dev
```

Electron/Vite の開発サーバーが起動したら、DICOMファイルまたはフォルダをアプリから選択して読み込む。

## Google Drive認証

1. Google CloudでOAuthクライアントを作成する。
2. アプリが参照するDrive認証情報をローカル環境に配置する。
3. アプリ内のDrive接続から認可する。
4. トークンはOSキーチェーン暗号化が使える環境で保存する。

認証に失敗する場合は、リダイレクトURI、Drive API有効化、キーチェーン利用可否、ローカル認証情報のJSON形式を確認する。

## ビルド

```bash
pnpm build
pnpm dist:mac
pnpm dist:win
pnpm dist:linux
```

OS別ビルドは対象OS上で実行するのが基本。リリース前に `pnpm typecheck && pnpm lint && pnpm test --run` を通す。

## リリース

1. `main` にリリース対象PRをマージする。
2. バージョンと変更内容を確認する。
3. タグを作成してpushする: `git tag vX.Y.Z && git push origin vX.Y.Z`
4. GitHub ActionsのRelease workflowでverify、macOS、Windows、Linuxジョブを確認する。
5. 生成された成果物をGitHub Releaseで確認する。

## 障害対応

- `pnpm install --frozen-lockfile` が失敗する: `pnpm-lock.yaml` と `package.json` の差分を確認し、ローカルで再生成してPRに含める。
- Biomeが失敗する: `pnpm fix` を実行し、残った指摘を手で直す。
- Vitestが失敗する: 失敗テストを単体実行し、モックや実装の原因を直す。
- Electron E2EがLinuxで起動しない: `xvfb-run pnpm exec playwright test --project=electron --reporter=line` を試す。
- Drive同期が失敗する: 認証情報、OAuth同意画面、Drive API、ネットワーク、キーチェーン暗号化を順に確認する。
- リリース成果物が出ない: Actionsのverify job、各OSのbuilderログ、`GH_TOKEN` 権限を確認する。
