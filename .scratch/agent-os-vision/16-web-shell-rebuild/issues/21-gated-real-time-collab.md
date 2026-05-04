---
Status: completed
Triage: AFK
Pillar: 16-web-shell-rebuild
Blocked-by: [16-web-shell-rebuild/issues/11-doc-tree-reader-editor-history.md, 07-docs-editor-collab/issues/04-yjs-hocuspocus-gated.md]
PRD: .scratch/agent-os-vision/prds/16-web-shell-rebuild.md
Requirements: .scratch/agent-os-vision/REQUIREMENTS.md (Pillar 16 section)
Decisions: [C1, D5, Q38]
Vision: .scratch/agent-os-vision/VISION-GAPS.md (row: "Real-time multi-cursor editing → gated real-time-collab-server")
Docs: https://tiptap.dev/docs/collaboration/getting-started/overview, https://www.hocuspocus.dev/docs
---

# GATED: real-time-collab-server — Yjs+Hocuspocus in TipTap, collab cursors, presence avatars

## What to build

Behind `FULCRUM_FEATURES=real-time-collab-server`. Wire Yjs + Hocuspocus v4 provider into TipTap editor in `/docs/[id]/edit` and task description editor. Collab cursor overlay (remote users shown as colored carets with name badges). Presence avatars in page header (circle avatars for all users viewing the same doc). Bell badge WebSocket upgrade: replace 60s poll with subscription (sub-2s latency) when flag ON.

Flag OFF: TipTap operates standalone (existing behavior, no Hocuspocus import). Flag ON: provider connects to `FULCRUM_HOCUSPOCUS_URL`; CRDT sync established; two browser tabs converge edits in real time.

Failure gate: Hocuspocus memory leak at >100 concurrent docs → Y-WebRTC P2P fallback (no server required).

## Acceptance criteria

- [ ] Flag OFF: TipTap editor loads without Hocuspocus import; no WebSocket connection attempts; standalone autosave works.
- [ ] Flag ON: two Playwright browser contexts open same doc → type in one → appears in other within 500ms; cursors show name badge.
- [ ] Presence avatars: 2 users on same doc → 2 avatars in header; user leaves → avatar removed within 5s.
- [ ] Bell badge: flag ON → WebSocket established at `/api/ws/notify`; update received within 2s of event.
- [ ] Failure gate: set `FULCRUM_FEATURES=real-time-collab-server,collab-fallback-webrtc` → Y-WebRTC peer connects; same convergence test passes without Hocuspocus server.
- [ ] `<FeatureGate flag="real-time-collab-server">` wraps all gated UI elements; OFF renders plain TipTap.

## Blocked by

- Issue 11 (doc editor) — TipTap editor must be built.
- Pillar 7 issue 04 (Yjs+Hocuspocus gated) — Hocuspocus server + Yjs integration.
