---
Status: implemented
ImplRuntime: claude
Triage: AFK
Pillar: notifications-activity-audit
Blocked-by: [06-trpc-audit-procedures.md]
PRD: .scratch/agent-os-vision/prds/12-notifications-activity-audit.md
Requirements: .scratch/agent-os-vision/REQUIREMENTS.md (Pillar 12 section)
Decisions: [A4, Q-cli-shape, C4]
Vision: .scratch/agent-os-vision/VISION-GAPS.md (Audit log row)
Docs: []
---

# CLI audit commands: fulcrum audit query + export --format csv|json --output

## Parent
PRD: `.scratch/agent-os-vision/prds/12-notifications-activity-audit.md` (Issues T12-23, T12-24)

## What to build
`fulcrum audit query [--project <id>] [--user <id>] [--kind <kind>] [--verb <verb>] [--since <ISO>] [--until <ISO>] [--limit <n>] [--json]` — calls `audit.query` tRPC; outputs event array. `fulcrum audit export --format csv|json [same filters] [--output <file>]` — calls `audit.export`; streams to file or stdout; handles large-export `{jobId}` response by polling `audit.exportStatus` until complete. Both with `--help`. Per A4: these commands are the compliance export mechanism.

## Acceptance criteria
- [x] Schema migration: N/A.
- [x] tRPC procedure / module: codegen or thin wrappers around `audit.query` + `audit.export`.
- [x] Web surface: N/A.
- [x] CLI command: `fulcrum audit query --kind task --since 2026-01-01 --json` returns filtered events as JSON array; `fulcrum audit export --format csv --output ./audit.csv` writes CSV file; `fulcrum audit export --format json` streams to stdout; large export (>100k) → polls `exportStatus` and waits; `--until` + `--since` parse ISO dates.
- [x] TUI screen: N/A (TUI audit in separate slice).
- [x] Tests: `audit query` filter combos tested; CSV output has correct headers + rows; JSON output is valid array; `--output` writes to file path; large export polling: mock job returns `completed` → file downloaded; RED→GREEN.

## Blocked by
- `06-trpc-audit-procedures.md` — `audit.query` + `audit.export` + `audit.exportStatus`.

## Notes / Tech-stack hints
- Large export polling: `while (status !== 'completed') { await sleep(2000); status = await trpc.audit.exportStatus(jobId); }` then download file URL.
- CSV streaming: pipe `audit.export` response through `csv-stringify` (MIT) or hand-roll (headers + rows); flush to `--output` file or stdout.
- Per A4: `fulcrum audit export` is the compliance export mechanism; document in `--help` that output includes all event payload fields.
