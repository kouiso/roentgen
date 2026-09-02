# 署名 / notarization release gate

## 現在の切り分け

この環境で完了できるものはLinux artifactの生成確認、hash証跡、DICOM/perf検証、UATテンプレート整備まで。macOS Developer ID署名、Apple notarization、Windows Authenticode署名は外部アカウントと証明書が必要なため、release gate上は外部待ちとして扱う。

## 外部入力が必要な項目

| 対象 | 必要物 | 完了条件 |
|---|---|---|
| macOS署名 | Apple Developer Program、Developer ID Application証明書、Team ID | `codesign --verify --deep --strict` が成功 |
| macOS notarization | App Store Connect API keyまたはnotarytool用認証情報 | `xcrun notarytool submit --wait` 成功、`xcrun stapler validate` 成功 |
| Windows署名 | OV/EV code signing certificate、timestamp server | `signtool verify /pa` が成功 |
| GitHub Release公開 | タグ、release権限、必要secret | dmg / exe / AppImageとchecksumをGitHub Releaseに添付 |

## Linuxの扱い

Linux AppImageはOS標準のnotarizationがないため、release gateでは以下で配布証跡とする。

- AppImage artifactのsha256
- `latest-linux.yml` のsha512/size/path
- `file` によるx86_64 ELF確認
- `ldd release/linux-unpacked/roentgen` で `not found` がないこと
- UATまたはE2Eで実起動とDICOM読込を確認すること

Linux証跡は `docs/verification/2026-05-07/linux-package-evidence.md` に記録する。

## electron-builder設定メモ

`electron-builder.yml` の `mac.identity: null` はローカル自動署名を抑止する設定。正式配布ではCIまたは署名用マシンで証明書を投入し、署名・notarization・staple済みartifactをrelease対象にする。

## 配布前チェック

- [ ] macOS arm64/x64 dmgがDeveloper ID署名済み
- [ ] macOS dmgまたはappがnotarization済み、staple検証済み
- [ ] Windows nsis installerがAuthenticode署名済み
- [ ] Linux AppImageのhashと`latest-linux.yml`が一致
- [ ] GitHub Releaseにartifact、checksum、UAT結果、release noteを添付
- [ ] UATで「日常使用可」判定を取得
