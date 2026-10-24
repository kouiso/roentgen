# Synthetic DICOM regression fixture

`public/test.dcm` is generated entirely by
`scripts/generate-synthetic-dicom.mjs`. The generator has no input image or
metadata file. It creates a horizontal grayscale gradient and a bright rectangle
from arithmetic, with synthetic patient metadata and UUID-derived fixture UIDs.
It contains no source patient pixels, dates, institution, operator, owner or
private tags. It is test data and must not be used as a clinical image.

Regenerate from the repository root:

```bash
node scripts/generate-synthetic-dicom.mjs
node --test .github/ci/dicom-fixture.test.mjs
pnpm exec vitest run src/test/dicom-fixture.test.ts src/utils/dicom-parser.test.ts src/utils/dicom-text.test.ts
```

The independent `dicom-parser` checks enforce an exact metadata allowlist and
synthetic values, generated-file equality, complete pixel data and grayscale
samples. These checks complement the loader/thumbnail regression test. Do not
weaken the allowlist to accept real patient data or copied private fields.

| Property | Fixture contract |
| --- | --- |
| Generator version | `SYNTHETIC_DX_1` |
| Modality / SOP class | DX / Digital X-Ray Image Storage for Presentation |
| Transfer syntax | Explicit VR Little Endian (`1.2.840.10008.1.2.1`) |
| Rows × columns | 1996 × 2396 |
| Pixels | One frame; one unsigned 16-bit sample; 14 stored bits |
| Photometric interpretation | MONOCHROME2 |
| Window center / width | 8191 / 16383 |
| Pixel spacing | Synthetic 0.2 × 0.2 mm |
| Character set | UTF-8 (`ISO_IR 192`), synthetic Japanese DICOM PN groups |
| Pixel data bytes | 9,564,832 |
| File bytes | 9,566,042 |
| SHA-256 | `027d4dddb4add107899ad3f807d0c82c72ced4f3cb47ccdd10aea5c05e810211` |

Shift_JIS with an incorrect ASCII declaration, PN group separators, padding,
Latin-1, empty names and duplicate groups are covered separately in
`src/utils/dicom-text.test.ts`. Corrupt, unsupported-transfer-syntax and DICOMDIR
cases remain separate fixtures/tests; this file is a valid uncompressed DX case.

`createSyntheticDicom({ comparison: true })` generates a second synthetic series
for actual multi-pane UI checks. Only the generated SOP/series UIDs and series
number differ; the privacy test verifies that every other element, including
the generated pixels, is identical. The default checked-in fixture is unchanged.

Current renderer captures and the separately recorded pre-existing layout issue are
documented in [the synthetic UI verification](verification/2026-10-24/README.md).

The file-size assertion in the loader test follows the actual synthetic input.
Independent metadata, pixel-byte-length and generated-file equality assertions
protect the contract rather than retaining an old examination file's byte count.

For documentation recaptures, use only this synthetic fixture. Label each capture
as **synthetic fixture**, record `SYNTHETIC_DX_1` and the exact app source digest being
captured, and describe the actions that were actually repeated. A recapture is new
evidence; do not present it as the original historical verification. Do not mask
real examination imagery and label it synthetic.

Vite's default public-directory handling can copy this file into `dist/test.dcm`
and serve it in development. The electron-builder configuration excludes
`dist/**/*.dcm` and `dist/**/*.dicom`; the release gate additionally checks that
`app.asar` has no DICOM files. These source/configuration checks do not prove what
an existing historical installer contains. Source archives include tracked
fixtures, and a forward replacement does not erase earlier Git history.


Public automated fixtures and screenshots must contain only synthetic data. Real
DICOM for separately authorized manual testing must remain outside tracked/public
assets and use separately authorized restricted Google Drive access. The current
folder ACL has not been verified; no link is published here and no access restriction
is asserted for that unverified folder. Synthetic tests must never fetch real data.
