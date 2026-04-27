# Plugin shims

> Two of the five agents we target (OpenCode, Pi CLI) require their plugins / extensions to be **TypeScript modules loaded in-process**, not external executables. They cannot register `fulcrum hook <name>` directly in a settings file the way Claude Code, Codex, or Gemini can. These shims are the bridge: ~50 lines each, spawning the binary via `child_process.execSync` for each event.

## Files

| File | Drop into | Notes |
|---|---|---|
| `opencode/fulcrum.ts` | `~/.config/opencode/plugins/fulcrum.ts` (global) or `.opencode/plugins/fulcrum.ts` (project) | OpenCode's plugin API uses an exported `FulcrumPlugin` factory that returns event handlers. |
| `pi/fulcrum.ts` | `~/.pi/agent/extensions/fulcrum.ts` (global) or `.pi/extensions/fulcrum.ts` (project) | Pi's API is `pi.on(event, handler)` registration at top-level. Hot-reload via `/reload` after edits. |

Both shims wire all 8 fulcrum hooks (`index-check`, `index-rebuild`, `format`, `lint-gate`, `pm-policy`, `test-on-edit`, `audit-log`, `tool-output-router`). Customize the `ENABLED` set at the top of each file to opt in / out per recipe.

## Prerequisites

- `fulcrum` binary on `PATH` — install via `bash scripts/install.sh` from the repo. The shim invokes it with `execSync("fulcrum hook <name>")`.
- For OpenCode: a Bun or Node runtime is implicit (the agent itself is TS).
- For Pi: same — Pi loads `.ts` extensions directly via its bundled runtime.

## OpenCode → Crush

OpenCode (`opencode-ai/opencode`) was archived 2025-09-18; the actively-maintained successor is Charm's **Crush**. The plugin contract may differ. As of the current repo state, `shims/opencode/fulcrum.ts` is written against the last stable OpenCode plugin API. If migrating to Crush, the recipe-by-recipe wiring stays the same; only the surrounding event-handler shape changes — adapt by reading Crush's plugin docs and renaming the event names in this file.

## Why not register `fulcrum hook <name>` directly?

OpenCode and Pi do not provide a "run this external executable" hook surface. Their plugin APIs only invoke TypeScript handlers. The shim is the smallest valid bridge — for the other three agents (Claude Code, Codex, Gemini), use the snippets at `~/.fulcrum/hooks/snippets/<name>.snippet.md` (or run `fulcrum hooks enable <name>` to print them).
