# Roentgen QA Runbook — 2026-05-18

AI-self-testable verification procedure. A future AI follows this top-to-bottom and produces PASS/FAIL evidence for every step **without human intervention**.

> Source of truth: this file. Verification artifact tag mandate (`[実機目視]` / `[CI]` / `[Codex自己申告]` / `[Static]` / `[コード解析]`) applies — every PASS/FAIL claim must be tagged.

---

## 0. Prerequisites

| Item | Expected state |
|---|---|
| Repo | `git@github.com:kouiso/roentgen.git`, branch `main` at or after `250ab2a comprehensive audit + essential fixes (#17)` |
| Node | `node -v` → ≥ v20 (engines is empty; use repo-tested 20.x) |
| pnpm | `pnpm -v` → ≥ 9 |
| OS | macOS / Linux with xvfb / Windows. CI uses Blacksmith Linux runner with xvfb |
| Drive credentials | `~/Library/Application Support/Roentgen/credentials.json` (macOS) — Google OAuth client JSON. ABSENCE is a tested code path; do NOT add it for Section 3 unless that section says so |
| Fixture DICOM | `e2e/fixtures/test.dcm` (tracked) — small synthetic DICOM. Loadable test corpus path also covered by `load-test-dicom` IPC |
| Evidence dir | `mkdir -p .qa-evidence/$(date +%Y-%m-%d)` (gitignored; do not commit) |

If any prerequisite fails:
- Stop. Output `BLOCKED: <prereq>`. Do not proceed.

---

## 1. Startup — copy-paste-runnable

```bash
cd $(git rev-parse --show-toplevel)
pnpm install --frozen-lockfile          # PASS = exit 0
pnpm audit --prod                        # PASS = 0 vulnerabilities (override of ip-address active)
pnpm typecheck                           # PASS = exit 0
pnpm lint                                # PASS = exit 0
pnpm test --run --reporter=dot           # PASS = "Tests N passed" with N ≥ 444
```

Then in **one terminal**:

```bash
pnpm dev > /tmp/roentgen-dev.log 2>&1 &
echo $! > /tmp/roentgen-dev.pid
until grep -q "ready in" /tmp/roentgen-dev.log; do sleep 1; done
```

Verify the Electron window opened (DevTools console can be inspected via Playwright `_electron.launch` or manual). PASS = process alive AND log shows `ready in`.

To run the canonical end-to-end suite **headed** on macOS (uses real Electron, not Xvfb):

```bash
pnpm exec playwright test --project=electron --reporter=line
```

PASS = both `e2e/electron/baseline.spec.ts` and `e2e/electron/clear-reload.spec.ts` finish green.

Headless Linux (CI parity): prefix with `xvfb-run --auto-servernum --server-args="-screen 0 1280x720x24"`.

If the Electron window never opens in local (Codex `app.whenReady()` hang seen on 2026-05-18): record `[Codex自己申告] LOCAL-ENV` and defer to CI (`[CI]`).

---

## 2. Critical-path verification — 6 paths

For each path: command, expected DOM/log, FAIL condition, evidence capture.

### Path A — DICOM drop / multi-file load

| # | Step | Expected | FAIL |
|---|---|---|---|
| A1 | Drag `e2e/fixtures/test.dcm` onto drop zone (`src/components/file-drop-zone.tsx`). Playwright: `electronApp.firstWindow().setInputFiles('input[type=file]', 'e2e/fixtures/test.dcm')` (if file input is hidden, use the IPC bridge or `electronAPI.selectDicomFiles` via injection). | One viewer pane shows the rendered image. Header chip count = 1. | No render after 3s, or header still says "DICOMファイルをドロップ" |
| A2 | Drop a directory containing 3 DICOMs (use `e2e/fixtures/` if multiple exist). | Thumbnail panel shows 3 entries. | Count ≠ 3 |
| A3 | Drop a non-DICOM file (e.g. `package.json`). | Error chip: "DICOMファイルではありません" appears in header (`src/App.tsx:81-98`). | Silent acceptance, viewer attempts render and crashes |
| A4 | Capture screenshot: `.qa-evidence/<date>/A-drop-load.png` | File exists, ≥1KB | — |

### Path B — WW/WC (window width / center) and view operations

| # | Step | Expected | FAIL |
|---|---|---|---|
| B1 | After A1, drag with mouse on viewer (default mode is WW/WC). Or use `electronAPI.windowState.setWwwc(2000, 200)` IPC. | Histogram visually changes; WW/WC value updates in DICOM overlay (`src/components/viewer/image-overlay.tsx`). | No visual change after 100ms |
| B2 | Press `R` (or click reset button). | WW/WC restored to dataset default. | Stays modified |
| B3 | Press `1` (preset 1) — verify preset shortcut. | UI label `馬用プリセット` shows active preset. | Preset not applied |
| B4 | Press `I` to invert. | Pixels negated; `isInverted` true reflected in DOM. | No change |
| B5 | Press `Cmd/Ctrl+P` print dialog. | Print preview opens; renderer sends `print-image` IPC (`electron/main.ts` near `print-image`). | No dialog |
| B6 | Capture: `.qa-evidence/<date>/B-wwwc-print.png` | File exists | — |

### Path C — Measurement with uncalibrated detection (Critical fix from PR#17 T2)

| # | Step | Expected | FAIL |
|---|---|---|---|
| C1 | Switch to measurement mode (`D` for distance). Click two points on the image. | Distance line drawn. **If PixelSpacing absent**: measurement renders in red AND "(未校正)" suffix appears (`src/components/viewer/measurement-overlay.tsx`). **If present**: white/green and "mm" suffix. | Both calibrated and uncalibrated render identically |
| C2 | Inspect via DOM query: `document.querySelectorAll('[data-calibrated="false"]').length` | ≥ 1 when fixture lacks PixelSpacing | 0 when it should be ≥1 |
| C3 | Click an existing measurement's delete handle (`<g onClick={onRemove}>` at `src/components/viewer/measurement-overlay.tsx:65,120`). | `window.confirm("この計測を削除しますか？")` dialog fires. Cancel → measurement remains. OK → removed. | Removed without confirm |
| C4 | After confirming delete, press `Ctrl/Cmd+Z`. | Measurement restored (single-step undo per PR#17 T3). | Stays deleted |
| C5 | Capture: `.qa-evidence/<date>/C-measure-uncalibrated.png`, `.qa-evidence/<date>/C-confirm-dialog.png` | Both files exist | — |

### Path D — Annotation (text/arrow/rect/ellipse/freehand) + confirm-delete

| # | Step | Expected | FAIL |
|---|---|---|---|
| D1 | Click "矢印" button. Click 2 points. | Arrow annotation drawn (`src/components/viewer/annotation-overlay.tsx`). | No render |
| D2 | Click "フリーハンド" (freehand from main commit `e960071`). Drag a curve. | Path renders; persisted in `electronAPI.saveAnnotations` IPC. | Path not saved (verify via `electronAPI.loadAnnotations` returns the same study UID's entry) |
| D3 | Click annotation's × handle. | `window.confirm("この注釈を削除しますか？")` fires. | Removed without confirm |
| D4 | Verify `aria-label` and `aria-pressed` on annotation toolbar buttons (PR#17 T7). E.g. `document.querySelector('[aria-label="フリーハンド"][aria-pressed]')`. | Element exists with both attributes. | Either attribute missing |
| D5 | Capture: `.qa-evidence/<date>/D-annotation.png` | File exists | — |

### Path E — Drive setup + sync (negative + positive paths)

> Negative path: run BEFORE placing credentials.json.

| # | Step | Expected | FAIL |
|---|---|---|---|
| E1 | Without credentials.json: click "Drive" chip. | Header chip shows "Drive 未設定" (`src/App.tsx` around `:127-134`). Tooltip explains: place credentials JSON at userData path. | Crash or silent no-op |
| E2 | Inspect `auth.status === "uninitialized"` via DevTools. | true | false |
| E3 | **Place credentials.json**, restart. Auth chip should now allow click → opens OAuth web flow via `electron/google-drive.ts`. | Browser opens to accounts.google.com. | No browser opens |
| E4 | After OAuth callback, header shows email. Trigger sync. | "Drive 同期中..." chip then download count. | Hangs > 30s without UI feedback |
| E5 | Logout via 12px LogOut icon (`src/App.tsx:160`). | Auth chip reverts to "Drive 未設定". | Stays logged in |
| E6 | Capture for both states: `.qa-evidence/<date>/E-drive-no-creds.png`, `.qa-evidence/<date>/E-drive-authed.png` | — | — |

### Path F — Destructive actions: All-clear and Crash reporter opt-in (PR#17 T4)

| # | Step | Expected | FAIL |
|---|---|---|---|
| F1 | Load any DICOM. Click "全クリア" (find via `screen.getByRole('button', {name: '全クリア'})`). | `window.confirm("全 DICOM をクリアします。よろしいですか？")` dialog. Cancel → no clear. | Clears immediately |
| F2 | After F1 OK confirm: all panes empty. | Pane count = 0; header chip back to drop-zone state. | DICOM still loaded |
| F3 | Open crash-reporter toggle (`src/components/crash-reporter-toggle.tsx`). | Default is OPT-IN (off). Toggle on → restart required notice. | No restart hint, or default is on |
| F4 | After enabling, kill `main` process and restart. Check Sentry initialised by inspecting `electron/main.ts` `Sentry.init` (PR#17 T5/T11 follow-up commits 80d4b5a, 2bd10ae). | DSN env present → Sentry init logs. DSN absent → no init, no crash. | DSN-absent path crashes electron |

---

## 3. Cross-cutting verification

### Security (PR#17 T1)

```bash
node -e '
const m=require("fs").readFileSync("electron/main.ts","utf8");
const win=m.match(/createWindow[\s\S]+?webPreferences:\s*{[^}]+}/g);
console.log("sandbox windows:", (m.match(/sandbox:\s*true/g)||[]).length);
console.log("contextIsolation windows:", (m.match(/contextIsolation:\s*true/g)||[]).length);
'
```

PASS criterion: **both counts ≥ 2** (main viewer + print window).

### IPC allow-list (PR#17 T1)

```bash
node -e '
const m=require("fs").readFileSync("electron/main.ts","utf8");
console.log("dialogReturnedRoots tracked:", m.includes("dialogReturnedRoots"));
console.log("ipc handler count:", (m.match(/ipcMain\.handle/g)||[]).length);
'
```

PASS criterion: `dialogReturnedRoots tracked: true` AND handler count ≥ 18.

### Schema migration path (PR#17 T9)

```bash
node -e '
const s=require("fs").readFileSync("src/utils/annotation-storage.ts","utf8");
console.log("migrate fn:", /export\s+(?:async\s+)?function\s+migrate|export\s+const\s+migrate/.test(s));
console.log("STORAGE_VERSION:", (s.match(/ANNOTATION_STORAGE_VERSION\s*=\s*\d+/)||[])[0]);
'
```

PASS criterion: `migrate fn: true`, `STORAGE_VERSION = 1` (identity migrate for now).

### Console hygiene (PR#17 T6)

```bash
grep -rnE 'console\.(log|debug)' src electron --include='*.ts' --include='*.tsx' | wc -l
```

PASS criterion: **0** matches. (`.warn` / `.error` allowed.)

### License + Override (PR#17 LICENSE + base)

```bash
test -f LICENSE && head -1 LICENSE                                # PASS = "MIT License"
node -e 'const p=require("./package.json"); console.log("license:",p.license,"override:",p.pnpm?.overrides?.["ip-address"])'
```

PASS criterion: `license: MIT`, `override: >=10.1.1`.

### Release-workflow verify gate (PR#17 T8)

```bash
node -e '
const y=require("fs").readFileSync(".github/workflows/release.yml","utf8");
console.log("verify job:", /\bverify:|\bname:\s*[Vv]erify/.test(y));
console.log("linux job:", /linux/i.test(y) && /pnpm dist:linux|electron-builder.*--linux/i.test(y));
console.log("needs deps:", /needs:\s*verify|needs:\s*\[?verify/.test(y));
'
```

PASS criterion: all three `true`.

---

## 4. Adversarial follow-ups (not yet implemented)

These are documented gaps the audit found but PR#17 did not close. Future AIs should track these as **separate Issues per directive (B)**:

| # | Risk | Source | Evidence | Acceptable closing |
|---|---|---|---|---|
| F1 | `dependency-review.yml` watches `package-lock.json`, repo uses `pnpm-lock.yaml` → review no-op | adversarial AR5 | `.github/workflows/dependency-review.yml:5-8` | fix watch path OR remove file (GHAS-blocked on private repo anyway) |
| F2 | print HTML escape relies on single utility — no XSS payload tests | AR9 | `electron/main.ts:163-180, 218-226` | unit test with malicious metadata payloads |
| F3 | Drive download writes `path.basename(remoteName)` unchecked | AR3 | `electron/google-drive.ts:413-415, 438-439` | reject names containing `/` `\` `..`, log + drop |
| F4 | `read-directory-recursive` returns non-DICOM paths to renderer (magic-byte check only in renderer) | AR4 | `electron/main.ts:506-512` | extension+magic filter in main |
| F5 | ErrorBoundary scope: only viewer subtree, async rejections leak | Codex Claim 3 CHALLENGED | `src/App.tsx:207-219`, `src/components/error-boundary.tsx:35-40` | wrap App root + `unhandledrejection` handler + per-async try/catch with toast |
| F6 | safeStorage unavailable → no UI explanation | AR8 | `electron/google-drive.ts:94-99, 113-119` | dialog explaining keychain issue |
| F7 | annotation save error only `console.warn` | AR7 | `src/components/viewer/dicom-viewer.tsx:264-272` | toast + Sentry breadcrumb |
| F8 | renderer drop expansion can allow-list arbitrary paths via drop event | AR1 | `src/components/file-drop-zone.tsx:69-118` | scope drop-expanded paths to OS-blessed roots |
| F9 | i18n: 61 hardcoded JA strings, no i18n lib | Phase 2 axis | `src/App.tsx:84-97, 130-179` etc. | `react-i18next` + `ja`/`en` catalog |
| F10 | First-run onboarding absent | UX audit Critical | `src/components/file-drop-zone.tsx:190-198` | onboarding modal + Drive setup wizard |

---

## 5. Completion gate

When ALL of the following are true:

1. Section 1 (Startup) — every command exits 0.
2. Section 2 (Paths A-F) — every numbered step PASS with screenshot/log evidence captured.
3. Section 3 — every PASS criterion met.
4. Evidence dir `.qa-evidence/<date>/` contains at minimum: `A-*.png`, `B-*.png`, `C-*.png`, `D-*.png`, `E-*.png`, `F-*.png`, plus a `runbook-results.json` mapping each step to `{status: "PASS"|"FAIL", tag, evidence_path}`.

Write `runbook-results.json` like:

```json
{
  "date": "2026-05-18",
  "branch": "main",
  "head": "250ab2a",
  "steps": {
    "A1": { "status": "PASS", "tag": "[実機目視]", "evidence_path": ".qa-evidence/2026-05-18/A-drop-load.png" },
    "C1": { "status": "PASS", "tag": "[実機目視]", "evidence_path": ".qa-evidence/2026-05-18/C-measure-uncalibrated.png" },
    "Sec-sandbox": { "status": "PASS", "tag": "[コード解析]", "evidence_path": "stdout://" }
  }
}
```

Only after this file exists, report: `[QA-RUNBOOK 2026-05-18] PASS — N/N steps, evidence at .qa-evidence/<date>/`.

If any step FAILs:
- Report `[QA-RUNBOOK 2026-05-18] FAIL @ <step-id>`
- Open Issue per directive B (Issue first, then PR if code change needed)
- Do NOT mark mission complete

---

## 6. Maintainer notes

- This runbook is the **single source of QA truth** for PR #17 changes and forward. When new audit findings land, append to Section 4 (and reference the Issue / PR in the row's "Acceptable closing" cell).
- For Codex / subagent runs, set `evidence_path` to the absolute path on the agent machine. For CI, evidence is the test-results / artifacts dir.
- Adversarial PR #16 lesson: never trust `git show <bare-path>` without first confirming `git rev-parse HEAD` matches the PR head; the runbook always cites `<file>:<line>` with the implicit anchor of `main@250ab2a`.

Verification source for this runbook itself: `[コード解析]` — built from PR #17 diff inspection plus existing main code; no `[実機目視]` was performed when writing the spec.
