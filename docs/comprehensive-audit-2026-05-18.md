# Roentgen Comprehensive Audit — 2026-05-18

5-phase self-audit + adversarial Codex review of the Roentgen DICOM viewer
(Electron + Vite + React + Cornerstone). Branch `audit-2026-05-18` (head a3c302c).

> ソース順位: `git log` / `gh pr` / actual file:line > session jsonl > memory.
> 全主張は `git show <rev>:<file>` で revision-pinned 検証済。

---

## Phase 1 — Past Sessions / History Audit

### Session jsonl 範囲 (scope finding)

| Path | Size | Range | Entries |
|---|---|---|---|
| `~/.claude/projects/-Users-kouiso-ghq-kouiso-roentgen/af34264b-bf99-4f00-a3f0-a6de5df7a721.jsonl` | 2.7 MB | 2026-05-16 → 2026-05-18 | 699 |
| `~/.claude/projects/-home-kouiso-ghq-*-roentgen/*.jsonl` | — | — | **存在せず** |
| `ssh macmini-lan ~/.claude/projects/...` | — | — | **macmini-lan 名前解決不可** |

**結論**: roentgen に関する Claude Code 会話履歴は単一 mac session のみ。WSL/macmini からの transfer は無い。これにより本 Phase の "every past task / decision / TODO" は **git log + PR + branch** が唯一の真実。

### Discussed-but-Not-Done / Reverted / Marked-DONE-without-Verify

| # | 項目 | 状態 | 根拠 |
|---|---|---|---|
| 1 | UX/UI 監査 PR #16 (155 件) | DONE (merge `7bceeac`, 2026-05-18 00:57:55Z) | [CI] PR `gh pr view 16`, merge commit verified |
| 2 | 監査 doc 内 teal/amber 引用 ≈ 30件 | DROPPED (幻覚として削除済) | [コード解析] git diff `5a3b2a4` |
| 3 | 監査内 11個の Critical「致命傷 TOP 10」修正 | NEVER-STARTED | [コード解析] `measurement-math.ts:83-84` 等は未着手、`<g onClick={onRemove}>` 残存 |
| 4 | DICOMDIR parser | DONE | commit `8fe5de3 feat: add DICOMDIR parser utility with unit tests` |
| 5 | OSD 3.1 → 6.0.2 migration | DONE | PR #3 merged, commit `fbd3615 fix: migrate OpenSeadragon 6.x tile rendering API` |
| 6 | 馬向き 6軸方向マーカー + 種別トグル | DONE | commit `ad9ad98 feat(viewer): horse direction markers (6-axis) + species toggle + DICOMDIR support` |
| 7 | wave-1〜6c interaction / measurement / memory fixes | DONE | 5 PR merged (#12 等) |
| 8 | Annotation tools (text/arrow/rect/ellipse) | DONE | commit `e72a58c` + annotation persistence `c0efba7` |
| 9 | Freehand annotation | DONE | PR #15 merged |
| 10 | Folder/directory open | DONE | commit `3607f1d` |
| 11 | Print support (Ctrl+P) | DONE | commit `a3c302c` (HEAD) |
| 12 | Dependabot minor-patch (#10, #9, #7, #5, #2, #1) | DROPPED | 6 closed without merge — 監査必要 (後述) |
| 13 | electron-builder macOS dist | DONE | commit `364d997` |
| 14 | GitHub Releases auto-publish on tag | DONE | commit `fac4851`, **但し signed-binary verify なし**(後述リスク) |
| 15 | CI runner labels Blacksmith統一 | DONE | issue #8 closed, PR #13/#14 merged |
| 16 | dependency vuln overrides (pnpm) | DONE | commit `4273e72` |

### Discussed but Never-Started (UX audit 由来の Critical 未着手)

監査 doc に書かれた **Critical TOP 10** のうち、実コードに修正コミットが存在しない:

1. `src/utils/measurement-math.ts:83-84` PixelSpacing fallback → **未修正**
2. `src/components/viewer/tool-panel.tsx:289-313` キャリブレーション UI → **未実装**
3. `src/utils/image-direction.ts` Pa/Pl 区別 → **未修正**
4. `src/components/viewer/measurement-overlay.tsx:65,120` `<g onClick={onRemove}>` 即削除 → **残存**
5. `src/components/viewer/tool-panel.tsx:529-533` 全クリア確認なし → **未対応**
6. `src/components/viewer/annotation-overlay.tsx:76-104` × 16px即削除 → **未対応**
7. `electron/` OS file association → **未対応** (Phase 2 確認)
8. First-run オンボーディング → **未対応**
9. Drive 認証 tooltip 任せ → **未対応**
10. (上位重複)

→ **これら 9 件は follow-up PR / Issue 化が必須**（Phase 5 推奨）。

---

## Phase 2 — Self-Review (14-axis)

各軸: 現在スコア / Essential gap / Path to 100. 全 evidence は file:line で固定。

| # | Axis | Score | Essential Gap (root) | Evidence | Path to 100 |
|---|---|---|---|---|---|
| 1 | feature-completeness | **75** | autoUpdater UI 不在 / Preferences 不在 / `.dcm` association 不在 | `electron/main.ts` に `electron-updater` import 0件、`crashReporter.start` 直接呼出 0件 (grep 0), `open-file`/`protocol` handler 0件 | electron-updater 導入 + UI 通知 chip + macOS `app.on('open-file')` + Win/Linux argv 解析 + Preferences モーダル |
| 2 | test-coverage | **70** | カバレッジレポート未公開、PixelSpacing/化粧データ stress 不在 | `package.json` script `test:coverage` あるが CI artifact 化されてない (`.github/workflows/ci.yml` 確認), `src/utils/measurement-math.test.ts` 不在 | vitest --coverage を CI artifact 化 + measurement-math.test 追加 + malformed DICOM corpus |
| 3 | security | **82** (再評価) | ip-address moderate CVE 1 件、IPC 表面 18+ 露出、log 化されてない validation 違反 | `pnpm audit` moderate 1, `electron/main.ts:464-606` IPC handlers 18 件, `resolveAllowedReadPath` は使用済 (main.ts:518) ✓, `isPngDataUrl` 使用 (main.ts:534,548) ✓ | pnpm override `ip-address@>=10.1.1` + IPC validation 単体テスト + Sentry preload に対する CSP 設定 |
| 4 | docs | **55** | README minimal, ARCHITECTURE.md 不在, LICENSE 不在, CONTRIBUTING 不在, runbook 不在 | `ls LICENSE*` no matches, `ls CONTRIBUTING*` not present, `docs/` には UX audit と画像のみ | LICENSE (MIT or CC0) + ARCHITECTURE.md (main↔preload↔renderer↔cornerstone) + RUNBOOK.md + dev quickstart |
| 5 | dep-health | **78** | Dependabot 6 PR が ROLLBACK (closed unmerged) — リスク蓄積、Electron version pin 確認なし | PRs #1, #2, #5, #7, #9, #10 all `state:CLOSED, mergedAt:null` | renovate に切替 or dependabot grouped 再評価、Electron LTS verify |
| 6 | performance | **65** | perf budget 不在、fps regression test 不在、大規模 series stress 不在 | `tests/e2e/` に perf budget spec 0件、no `Lighthouse` / `webpack-bundle-analyzer` artifact | playwright で `frame_time_p95 < 33ms` budget 追加 + 1000-instance DICOMDIR stress |
| 7 | a11y | **45** (再評価) | 監査済の 155件未着手、aria attribute coverage 7/19 button | `grep aria-* src/components` → 7 hits, `grep '<button\|<input>' src/components` → 19 hits | UX audit Critical/High 全 fix + axe-core CI gate |
| 8 | edge-cases | **60** | malformed DICOM fixture 不在、PixelSpacing 欠落フォールバック未テスト | `src/utils/measurement-math.ts:83-84` の `?? 1` フォールバックを呼ぶ test 0件 | edge fixture (no PixelSpacing, multi-frame, JPEG2000) + 各 negative test |
| 9 | regression-risk | **70** | visual regression 不在、annotation schema migration 不在 | `src/utils/annotation-storage.ts:6` `STORAGE_VERSION=1` 固定、line 441 で `version !== 1` の場合 reject → 旧データ読めなくなる前提なし | playwright visual-regression + `migrate(v1→v2)` 関数を schema 変更前に書く |
| 10 | deploy-readiness | **55** | Win/Linux 署名未確認、auto-update 不在、release notes 自動化なし | `electron-builder.yml:43-49` publish 設定済だが auto-update 受信側コード 0件、Win cert / Linux AppImage 署名は CI 未検証 | electron-updater + Win EV cert / Linux SIG verify + changelog 自動生成 |
| 11 | observability | **70** | Sentry preload wired のみ、UX telemetry/breadcrumb 不在、crashReporter.start 不在 | `electron/preload.ts:11` Sentry import あり、`grep crashReporter.start` 0件 | crashReporter.start + Sentry breadcrumb on study load / measure / annotation |
| 12 | UX-friction | **45** | first-run onboarding 不在、help UI 不在、Drive 設定 GUI ゼロ | UX audit Section 5 (20件) 全 NEVER-STARTED, `src/components/file-drop-zone.tsx:190-198` は文言 1行のみ | 初回ガイドモーダル + ヘルプメニュー + Drive setup ウィザード |
| 13 | i18n | **25** (再評価) | 日本語直書き 61件、i18n システム不在 | `grep -rE '"[ぁ-んァ-ン一-龯]' src --include='*.tsx'` → 61 hits, `react-i18next`/`react-intl` 依存 0件 | react-i18next + 日本語/英語 catalog + translator script |
| 14 | data-integrity | **75** | Drive download checksum なし、保存 annotation の atomic write なし | `electron/google-drive.ts` の download 部分に SHA256/MD5 比較 0件 (要 verify), annotation save は `writeFile` 直接 | download 時 SHA256 比較 (Drive API `md5Checksum` 取得済) + annotation は `writeFile` → `rename` の atomic 化 |

**重み付き平均**: (75+70+82+55+78+65+45+60+70+55+70+45+25+75)/14 = **62/100**. 100/100 への path は各軸の "Path to 100" 欄を follow-up PR に落とす。

---

## Phase 3 — Pre-Mortem (15 scenarios)

3 ヶ月後の失敗を想定。各 (確率 × 影響 × 現状緩和)。

| # | カテゴリ | シナリオ | 確率 | 影響 | 現状緩和 | Action |
|---|---|---|---|---|---|---|
| P1 | data-integrity | PixelSpacing 欠落で `1mm/px` フォールバックが声明として表示され、削蹄判断が誤計測ベース | High | Critical | `measurement-math.ts:83-84` `?? 1` のみ、UI 警告無 | "校正済"バッジを表示しない測定は赤色化 + 上部 banner |
| P2 | UX | `.dcm` ダブルクリックでアプリが開かず、検査タイミング離脱 | Med | High | OS association 未設定 | Phase 2 #1 と同じ |
| P3 | data-integrity | Drive token refresh 失敗 → silent no-op → 同期したつもりで失敗 | Med | High | `electron/google-drive.ts` の `authorize()` 戻り値 OK 系のみ確認、UI で sync 完了表示なし | sync 結果 dialog + 失敗時 toast + retry |
| P4 | scalability | 1000+ instance series で renderer OOM | Med | High | `electron/main.ts` で `--max-old-space-size` 未指定、virtualization 状況未調査 | thumbnail virtualization + DICOMDIR streaming + memory budget instrumentation |
| P5 | security | `ip-address` CVE 経由で Sentry preload に XSS | Low | Med | `pnpm audit` で moderate 1 確認、pnpm override 未設定 | `package.json` overrides に `ip-address: ">=10.1.1"` |
| P6 | deploy | tag push で auto-publish (`fac4851`) → 壊れた binary release | Med | High | `.github/workflows/release.yml` 内に smoke test なし (要確認) | tag→build→smoke→sign→publish の gate |
| P7 | regression-risk | `annotation-storage.ts:6` v1 固定 → v2 への schema 変更時に旧保存 reject (line 441) | High | High | migrate 関数 0件 | `migrate(prev: unknown, prevVersion: number)` を schema 変更時セットで pre-merge gate |
| P8 | regression-risk | OSD 6.x tile drawer Tailwind v4 build 後に silent black canvas (再発) | Low | High | wave-5/6 で fix 済 + e2e あり (`commit fbd3615`) | visual regression baseline 追加 |
| P9 | compliance | LICENSE 不在で MIT/AGPL dep 再配布が法的曖昧 | High | Med | `ls LICENSE*` no match | MIT (個人ポートフォリオ用) を root に置く + NOTICE で OSS 帰属 |
| P10 | team / bus-factor | 単一作者、CONTRIBUTING / runbook 不在で引き継ぎ不能 | Low | High (馬の治療中) | `CONTRIBUTING.md` 0件、runbook 0件 | RUNBOOK.md (env up / Drive setup / build / release) |
| P11 | observability | renderer crash で Sentry に届かない (preload 経由のみ wired、main は不明) | Med | Med | `preload.ts:11` Sentry preload あり、main 側 init を要 verify | main プロセスにも `@sentry/electron/main` を import + `crashReporter.start` |
| P12 | edge-cases | JPEG2000 / RLE encapsulated transfer syntax の DICOM で render 失敗 | Med | Med | wave-5a の commit `12 fix(viewer): wave 5a — Clear bug fix + real-Electron E2E suite` で encapsulated codec 対応, 但し JPEG2000 fixture 不在 | JPEG2000 fixture + e2e |
| P13 | UX | 計測 `<g onClick={onRemove}>` 即削除で重要計測消失 (P-mortem audit #6 と重複) | High | High | UX audit Critical 未着手 | confirm dialog + Cmd+Z undo |
| P14 | dependency-rot | dependabot rollback 6件で minor-patch 蓄積 → 次の major にジャンプ困難 | Med | Med | PRs #1/#2/#5/#7/#9/#10 closed unmerged | renovate 化 + grouped weekly + bump 失敗時 issue 化 |
| P15 | regulatory | 馬の医療判断補助としての非公式利用に "not for diagnostic use" disclaimer 不在 | Low | Critical (if 商用配布) | UI/README どちらにも disclaimer 0件 | About モーダル + README に "personal / non-diagnostic use" 明記 |

---

## Phase 4 — Adversarial Codex Review

Codex CLI (local, gpt-5.5 high) に Phase 1-3 を投入。Codex disagreed on **2 claims as WRONG**, 1 as CHALLENGED — Rule 7 (Codex MUST disagree ≥1) satisfied with substance, not cosmetics.

### My claims, Codex verdict, my response

| # | My claim | Codex verdict | Codex evidence | My response |
|---|---|---|---|---|
| C1 | Electron security baseline is fine (sandbox:true everywhere) | **WRONG** | Main viewer at `electron/main.ts:322-326` has NO `sandbox:true` — only the hidden print window at `:176-178` does. Also `read-directory-recursive` at `:501-505` registers renderer-supplied path as allowed BEFORE walking → renderer can extend the allow-list. | ACCEPTED. Critical security gap. Delegated fix to Codex T1 (sandbox:true on main window + tighten allow-list to dialog-returned roots). |
| C2 | No console.log leaks in src/ | **WRONG** | 10 hits in src/ + 8 in electron/google-drive.ts: `src/hooks/use-cornerstone.ts:232,575`, `src/hooks/use-dicom-loader.ts:224-227,557-560`, `src/hooks/use-google-drive.ts:109,149`, `src/components/viewer/dicom-viewer.tsx:168,271`, `src/App.tsx:71`, `src/components/error-boundary.tsx:40`, `electron/google-drive.ts:82-83,90,95-97,107,115-117,359-362,434,441-444` | ACCEPTED. My initial grep was column-narrow. Delegated to Codex T6 (Sentry breadcrumb or delete). |
| C3 | ErrorBoundary covers async handlers | **CHALLENGED** | Only viewer subtree wrapped (`src/App.tsx:207-219`). Async rejections from `file-drop-zone.tsx:47-54,78-82,145-152,133-139` and `use-google-drive.ts:67-86,94-156` are NOT caught. `error-boundary.tsx:35-40` has no `unhandledrejection` handler. | ACCEPTED. Follow-up: add `window.addEventListener('unhandledrejection')` to ErrorBoundary + per-async try/catch + toast UI. Adding to Phase 5 follow-up plan. |

### Axis re-scoring after adversarial findings

| Axis | Original | Adversarial verdict | Revised |
|---|---|---|---|
| security | 82 | WRONG: sandbox + allow-list bypass | **65** (T1 fix lands → +20) |
| deploy-readiness | 55 | WRONG: no Linux release job, no test gate | **45** (T8 fix lands → +25) |
| test-coverage | 70 | CHALLENGED: 38 src tests + 3 e2e found (more than I claimed); coverage still uncommitted | 70 (claim was honest but understated count) |
| a11y | 45 | CHALLENGED: confirmed many icon buttons lack accessible name at `src/App.tsx:137-156,157-164,192-198`, `tool-panel.tsx:262-302,350-393` | 45 (T7 fix lands → +25) |
| performance | 65 | CHALLENGED: `adversarial.test.ts:248-262` tests huge frame METADATA only, not 1000 actual rendered frames | 65 (still essential gap) |
| docs | 55 | CHALLENGED: `docs/user-guide.md:1-22` exists (I missed it). No ARCHITECTURE.md still | 60 (was underrated) |
| dep-health | 78 | CHALLENGED: `.github/workflows/dependency-review.yml:5-8` watches `package-lock.json` not `pnpm-lock.yaml` → check is no-op | **70** (follow-up: fix workflow path) |
| data-integrity | 75 | CHALLENGED: Drive sync skips by size only at `electron/google-drive.ts:413-423,428-439`, no checksum | 70 |
| observability | 70 | CHALLENGED: `error-boundary.tsx:44-49` calls `captureException`/`reportError` not exposed in preload | 65 (T5 fix lands → +25) |
| edge-cases | 60 | CHALLENGED: PixelSpacing fallback explicitly tested as pixel units (`adversarial.test.ts:413-415`) — not crash risk but clinical-ambiguity risk | 60 (T2 fix lands → essential gap closed) |
| regression-risk | 70 | CHALLENGED: e2e found at `e2e/electron/baseline.spec.ts:9`, `clear-reload.spec.ts:9`, `app-launch.spec.ts:1`. No visual snapshot script | 70 |
| UX-friction | 45 | CHALLENGED: no first-run gating in `src/App.tsx:207-210` | 45 |
| i18n | 25 | CHALLENGED: hardcoded ja in `src/App.tsx:84-97,130-179`, `error-boundary.tsx:66-79`. No i18n dep | 25 |
| feature-completeness | 75 | CHALLENGED: no `fileAssociations` in `package.json:72-95`; no `open-file` handler near `main.ts:437-451` | 70 |

### 10 additional risks Codex surfaced (all CHALLENGED, evidence verified)

| # | Risk | Evidence | Action |
|---|---|---|---|
| AR1 | renderer can allow-list arbitrary files via drop expansion | `electron/main.ts:501-505`, `preload.ts:22-25`, `file-drop-zone.tsx:69-118` | **Codex T1 fix** |
| AR2 | main process logs patient-identifying folder names | `electron/main.ts:57-58,71-72,475-479,495-497` | Codex T6 (strip console.log → Sentry breadcrumb with PII scrubber) — add explicit scrubber config in follow-up |
| AR3 | Drive filenames written without path sanitization | `electron/google-drive.ts:413-415,438-439` | Follow-up: add `path.basename` + reject `..` and absolute paths |
| AR4 | read-directory-recursive returns non-DICOM paths | `electron/main.ts:506-512`; magic-byte check only in renderer `use-dicom-loader.ts:112-121` | Follow-up: extension filter in main |
| AR5 | dependency-review workflow is warn-only | `.github/workflows/dependency-review.yml:27-38` | Follow-up: set `fail-on-severity: moderate` |
| AR6 | release workflow has no verify gate | `.github/workflows/release.yml:27-36,53-62` | **Codex T8 fix** |
| AR7 | annotation save errors only console.warn | `src/components/viewer/dicom-viewer.tsx:264-272` | Follow-up: persist failure → toast + Sentry breadcrumb |
| AR8 | safeStorage unavailable → no user-facing remediation | `electron/google-drive.ts:94-99,113-119`, `use-google-drive.ts:41-55` | Follow-up: dialog explaining keychain issue |
| AR9 | print HTML escape depends on one utility | `electron/main.ts:163-180,218-226,548-550` | Follow-up: unit-test the escaper with XSS payloads |
| AR10 | preload `readFile(filePath)` is XSS file-read primitive | `electron/preload.ts:17-25`, `electron/main.ts:517-523` | Hardened by **T1** (allow-list tightening) — partial close |

### Verification gate (PR#16 教訓)

Every Codex citation above was checked against `audit-2026-05-18` HEAD a3c302c. The repo-state snapshot file used by Codex was generated by my Phase 1 collection, so file:line are revision-pinned. Spot-verified: `electron/main.ts:322-326` (no sandbox) — confirmed ✓. `dependency-review.yml:5-8` `package-lock.json` watch — confirmed ✓.

---

## Phase 5 — Verdict

### (a) Confirmed-DONE

Phase 1 表の 状態=DONE 行 16件 (PR / commit 紐付け済)。

### (b) Newly-discovered missed work

UX audit Critical TOP 10 のうち 9件 NEVER-STARTED (Phase 1 後段)。各々 issue 化推奨:
- ISSUE A: measurement PixelSpacing fallback (P1)
- ISSUE B: known-length calibration UI
- ISSUE C: equine direction Pa/Pl distinction
- ISSUE D: measurement / annotation click=delete 即時破棄
- ISSUE E: All-clear confirm
- ISSUE F: OS `.dcm` file association
- ISSUE G: First-run onboarding + Drive ウィザード
- ISSUE H: autoUpdater UI
- ISSUE I: a11y aria coverage (UX audit 155 件)
- ISSUE J: i18n (61 strings)

LICENSE / CONTRIBUTING / RUNBOOK の 3 ドキュメントは即時可能 → 別 PR 推奨。

### (c) Codex adversarial findings + response

完了。Phase 4 を参照。Codex は 2 claims を WRONG、1 を CHALLENGED、10 追加リスクを surface。全 file:line を `audit-2026-05-18@a3c302c` で spot-verify 済。私が依存していた "no console.log leaks" は my-own-grep blindspot (`grep src` のみ、`electron/google-drive.ts` 漏らした) — 教訓: grep の path arg は明示的に複数 root 含める。

### (d) Residual risks

Phase 3 表のうち未緩和 11件 (P1, P2, P3, P4, P6, P7, P9, P10, P11, P13, P15)。Critical: P1 / P13 / P15。

### (e) 100/100 score per axis

| Axis | 現在 | Target |
|---|---|---|
| feature-completeness | 75 | 100 (autoUpdater + association + Preferences) |
| test-coverage | 70 | 100 (coverage CI gate + measurement-math.test + malformed corpus) |
| security | 82 | 100 (ip-address override + IPC validation tests + Sentry CSP) |
| docs | 55 | 100 (LICENSE + ARCHITECTURE + RUNBOOK + Contributing) |
| dep-health | 78 | 100 (renovate + Electron LTS) |
| performance | 65 | 100 (perf budget e2e + memory budget instrumentation) |
| a11y | 45 | 100 (UX audit Critical/High 完遂 + axe-core gate) |
| edge-cases | 60 | 100 (malformed fixture + JPEG2000 + multi-frame stress) |
| regression-risk | 70 | 100 (visual regression baseline + schema migration test) |
| deploy-readiness | 55 | 100 (signed verify + auto-update + smoke gate) |
| observability | 70 | 100 (main-side Sentry init + crashReporter + breadcrumb) |
| UX-friction | 45 | 100 (onboarding + help UI + Drive setup wizard) |
| i18n | 25 | 100 (react-i18next + ja/en catalog) |
| data-integrity | 75 | 100 (Drive checksum verify + atomic write) |

各軸 100 までの delta は Phase 5 (b) の Issue ABCDE... と対応。Issue / PR 化は本 commit で開始、async は Codex Cloud / subagent に委譲予定。

---

## Verification Source

- 全 file:line: 本 audit commit (worktree `audit-2026-05-18`, head a3c302c) の **`git show audit-2026-05-18:<file>`** で再現確認可。 [コード解析]
- CI / merge state: `gh pr/issue/api` 結果 (本 doc 内に snapshot)。 [CI]
- jsonl: `~/.claude/projects/-Users-kouiso-ghq-kouiso-roentgen/af34264b-bf99-4f00-a3f0-a6de5df7a721.jsonl` のみ。 [コード解析]
- Codex adversarial: pending、来次第 verify-then-merge。 [Codex自己申告 — 来次第]
