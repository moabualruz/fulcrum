---
Status: implemented
ImplRuntime: codex
Triage: AFK
Pillar: artifacts
Blocked-by: [06-trpc-procedures.md, 08-preview-and-download.md]
PRD: .scratch/agent-os-vision/prds/10-artifacts.md
Requirements: .scratch/agent-os-vision/REQUIREMENTS.md (Pillar 10 section)
Decisions: [Q-tui-lib, C4]
Vision: .scratch/agent-os-vision/VISION-GAPS.md (Artifacts row)
Docs: []
---

# TUI artifacts pane: list + preview + keyboard ops (u/d/a/D/f/Enter)

## Parent
PRD: `.scratch/agent-os-vision/prds/10-artifacts.md` (Surfaces: TUI; issues 10-14)

## What to build
OpenTUI artifacts pane accessible from the main navigation. List view: filename, MIME badge, size, attachment badge (task/run/doc). Keyboard ops: `u` upload (file-path input prompt), `d` download (streams to `~/Downloads/<filename>`), `a` archive (confirm), `D` delete (confirm with file name), `Enter` detail/preview, `f` filter (overlay with MIME/project/run/task filters). Per-run and per-task artifact sub-views accessible from Runs and Task panels. Preview panel: text/Sixel-image/hex-binary per MIME (same logic as CLI/Web).

## Acceptance criteria
- [ ] Schema migration: N/A.
- [ ] tRPC procedure / module: pane reads from `artifacts.list` tRPC in-process; all mutations use tRPC procedures.
- [ ] Web surface: N/A.
- [ ] CLI command: N/A.
- [ ] TUI screen: Artifacts pane renders list; `u` prompts for file path and uploads; `d` downloads to `~/Downloads`; `a` archives with confirm prompt; `D` deletes with confirm; `Enter` shows preview; `f` opens filter overlay; per-run artifact sub-view accessible from Runs panel; attachment badge visible.
- [ ] Tests: OpenTUI component smoke tests (render without error, key dispatch, list populated from mock tRPC); TUI smoke-test checklist passes; RED→GREEN.

## Blocked by
- `06-trpc-procedures.md` — `artifacts.list`, `artifacts.archive`, `artifacts.delete` in-process.
- `08-preview-and-download.md` — preview logic reused.
- Pillar 15 (TUI) — OpenTUI framework; TUI pane registers into TUI navigation; if OpenTUI too immature → fall back to ratatui pane per Q-tui-lib gate.

## Notes / Tech-stack hints
- OpenTUI (Bun-native TS, JSX components); tRPC consumed in-process — no HTTP round-trip.
- Failure gate: if OpenTUI overlay API too immature, implement minimal list+preview with ratatui in the Rust sidecar workspace.
- Sixel: check `TERM` / `COLORTERM`; if unsupported show `[image: WxH, <filename>]`.
- `D` delete: show filename in confirm prompt to prevent accidental deletion; default to soft-delete; require second confirm for `--hard`.
