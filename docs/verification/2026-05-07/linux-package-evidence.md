# Linux package evidence - 2026-05-07

## 判定

Linux x64 AppImage artifactは生成済みで、metadata、hash、manifest整合、実行ファイル種別、依存ライブラリ解決、app.asar同梱物を静的確認した。これはhistorical package証跡であり、現行差分を含むartifact再生成とrelease gate再実行はCIまたはMac mini側で未実施。局長直命により、WSLではElectron GUI / AppImage / runtime実画面確認は起動しない。GUI起動、runtime短時間終了、Electron E2Eは `macmini-lan` 側の証跡で扱う。

| 項目 | 結果 |
|---|---|
| artifact | `release/Roentgen-0.1.0.AppImage` |
| unpacked binary | `release/linux-unpacked/roentgen` |
| app archive | `release/linux-unpacked/resources/app.asar` |
| version | 0.1.0 |
| arch | x86_64 |
| artifactName設定 | `${productName}-${version}.${ext}` |
| release workflow pre-publish gate | `lint` / `typecheck` / `unit` / renderer headless E2E |
| build-time dependency区分 | `@tailwindcss/vite`, `@fontsource/ibm-plex-mono` はdevDependencies |
| runtime bare require gate | `dist-electron` bare requireをapp.asar内packageと照合 |
| ldd `not found` | 0件 |
| historical release gate | PASS (`docs/verification/2026-05-07/release-gate-check.md`) |
| WSL GUI起動 | 未実施 / 禁止 |

## Git / worktree

| 項目 | 値 |
|---|---|
| HEAD | `1aced9bff38bb9b676fb010d12477c38858abfd3` |
| 注記 | 作業ツリーには既存の未コミット差分があるため、artifactはこの作業ツリー上の証跡として扱う |

## artifact metadata

| file | bytes | mode | mtime |
|---|---:|---|---|
| `release/Roentgen-0.1.0.AppImage` | 146718876 | `-rwxr-xr-x` | 2026-05-07 14:39:51.185476132 +0900 |
| `release/linux-unpacked/roentgen` | 206376152 | `-rwxr-xr-x` | 2026-05-07 14:39:22.425491078 +0900 |
| `release/linux-unpacked/resources/app.asar` | 66455352 | `-rw-rw-r--` | 2026-05-07 14:39:47.738554248 +0900 |
| `release/latest-linux.yml` | 368 | `-rw-rw-r--` | 2026-05-07 14:39:51.193717822 +0900 |
| `release/SHA256SUMS.txt` | 173 | `-rw-rw-r--` | 2026-05-07 14:41:24.283817201 +0900 |
| `release/builder-debug.yml` | 1181 | `-rw-rw-r--` | 2026-05-07 14:39:51.189596979 +0900 |

## sha256

```text
56d0dd14626e92bc783e8e64dccc6d7710326ddf9156ae433f7473045e0c8e1f  release/Roentgen-0.1.0.AppImage
134b72e0eb5a85ffaf2dfd85d98fd67b9d242b644297b12362ac995b178ff08f  release/linux-unpacked/roentgen
32503d9d8562cd1ad65bef2294518527117f1371156408e8458771482f12d6b7  release/linux-unpacked/resources/app.asar
de2e6dd764e20249418ec80df513532cd06b5218caceaa057af05287763a38bf  release/latest-linux.yml
95c425fda1dcb9f81cf93c22a1cba60acdb5fd7fc0abe33f900d2ae52eeb2952  release/SHA256SUMS.txt
55100e4bf09057580b3deaa851d0acf2111b5532b4706eff34afe0c2fc63f07f  release/builder-debug.yml
```

## `SHA256SUMS.txt`

```text
de2e6dd764e20249418ec80df513532cd06b5218caceaa057af05287763a38bf  latest-linux.yml
56d0dd14626e92bc783e8e64dccc6d7710326ddf9156ae433f7473045e0c8e1f  Roentgen-0.1.0.AppImage
```

`builder-debug.yml` は配布artifactではないためchecksum対象外。

## `latest-linux.yml`

```yaml
version: 0.1.0
files:
  - url: Roentgen-0.1.0.AppImage
    sha512: kWeIZbi7jkHQYKOwbsQBy8kLEfZj+odxoY1JC4+JUJbLMCPHZ1ahJXHpIrmRBurWfXs5G1bfj8HnYI18/II1Ng==
    size: 146718876
    blockMapSize: 151728
path: Roentgen-0.1.0.AppImage
sha512: kWeIZbi7jkHQYKOwbsQBy8kLEfZj+odxoY1JC4+JUJbLMCPHZ1ahJXHpIrmRBurWfXs5G1bfj8HnYI18/II1Ng==
releaseDate: '2026-05-07T05:39:51.198Z'
```

## `file`

```text
release/Roentgen-0.1.0.AppImage:           ELF 64-bit LSB executable, x86-64, version 1 (SYSV), dynamically linked, interpreter /lib64/ld-linux-x86-64.so.2, for GNU/Linux 2.6.18, stripped
release/linux-unpacked/roentgen:           ELF 64-bit LSB pie executable, x86-64, version 1 (SYSV), dynamically linked, interpreter /lib64/ld-linux-x86-64.so.2, for GNU/Linux 3.2.0, BuildID[sha1]=4f8d5ffc3677bf0e14be158152f8961286c537e5, stripped
release/linux-unpacked/resources/app.asar: Electron ASAR archive, header length: 1859420 bytes
```

## app.asar hygiene

| check | 結果 |
|---|---|
| `/dist/index.html` | present |
| `/dist-electron/main.js` | present |
| `/dist-electron/preload.js` | present |
| `*.dcm` / `*.dicom` | 0件 |
| `*.map` | 0件 |

`public/test.dcm` はDICOM regression/performance fixtureとしてrepoに存在するが、release artifactには同梱しない。

追加静的確認:

- `dist-electron` のbare runtime requireは現行buildで `electron-log/main` のみ。app.asarには `/node_modules/electron-log` が存在する。
- minify済みSentry bundle内の `require("%s")` 形式はエラーメッセージ用のplaceholderで、実package名ではないためgateではpackage specifier形式のみを対象にする。
- `@tailwindcss/vite` と `@fontsource/ibm-plex-mono` はビルド時依存としてdevDependenciesへ移動済み。現行artifactはこの変更前に生成されたものなので、依存区分変更後のAppImage/app.asar再生成はCIまたはMac mini側で実施する。

## 実行確認メモ

- `ldd release/linux-unpacked/roentgen` に `not found` は0件。
- `pnpm release:checksums && pnpm release:gate` は過去ラウンドの静的gate証跡としてPASS。局長直命後のWSL再検証範囲には含めず、再実行はCIまたはMac mini側で扱う。
- `pnpm test:e2e -- --project=renderer` は動的port 46321 で 8 passed。
- `pnpm test:e2e -- --project=renderer overlay-pixel.spec.ts --repeat-each=2` は動的port 37657 で 4 passed。
- `pnpm lint`, `pnpm typecheck`, `pnpm test` はPASS。最新unitは 41 files / 498 tests passed。
- `pnpm exec vitest run src/__tests__/release-packaging-config.test.ts` は 1 file / 7 tests passed。
- `pnpm install --frozen-lockfile --lockfile-only` はPASS。package.jsonとpnpm-lockの依存区分は整合。
- `scripts/release-gate-check.mjs` と `scripts/perf-soak.mjs` はWSL検知時に即時拒否するため、現行WSL再検証では実行しない。
- WSLでは `release/Roentgen-0.1.0.AppImage`、`release/linux-unpacked/roentgen`、Electron runtime smoke、Electron E2Eを起動していない。実画面確認は `docs/macmini-runtime-verification.md` と `docs/verification/2026-05-07/macmini-runtime-e2e.md` に従い `macmini-lan` 側で実施する。
