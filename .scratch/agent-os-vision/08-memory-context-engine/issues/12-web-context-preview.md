---
Status: implemented
Triage: AFK
Pillar: 08-memory-context-engine
Blocked-by: [08-context-bundle-assembler.md, 11-web-memory-browser.md]
PRD: .scratch/agent-os-vision/prds/08-memory-context-engine.md
Requirements: .scratch/agent-os-vision/REQUIREMENTS.md (Pillar 8 section)
Decisions: [Q18, C4]
Vision: .scratch/agent-os-vision/VISION-GAPS.md (Context engine row)
Docs: PRD §Surfaces — Web /context/preview debug route; PRD §Surfaces — TUI context preview screen
---

## What to build

Debug/inspection surfaces for the assembled context bundle across all three surfaces:

**Web `/context/preview?task=<id>`** — debug route showing the assembled 5-slice bundle for a task: each slice in a collapsible panel, per-slice token counts, total vs budget bar. Calls `context.preview` tRPC (no agent_runs write). Read-only, org-member accessible.

**TUI context preview screen** (`cx` keybind or `C` from task screen) — 5 slices as collapsible panels, token budget progress bar, per-slice expand/collapse toggle. Reads from `context.preview` tRPC in-process.

Both surfaces read from the same `context.preview` tRPC procedure (slice 08). This slice is purely presentation.

## Acceptance criteria

- [x] `/context/preview?task=<id>` renders 5 slice panels with labels (Memories, Linked Docs, Recent Runs, Repo State, Skill Prompts)
- [x] Each panel shows: content preview (first 200 chars), token count, expand/collapse toggle
- [x] Token budget bar: visual progress bar showing `usedTokens / budgetTokens`; over-budget highlighted
- [x] Page does NOT write any `agent_runs` row (preview-only confirmed in integration test)
- [ ] TUI `cx`/`C` keybind opens context preview screen with same 5 slices
- [ ] TUI slice panels: expand/collapse on Enter; `q` closes screen
- [ ] TUI token budget bar renders as ASCII progress bar
- [x] Both surfaces show error state gracefully when task has no repo linked (slice 4 empty)
- [ ] Playwright e2e: navigate to `/context/preview?task=<fixture-id>` → assert 5 panels present
- [ ] CLI `fulcrum context preview --task <id> --json` output (from slice 10) matches web page data

## Blocked by

- `08-context-bundle-assembler.md`
- `11-web-memory-browser.md`
