---
Status: ready-for-agent
Triage: AFK
Pillar: artifacts
Blocked-by: [09-web-list-and-scoped-routes.md, 10-cli-commands.md, 11-tui-pane.md]
PRD: .scratch/agent-os-vision/prds/10-artifacts.md
Requirements: .scratch/agent-os-vision/REQUIREMENTS.md (Pillar 10 section)
Decisions: [Q25, C4]
Vision: .scratch/agent-os-vision/VISION-GAPS.md (Artifacts row)
Docs: []
---

# Playwright e2e + three-surface parity tests: upload, download, attach to task, prune dry-run, cross-surface consistency

## Parent
PRD: `.scratch/agent-os-vision/prds/10-artifacts.md` (Acceptance criteria items 4, 5, 11; issues 10-19)

## What to build
Playwright e2e test suite covering the full artifact lifecycle from all three surfaces. Also implements the three-surface parity integration tests: artifact uploaded via CLI visible in Web and TUI without restart; archived via Web reflected in CLI `--json` and TUI. Cross-surface consistency is the primary goal of this slice.

## Acceptance criteria
- [ ] Schema migration: N/A.
- [ ] tRPC procedure / module: N/A (tests only, not new procedures).
- [ ] Web surface: Playwright: upload file via Web drag-drop → artifact visible on `/tasks/<id>/artifacts`; download via Web; archive via Web → CLI `list --archived --json` shows `archived:true`; prune dry-run shows candidates without deleting.
- [ ] CLI command: `fulcrum artifacts upload ./fixture.txt --task-id <id> --json` → artifact visible in Web `/tasks/<id>/artifacts` and TUI task panel without restart.
- [ ] TUI screen: TUI smoke test: artifacts pane lists CLI-uploaded artifact; `a` archive → Web shows archived.
- [ ] Tests: Playwright suite: upload via Web, download, attach to task, view on task detail, prune dry-run; integration test: CLI upload → Web visible; Web archive → CLI `--json` archived; TUI reflects state from DB; dedup test (same file twice → two rows, same checksum, neither dropped); RED→GREEN.

## Blocked by
- `09-web-list-and-scoped-routes.md` — Web routes must exist.
- `10-cli-commands.md` — CLI commands must exist.
- `11-tui-pane.md` — TUI pane must exist.

## Notes / Tech-stack hints
- Three-surface parity test strategy: each test seeds data via CLI (fastest, no browser needed), then asserts via Web (Playwright) and TUI (process spawn + stdout parse or OpenTUI test harness).
- Playwright: use `page.dispatchEvent` for drag-drop simulation; verify file on disk via `fs.stat`.
- Dedup: same SHA-256 + different filenames → two rows; same file-content same filename same run → skip copy, reuse row.
- Run this suite as part of `bun run ci` artifacts gate.
