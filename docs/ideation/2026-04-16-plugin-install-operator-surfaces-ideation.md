---
date: 2026-04-16
topic: plugin-install-operator-surfaces
status: complete
---

# Ideation: Plugin and Extension Installation · PI Cockpit · Web Monitor · PM Dashboard

## Grounding

- Fulcrum already ships meaningful integration assets for Claude, Gemini, PI, Codex, opencode, Cursor, and Windsurf, but the onboarding flow still under-explains which packaging model fits which runtime.
- The repo has working operator surfaces, but the TUI is still mostly operations-centric and the web monitor lacks a stronger planning and delivery lens.
- External research suggests the runtime model matters more than the protocol:
  - Claude Code is plugin-capable and hook-rich.
  - Gemini and PI are extension-centric.
  - Cursor and Windsurf are rules/config-first.
  - Codex and opencode are context/config-first.

## Strongest Ideas

1. Adaptive install planner that recommends `plugin-first`, `extension-first`, `rules-first`, `config-first`, or `cli-only` per detected runtime.
2. Project-local installers for config-first runtimes, so Codex and opencode are first-class instead of implicit documentation-only integrations.
3. A PM overview endpoint that feeds both the web control room and the PI cockpit with the same delivery-health data.
4. A planning-aware web monitor section that surfaces blocked issues, active plans, and pending reviews next to blocked runs.
5. TUI delivery-health cards so the cockpit is not only for operators watching runs, but also for leads watching execution health.

## Rejected Directions

- Treating every runtime as an MCP-first install path. That hides the more valuable packaging primitives.
- Building a SPA before the PM model is clear. The monitor should stay buildless for now.
- Defining a fake plugin story for runtimes that are actually rules/config driven.
