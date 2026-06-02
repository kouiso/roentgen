<!-- AUTO-GENERATED from AGENTS.md by scripts/sync-ai-rules.sh -->
<!-- DO NOT HAND-EDIT — changes will be overwritten on next sync -->
<!-- To update: edit AGENTS.md, then run: bash scripts/sync-ai-rules.sh -->

# roentgen

DICOM image desktop viewer (ルバーノ用レントゲンビューア). Built with Electron + Vite + TypeScript.

> ⚠️ `.gemini/styleguide.md` and `.github/copilot-instructions.md` are auto-generated from this file
> by `scripts/sync-ai-rules.sh`. Do NOT edit them directly.

## Tech Stack

| Category | Technology |
|---|---|
| Framework | Electron + Vite |
| Language | TypeScript |
| Linter | Biome |
| Testing | Vitest (unit) + Playwright (e2e) |
| Packaging | electron-builder (Windows/macOS/Linux) |

## Commands

```bash
npm install              # Install dependencies
npm run dev              # Start dev server (Electron + Vite)
npm run build            # TypeScript compile + Vite build
npm run lint             # Biome lint check
npm run fix              # Biome auto-fix
npm test                 # Run Vitest unit tests
npm run test:e2e         # Run Playwright e2e tests
npm run typecheck        # TypeScript type check
npm run dist             # Build distributable (current platform)
npm run dist:mac         # macOS distributable
npm run dist:win         # Windows distributable
npm run dist:linux       # Linux distributable
```

## Coding Rules

- Comments: Japanese, explain *why* only (not what)
- Commit messages: English, Conventional Commits (`feat:`, `fix:`, `chore:`, etc.)
- No `any` types / No `@ts-ignore` / No `eslint-disable` (fix root cause)
- `git reset --hard/--soft/--mixed` forbidden
- `--no-verify` forbidden / `--force` forbidden (use `--force-with-lease` only)
