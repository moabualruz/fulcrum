---
Status: completed
Triage: AFK
ImplRuntime: claude
Pillar: 06-tasks-and-scrum
Blocked-by: [10-tiptap-task-description]
PRD: .scratch/agent-os-vision/prds/06-tasks-and-scrum.md
Requirements: .scratch/agent-os-vision/REQUIREMENTS.md (Pillar 6 section)
Decisions: [C1, C5]
Vision: .scratch/agent-os-vision/VISION-GAPS.md (Multi-user/accounts/collaboration/SaaS row)
Docs: []
---

# Gated real-time collab — task description Yjs binding + Hocuspocus

## Parent
PRD: `.scratch/agent-os-vision/prds/06-tasks-and-scrum.md` (issues breakdown lines T6-53)

## What to build
`FULCRUM_FEATURES=real-time-collab-server` wires the task description TipTap field to
a Yjs Doc. In-process Hocuspocus v4 server manages document rooms keyed by `task_id`.
Collab cursor overlay shows collaborator name + colour. Flag OFF → TipTap standalone,
no Hocuspocus connection. Cross-references Pillar 5 (docs editor) — same Hocuspocus
server lifecycle.

## Acceptance criteria
- [x] Logic: `FULCRUM_FEATURES=real-time-collab-server` flag guard around Hocuspocus server startup in `src/collab/server.ts`; flag OFF → server not started, no port bound
- [x] Logic: Hocuspocus server room keyed by `task:<task_id>`; Yjs `Y.Doc` bound to TipTap `@tiptap/extension-collaboration`
- [x] Logic: Hocuspocus `onLoadDocument` fetches current `tiptap_content` from DB and hydrates Yjs doc; `onStoreDocument` debounce-saves Yjs doc → `tasks.update({tiptap_content})`
- [x] Logic: collab cursor extension (`@tiptap/extension-collaboration-cursor`) shows collaborator name + colour; colour assigned from user ID hash
- [x] Web: flag ON → TipTap mounts with `CollaborationExtension` + `CollaborationCursorExtension`; cursor overlay visible for concurrent editors
- [x] Web: flag OFF → TipTap mounts without collab extensions; no WebSocket connection attempt
- [x] CLI: unaffected (edits description as plain text; Hocuspocus persists on next doc load)
- [x] TUI: unaffected (plain textarea; description round-trips via `tasks.update`)
- [x] Tests (flag ON): two Hocuspocus clients connect to same `task:<id>` room; client A inserts "hello" → client B document contains "hello" (convergence test using `@hocuspocus/server` test utilities)
- [x] Tests (flag ON): cursor position broadcast — client A moves cursor → client B receives cursor update event
- [x] Tests (flag OFF): TipTap editor mounts without WebSocket (no `CollaborationExtension` in editor extensions list)
- [x] Tests: `onStoreDocument` debounce fires after 2s of inactivity (vitest fake timers)

## Blocked by
- 10-tiptap-task-description (TipTap editor already mounted for task description)

## Notes / Tech-stack hints
- Hocuspocus v4 (MIT): `@hocuspocus/server` + `@tiptap/extension-collaboration` + `@tiptap/extension-collaboration-cursor`
- Pillar 5 (docs editor) shares the same Hocuspocus server lifecycle — both gate on `real-time-collab-server` flag; server code lives in `src/collab/server.ts` shared between pillars
- Y-WebRTC P2P is the failure gate fallback if Hocuspocus v4 breaks
