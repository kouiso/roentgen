# Synthetic public test evidence — 2026-10-24

These are new current-state captures of the actual Roentgen renderer using only
synthetic data. They do not recreate historical before/after states or establish
native Electron, clinical, signing or release readiness.

- Source snapshot based on `e3670426fe8ba0a33d60868e35a54319fc4c8c04`.
- Exact app source-tree SHA-256: `1fc9c388898155706483c1f86efc22fa39425319d0e94fff22b7ee03e7716580`.
- Capture time: `2026-10-24T19:19:00.519Z`; headless Chromium `149.0.7827.55`,
  Playwright 1.59.1, viewport 1440 × 1000, device scale 1.
- Synthetic fixture version: `SYNTHETIC_DX_1`; input/script/image hashes and the
  individual source-file hashes are in [the manifest](synthetic-ui-capture.json).
- The source digest identifies the intended working-tree snapshot captured before
  the single cleanup commit. Verify its listed source-file hashes against that
  commit; the caption does not claim to contain a later commit's SHA.
- The actual React/Cornerstone/OpenSeadragon renderer ran on localhost with a
  fixture-only IPC test bridge. No real DICOM, Drive, credentials or other external
  service was used. The browser context and server were closed after the run.
- Every image has a separate synthetic/version/source caption outside the app.
  No real medical pixels were edited, masked or copied into these artifacts.

| Capture | Actual observation |
| --- | --- |
| [Single pane](synthetic-single-pane-default.png) | One nonempty grayscale canvas after explicit reset |
| [Numeric controls](synthetic-single-pane-window-controls.png) | Expanded controls; keyboard brightness changes WW/WC and real pixels; reset restores baseline |
| [Right 90°](synthetic-single-pane-rotate90.png) | Rotation changes real pixels; reset restores baseline |
| [Two series](synthetic-two-panes.png) | Two generated series produce automatic side-by-side nonempty canvases |

All **15 capture checks pass**, with zero console/page errors or external service
requests. This does not claim identical viewport fitting between the two panes.

## Known unrelated failure retained

The extra **two panes → one pane → two panes** round-trip still fails on unchanged
main renderer behavior: only one canvas returns instead of two after a 15-second
wait. The manifest records FAIL and the capture command intentionally exits **1**.
The separate lifecycle fix is not part of this synthetic-data cleanup. The fourth
image documents the successful automatic two-series layout before this additional
check; it does not imply that the round-trip was repaired.

The full release gate remains **FAIL/BLOCKED**. Native runtime evidence, existing
P0/reference checks, Linux release artifacts/checksums and manual UAT/signing
requirements remain separate. No release-readiness result is changed by these PNGs.

## Real-data boundary and historical evidence

Public automated tests and screenshots must use synthetic data. Real DICOM for
separately authorized manual testing must stay outside tracked/public assets and
use separately authorized restricted Drive access. The current folder's sharing
has not been verified, so this document includes no Drive link and makes no claim
about its ACL. Synthetic automated tests must not fetch real data.

The following historical image paths were removed from the current tree and
replaced with explicitly new generated-data evidence. Their Git history was not
rewritten. This does not repeat or relabel the original historical verification.

| Old filename under `../2026-10-21/` | New evidence |
| --- | --- |
| `ui-sections-before.png` | `synthetic-single-pane-default.png` (current baseline only) |
| `ui-sections-after-numeric.png` | `synthetic-single-pane-window-controls.png` |
| `ui-sections-after-rotate.png` | `synthetic-single-pane-rotate90.png` |
| `ui-sections-after-two-panes.png` | `synthetic-two-panes.png` (automatic layout only) |

Old source history, caches/forks and existing releases are not sanitized by this
forward cleanup. Historical installer inclusion is unverified; no installer was
executed or downloaded for this change.

## Reproduce

Use locked dependencies and an existing test browser:

```bash
RAYON_NUM_THREADS=2 UV_THREADPOOL_SIZE=2 \
ROENTGEN_CAPTURE_BROWSER=/absolute/path/to/existing/headless-chromium \
node scripts/capture-synthetic-ui.mjs
```

The script uses only `127.0.0.1:5173` with strict port selection, blocks external
service requests and writes into ignored `test-results/synthetic-ui/`. A permitted
localhost bind is required. Read both the manifest and exit code; an extra failed
check is not silently changed to PASS.
