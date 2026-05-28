# Issue #22 Demo Readiness Plan

Issue: [#22](https://github.com/kouiso/roentgen/issues/22)  
Deadline: 2026-06-18  
Goal: make Roentgen safe and convincing for the 守成クラブ車座商談会 reveal by closing known bugs, proving real Electron/DICOM workflows, and applying a focused UI/UX redesign.

## Readiness Rule

Roentgen is not demo-ready until every P0/P1 item below has:

- a reproduction note or verified static root cause
- a linked fix PR or explicit deferral reason
- `pnpm typecheck`, `pnpm lint`, `pnpm test`, and `pnpm build` result
- real Electron verification when the behavior depends on Electron, DICOM loading, file dialogs, printing, or local storage

## Deadline Board

| Bucket | Scope | Exit Criteria |
|---|---|---|
| Must fix before 2026-06-18 | measurement correctness, destructive actions, file open/import, first-run path, baseline app health | No P0/P1 unknowns; Electron smoke evidence exists |
| Should fix before demo | Drive setup clarity, toolbar hierarchy, settings/about affordances, status/error feedback | Demo flow has no unexplained dead ends |
| Safe to defer | full i18n catalog, visual regression suite, performance budget, auto-update UI | Deferral is documented and does not block reveal |
| External input | Linear/Slack-only bugs, real clinic fixture expectations, final visual approval | Exact question and owner are written on issue #22 |

## Known Bug Inventory

This inventory consolidates the active issue body plus existing repo-local audits:

- `docs/ux-audit-2026-05-16.md`
- `docs/comprehensive-audit-2026-05-18.md`
- `doc/qa-runbook-2026-05-18.md` (legacy `doc/` path; keep this exact relative path until that file is moved)

| Priority | Area | Source | Symptom / Risk | Current Evidence | Verification Route |
|---|---|---|---|---|---|
| P0 | Measurement correctness | UX audit TOP 10 | Pixel spacing fallback can display millimeters when spacing is absent or untrusted | `src/utils/measurement-math.ts`, `src/components/viewer/measurement-overlay.tsx`, QA Path C | Unit test plus Electron DICOM fixture with calibrated and uncalibrated cases |
| P0 | Measurement calibration | UX audit TOP 10 | No known-length calibration flow for images without reliable spacing | `src/components/viewer/tool-panel.tsx`, `src/hooks/use-measurement.ts` | UI test for calibration state and measurement label |
| P0 | Destructive actions | UX audit TOP 10 / QA Path F | All-clear, measurement delete, annotation delete can destroy work too easily | `src/App.tsx`, `src/components/viewer/measurement-overlay.tsx`, `src/components/viewer/annotation-overlay.tsx`, `src/components/viewer/tool-panel.tsx` | Unit tests plus Electron confirm/undo path |
| P0 | File association / import | UX audit TOP 10 | `.dcm` double-click and first open path can fail or feel unclear | `electron/main.ts`, `electron/preload.ts`, `src/components/file-drop-zone.tsx` | macOS `open-file` and argv handling tests where feasible |
| P1 | First-run onboarding | UX audit TOP 10 | Empty state does not explain supported formats, samples, or Drive path | `src/components/file-drop-zone.tsx` | Renderer screenshot and Electron smoke |
| P1 | Drive setup | UX audit TOP 10 / QA Path E | Credentials setup is hidden in tooltip-level UI | `src/App.tsx`, `src/hooks/use-google-drive.ts`, `electron/google-drive.ts` | Negative path without credentials and positive path when credentials exist |
| P1 | Error feedback | UX audit | Renderer, Drive, and read failures can be console-only or underexplained | `src/hooks/use-cornerstone.ts`, `src/hooks/use-google-drive.ts`, `src/components/file-drop-zone.tsx`, `src/components/error-boundary.tsx` | Error-state tests plus screenshot evidence |
| P1 | Accessibility controls | UX audit | Many icon/toggle controls need accessible names and focus states | `src/components/viewer/tool-panel.tsx`, `src/components/viewer/stack-slider.tsx`, `src/components/viewer/series-panel.tsx`, `src/components/viewer/measurement-overlay.tsx`, `src/components/viewer/annotation-overlay.tsx` | Testing Library role queries plus keyboard smoke |
| P1 | Demo IA / visual hierarchy | Issue #22 | Current layout assumes expert medical-tool familiarity and is hard to learn quickly | `src/App.tsx`, `src/components/viewer/tool-panel.tsx`, `src/components/file-drop-zone.tsx`, `src/components/viewer/series-panel.tsx` | Wireframes plus one bounded UI implementation PR after approval |
| P2 | Release readiness | Comprehensive audit | Release/signed-binary/update confidence remains incomplete | workflows, electron-builder config | CI and release workflow audit |
| P2 | i18n / copy system | Comprehensive audit | Hardcoded Japanese strings make copy consistency hard | `src/**/*.tsx` | Catalog extraction after demo-critical flows stabilize |

## UI/UX Redesign Direction

The redesign should optimize the first five minutes of a demo:

1. The user understands where to put files and what formats are accepted.
2. A loaded study clearly exposes patient/study context without overwhelming the image.
3. Primary tools are grouped by job: view, measure, annotate, compare, export.
4. Destructive actions use confirmation or undo.
5. Status and errors say what happened and what the user can do next.

### Proposed IA

| Region | Purpose | Notes |
|---|---|---|
| Header | app identity, current study, sync/import status, global menu | Keep it stable and avoid chip overflow |
| Left rail | study/series/frame navigation | Make thumbnails and series selection scan-friendly |
| Center viewer | DICOM canvas, overlays, measurements, annotations | Preserve maximum image area |
| Right tool panel | mode tools, window/level, cine, layout, export | Separate modes, toggles, and one-shot actions visually |
| Bottom/status strip | frame index, spacing/calibration, errors, keyboard hints | Keep critical image metadata visible |

## Staged Delivery Plan

| Stage | PR Scope | Files / Areas | Required Evidence |
|---|---|---|---|
| 1 | Baseline issue #22 board and verification checklist | `docs/issue-22-demo-readiness.md` | `git diff --check` |
| 2 | P0 destructive-action safety | `src/App.tsx`, `src/components/viewer/measurement-overlay.tsx`, `src/components/viewer/annotation-overlay.tsx`, `src/components/viewer/tool-panel.tsx`, `src/components/viewer/__tests__/*.test.tsx` | `pnpm test`, Electron confirm/undo smoke |
| 3 | P0 measurement trust | `src/utils/measurement-math.ts`, `src/components/viewer/measurement-overlay.tsx`, `src/hooks/use-measurement.ts`, `src/utils/*.test.ts` | calibrated/uncalibrated unit tests and Electron fixture |
| 4 | First-run import/onboarding | `src/components/file-drop-zone.tsx`, `src/App.tsx`, `docs/`, screenshot artifacts | renderer screenshot and Electron smoke |
| 5 | Drive setup and error feedback | `src/hooks/use-google-drive.ts`, `electron/google-drive.ts`, `src/App.tsx`, `src/components/error-boundary.tsx` | no-credentials and credentials-present paths |
| 6 | Demo IA visual pass | `src/App.tsx`, `src/components/viewer/series-panel.tsx`, `src/components/viewer/tool-panel.tsx`, `src/components/viewer/stack-slider.tsx` | desktop screenshot review and no layout regressions |
| 7 | Release/demo verification | QA runbook, workflows, release notes | full command matrix and issue #22 update |

## Verification Matrix

| Command | Required For | Pass Criteria |
|---|---|---|
| `pnpm typecheck` | code changes | exit 0 |
| `pnpm lint` | code changes | exit 0 |
| `pnpm test` | logic/UI changes | exit 0 |
| `pnpm build` | every implementation PR | exit 0 |
| `pnpm exec playwright test --project=electron` | Electron/DICOM behavior | relevant path green or blocker recorded |
| `git diff --check` | docs-only PR | exit 0 |

## Open Questions

| Question | Needed From | Why It Matters |
|---|---|---|
| Which Slack/Linear bugs are still active? | project owner | Issue #22 explicitly names Slack/Linear as bug sources |
| What exact demo fixture will be shown on 2026-06-18? | project owner | Measurement, orientation, and performance checks need realistic data |
| Is Drive sync part of the live demo? | project owner | It changes P1/P2 priority |
| Should the demo say "diagnostic viewer" or "image review viewer"? | project owner | Copy and risk posture should be explicit |

## Next Action

Start Stage 2 unless project owner provides an external P0 bug list first. Stage 2 is the smallest high-value implementation slice because it lowers data-loss risk without changing DICOM rendering internals or the broader redesign.
