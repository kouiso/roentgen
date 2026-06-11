## Codex Cloud
**ENV_ID**: `69f3394fca3c81918b2efe1120ffeecb`  — `codex cloud exec --env 69f3394fca3c81918b2efe1120ffeecb "<task>"`

## プロジェクトの存在理由

自分の馬のDICOM画像を見て馬の状況を詳しく把握するためのアプリ。非獣医でも使いやすく、参照リポジトリと同等の全機能がバグなく動くこと。商用レベル品質だが売るつもりはない。非公開ポートフォリオにもなる。仲良い獣医には希望あれば使わせる。

---

# context-mode — MANDATORY routing rules

You have context-mode MCP tools available. These rules are NOT optional — they protect your context window from flooding. A single unrouted command can dump 56 KB into context and waste the entire session.

## BLOCKED commands — do NOT attempt these

### curl / wget — BLOCKED
Any Bash command containing `curl` or `wget` is intercepted and replaced with an error message. Do NOT retry.
Instead use:
- `ctx_fetch_and_index(url, source)` to fetch and index web pages
- `ctx_execute(language: "javascript", code: "const r = await fetch(...)")` to run HTTP calls in sandbox

### Inline HTTP — BLOCKED
Any Bash command containing `fetch('http`, `requests.get(`, `requests.post(`, `http.get(`, or `http.request(` is intercepted and replaced with an error message. Do NOT retry with Bash.
Instead use:
- `ctx_execute(language, code)` to run HTTP calls in sandbox — only stdout enters context

### WebFetch — BLOCKED
WebFetch calls are denied entirely. The URL is extracted and you are told to use `ctx_fetch_and_index` instead.
Instead use:
- `ctx_fetch_and_index(url, source)` then `ctx_search(queries)` to query the indexed content

## REDIRECTED tools — use sandbox equivalents

### Bash (>20 lines output)
Bash is ONLY for: `git`, `mkdir`, `rm`, `mv`, `cd`, `ls`, `npm install`, `pip install`, and other short-output commands.
For everything else, use:
- `ctx_batch_execute(commands, queries)` — run multiple commands + search in ONE call
- `ctx_execute(language: "shell", code: "...")` — run in sandbox, only stdout enters context

### Read (for analysis)
If you are reading a file to **Edit** it → Read is correct (Edit needs content in context).
If you are reading to **analyze, explore, or summarize** → use `ctx_execute_file(path, language, code)` instead. Only your printed summary enters context. The raw file content stays in the sandbox.

### Grep (large results)
Grep results can flood context. Use `ctx_execute(language: "shell", code: "grep ...")` to run searches in sandbox. Only your printed summary enters context.

## Tool selection hierarchy

1. **GATHER**: `ctx_batch_execute(commands, queries)` — Primary tool. Runs all commands, auto-indexes output, returns search results. ONE call replaces 30+ individual calls.
2. **FOLLOW-UP**: `ctx_search(queries: ["q1", "q2", ...])` — Query indexed content. Pass ALL questions as array in ONE call.
3. **PROCESSING**: `ctx_execute(language, code)` | `ctx_execute_file(path, language, code)` — Sandbox execution. Only stdout enters context.
4. **WEB**: `ctx_fetch_and_index(url, source)` then `ctx_search(queries)` — Fetch, chunk, index, query. Raw HTML never enters context.
5. **INDEX**: `ctx_index(content, source)` — Store content in FTS5 knowledge base for later search.

## Subagent routing

When spawning subagents (Agent/Task tool), the routing block is automatically injected into their prompt. Bash-type subagents are upgraded to general-purpose so they have access to MCP tools. You do NOT need to manually instruct subagents about context-mode.

## Output constraints

- Keep responses under 500 words.
- Write artifacts (code, configs, PRDs) to FILES — never return them as inline text. Return only: file path + 1-line description.
- When indexing content, use descriptive source labels so others can `ctx_search(source: "label")` later.

## ctx commands

| Command | Action |
|---------|--------|
| `ctx stats` | Call the `ctx_stats` MCP tool and display the full output verbatim |
| `ctx doctor` | Call the `ctx_doctor` MCP tool, run the returned shell command, display as checklist |
| `ctx upgrade` | Call the `ctx_upgrade` MCP tool, run the returned shell command, display as checklist |

---

# Verification Protocol — MANDATORY (Electron + Vite project)

## Core Rule

NEVER ask the user to verify behavior. NEVER say "Electronだから検証できない" or list reasons why verification is partial. The user has explicitly said this prohibition applies *especially* to this project. Find the path and use it.

**Confidence**: High

## Why this rule exists

User feedback (2026-04-11): "あなたはいつもこのプロジェクトだけ自分で動作確認してくれず、私にやらせようとしてきます。" Repeated violations of `autonomous-verification.md` despite the rule existing globally. This project-local rule is the enforcement floor.

## Required Verification Sequence (after ANY code change)

Execute IN ORDER. Do not skip steps. Do not stop early.

1. **`pnpm typecheck`** — TypeScript errors must be zero
2. **`pnpm lint`** — Biome must pass
3. **`pnpm test`** — Vitest unit tests must pass
4. **`pnpm dev`** — Vite + `vite-plugin-electron` launches the full Electron app
   - The plugin starts both main process and renderer
   - Run with `run_in_background: true` via Bash
5. **Connect Playwright/Chrome DevTools MCP to the renderer**
   - Renderer URL: `http://localhost:5173` (Vite default)
   - Use `mcp__playwright__browser_navigate` or `mcp__chrome-devtools__navigate_page`
   - Take a screenshot + snapshot
   - Read console messages for errors
6. **Verify the changed UI/feature** — interact with the actual element you modified
7. **Kill the dev server** when done

## Banned phrases (zero tolerance)

```
❌ 「ブラウザから確認してください」
❌ 「Electronだから検証できない」
❌ 「Playwrightだけでは不十分」（言い訳として使う場合）
❌ 「動作確認お願いします」
❌ 「localhost:5173 で確認してみてください」
❌ "Please check in your browser"
❌ "Electron IPC can't be verified"
```

## When something is genuinely unverifiable

IF a specific code path (e.g., native file dialog, OS-level menu) cannot be verified by Playwright/CDP THEN:
1. Verify EVERYTHING ELSE first (typecheck, lint, test, UI render, console)
2. Explicitly state: "以下は自動検証済み: [list]. 残るElectron固有部分 [specific item] は手動検証が必要 — 手順: [exact steps the user should take]"
3. Never use this as an excuse to skip steps 1-6 above

## Self-Check Gate (before saying "done")

All must be Yes:

| # | Question | If No |
|---|---|---|
| 1 | Did I run typecheck/lint/test? | Run them now |
| 2 | Did I start `pnpm dev` and confirm it booted without errors? | Start it now |
| 3 | Did I navigate Playwright/CDP to the renderer URL? | Do it now |
| 4 | Did I take a screenshot of the changed UI? | Take it now |
| 5 | Did I read console messages for errors? | Read them now |
| 6 | If any part is unverifiable, did I explicitly enumerate exactly what and why? | Enumerate now |
