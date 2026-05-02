---
Status: ready-for-agent
Triage: AFK
Pillar: 16-web-shell-rebuild
Blocked-by: [16-web-shell-rebuild/issues/13-runs-and-artifacts.md, 03-symphony-orchestration/issues/18-web-runs-board.md, 02-inference-sidecar/issues/13-web-inference-settings-page.md]
PRD: .scratch/agent-os-vision/prds/16-web-shell-rebuild.md
Requirements: .scratch/agent-os-vision/REQUIREMENTS.md (Pillar 16 section)
Decisions: [Q4, Q34, C4]
Vision: .scratch/agent-os-vision/VISION-GAPS.md (rows: "Agent orchestration + manual assign", "Auto-orchestration")
Docs: https://kit.svelte.dev/docs
---

# Agents (/agents), Orchestration dashboard (/orchestration), Inference dashboard (/inference)

## What to build

`/agents`: agent registry page listing registered CLI agent profiles (name, capabilities list, active sessions count, dispatch button). Dispatch button opens run-dispatch modal (task selector + agent pre-filled). `/orchestration`: live orchestration dashboard — run list with claim state badges, Symphony status indicator, filter by project, cancel/retry controls; subscription poll every 5s. `/inference`: inference sidecar dashboard — status (running/stopped), model list with `pull` / `remove` / `set-default` controls, backend config (embedded/ollama/lm-studio/openai-compatible), start/stop buttons → `inference.start` / `inference.stop` tRPC.

Cuts through: `agents.list` → profile cards rendered → dispatch → run appears in `/runs`; `orchestration.runList(live=true)` subscription → claim state badges update; `inference.status` → sidecar status badge.

## Acceptance criteria

- [ ] Agents: list renders with capability chips; dispatch button → modal → submit → redirects to `/runs/[id]`.
- [ ] Orchestration: run list shows claim state (`claimed_by`, `orchestration_state`); 5s poll updates badges; filter by project narrows list; cancel button calls `runs.cancel`; retry calls `runs.retry`.
- [ ] Inference: status badge shows sidecar state; model list shows `bge-small-en-v1.5` + any pulled models; `pull` triggers download progress; `start`/`stop` buttons toggle sidecar.
- [ ] Backend config: switching to `ollama` shows host field; `openai-compatible` shows URL + API key field (masked); save → `inference.setBackend` tRPC.
- [ ] Playwright: start inference sidecar → status changes to "running"; pull model → progress shown.
- [ ] CLI: `fulcrum agent list --json`; `fulcrum orchestrate status --json`; `fulcrum inference status --json`.
- [ ] TUI: orchestration pane + inference pane (Pillar 15).

## Blocked by

- Issue 13 (runs) — dispatch modal reuses run creation flow.
- Pillar 3 issue 18 (web runs board) — orchestration tRPC procedures.
- Pillar 2 issue 13 (web inference settings) — inference tRPC procedures.
