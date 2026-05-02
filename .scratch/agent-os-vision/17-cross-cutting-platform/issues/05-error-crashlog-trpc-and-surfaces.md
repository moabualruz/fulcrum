---
Status: ready-for-agent
Triage: AFK
Pillar: 17-cross-cutting-platform
Blocked-by: [17-cross-cutting-platform/issues/01-schema-migration-credentials-telemetry-errors-experiments.md]
PRD: .scratch/agent-os-vision/prds/17-cross-cutting-platform.md
Requirements: .scratch/agent-os-vision/REQUIREMENTS.md (Cross-Cutting Requirements section)
Decisions: [Q-cross-cut, B6, C4]
Vision: .scratch/agent-os-vision/EXTRA-GAPS.md (B6 error reporting)
Docs: https://bun.sh/docs/runtime/error-handling
---

# Local error crashlog — crashlog.ts global handler, error_logs tRPC, CLI + Web + TUI surfaces

## What to build

`src/errors/crashlog.ts`: installs global `process.on('uncaughtException')` + `process.on('unhandledRejection')` at Bun process start (called from `fulcrum init` and `fulcrum web`). Each crash: writes JSONL entry to `~/.fulcrum/state/errors/YYYY-MM-DD.jsonl` within 500ms; mirrors to `ErrorLog` via `errorLogRepo.createFromCrash(entry)`; scrubs absolute paths from stack traces; includes `os`, `arch`, `bun_version`, `fulcrum_version`, `recent_cli_command`, `recent_trpc_procedure`, `error_message`, `stack_trace`, `context`. `errorLogs.*` tRPC: `list(limit, since)` paginated, `get(id)`, `clear(before?)`. CLI: `fulcrum errors list/show/clear [--json]`. Web: `/settings/errors` (Pillar 16 issue 18). TUI: Settings → Errors tab.

Cuts through: uncaught exception → file written → `ErrorLog` entity → `errorLogs.list` tRPC → CLI `--json` returns entry → web page shows entry.

## Acceptance criteria

- [ ] `crashlog.ts` installed at process start; uncaught exception → JSONL file written within 500ms; `ErrorLog` entity mirrored.
- [ ] Stack trace scrubbing: absolute paths replaced with `<cwd>/relative/path`; no `~/.fulcrum/` paths leaked.
- [ ] `errorLogs.list`: paginated (default 20); `since` ISO filter; `--json` returns typed array.
- [ ] `errorLogs.get(id)`: full entry including stack trace; `errorLogs.clear(before)` deletes `ErrorLog` entities + JSONL lines.
- [ ] CLI `fulcrum errors list --json` returns same shape as tRPC.
- [ ] No PII in JSONL (no email addresses, no secret values, no file contents).
- [ ] Vitest: trigger uncaught exception in test harness → file written + `ErrorLog` entity within 500ms; unhandled rejection same.
- [ ] Doctor: `platform.crashlog_dir` check verifies `~/.fulcrum/state/errors/` exists and writable.

## Blocked by

- Issue 01 (schema) — `ErrorLog` entity must exist.
