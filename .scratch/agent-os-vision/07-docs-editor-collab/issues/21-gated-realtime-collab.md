---
Status: ready-for-agent
Triage: AFK
Pillar: 07-docs-editor-collab
Blocked-by: [02-tiptap-svelte-binding-spike.md, 06-slash-menu-core-marks-blocks.md]
PRD: .scratch/agent-os-vision/prds/07-docs-editor-collab.md
Requirements: .scratch/agent-os-vision/REQUIREMENTS.md (Pillar 7 section)
Decisions: [C1, C4]
Vision: .scratch/agent-os-vision/VISION-GAPS.md (Confluence-grade docs row)
Docs: [https://tiptap.dev/docs/hocuspocus/introduction, https://docs.yjs.dev/]
---

# Gated: real-time-collab-server — Yjs + Hocuspocus v4 (Bun) + y-indexeddb offline fallback

## Parent
PRD: `.scratch/agent-os-vision/prds/07-docs-editor-collab.md` (issues lines P7-47; gated features table)

## What to build
Feature-flagged (`FULCRUM_FEATURES=real-time-collab-server`) Yjs CRDT layer on top of the
TipTap editor. When OFF: standalone TipTap editor, `y-indexeddb` provider always-on for
offline persistence. When ON: in-process Hocuspocus v4 WebSocket server (Bun, single
process, port from env); one Hocuspocus room per `doc_id`; server persistence writes Yjs
binary to `doc_versions` (parallel to existing snapshot/delta path); collab cursors visible
(awareness); disconnect+reconnect no data loss. Shared flag with Pillar 6 task description
collab. Fallback: if Hocuspocus v4 has no release >6 months or crashes under Bun stress
test → custom Bun WS + y-websocket protocol (~300 lines).

## Acceptance criteria
- [ ] `FULCRUM_FEATURES=real-time-collab-server` OFF: editor works standalone; `y-indexeddb` persists draft between page refreshes; no WebSocket connection attempted
- [ ] Flag ON: Hocuspocus server starts in-process on `fulcrum web`; WebSocket endpoint at `ws://localhost:<port>/collab`
- [ ] Flag ON: two browser tabs editing same `doc_id` → changes converge (no conflict); CRDT merge correct
- [ ] Flag ON: collab cursors visible (colored named cursor per connected user); cursor moves in real-time
- [ ] Flag ON: disconnect tab → re-connect → no data loss; offline edits merged on reconnect
- [ ] Flag ON: Hocuspocus server persistence writes Yjs binary alongside existing `doc_versions` delta path; both coexist
- [ ] `y-indexeddb` always-on (flag-independent): offline edit in single tab → refresh → content preserved
- [ ] Stress test (flag ON): 5 concurrent connections, 1000 ops/s → no data corruption; Hocuspocus stays alive under Bun
- [ ] Failure gate: if stress test shows Bun crash → swap to custom `Bun.serve` + y-websocket protocol; document in ADR
- [ ] Tests: flag OFF path — no WebSocket import loaded; `y-indexeddb` persistence verified
- [ ] Tests: flag ON path — two Playwright pages editing same doc; final state identical in both tabs
- [ ] Web: presence avatars shown in `/docs/<slug>/edit` when flag ON; hidden when OFF
- [ ] CLI: `fulcrum docs show <slug> --json` always returns latest persisted `content_json` (not Yjs binary)
- [ ] TUI: no real-time collab in TUI (TipTap/Yjs unavailable); TUI editor uses `docs.update` tRPC path only

## Blocked by
`02-tiptap-svelte-binding-spike.md`, `06-slash-menu-core-marks-blocks.md`

## Notes / Tech-stack hints
- Yjs failure gate: confirmed corruption bug in production → Automerge 3 (MIT); document gate condition in PRD tech-stack table
- Hocuspocus port: `HOCUSPOCUS_PORT` env, default `1234`; documented in `fulcrum doctor` output
- Shared flag with Pillar 6: task description collab uses same Hocuspocus server (different room prefix `task:<id>` vs `doc:<id>`)
