---
date: 2026-04-16
topic: plugin-install-operator-surfaces
---

# Requirements: Plugin and Extension Onboarding · PI Cockpit · Web Monitor · PM Dashboard

## Problem Frame

Fulcrum has runtime integrations, but the product still underspecifies which installation model is right for each agent. That creates onboarding friction, weak discoverability, and uneven setup quality. The operator surfaces also skew toward low-level run activity and under-serve planning and delivery oversight.

## Requirements

- Installation must distinguish packaging models by runtime instead of treating them as equivalent.
- Fulcrum must expose an adaptive planner that reports detected runtimes and the recommended install path for each one.
- Project-local installers must exist for config/rules-first runtimes: Cursor, Windsurf, Codex, and opencode.
- Documentation must explicitly cover plugin, extension, rules, config, and CLI-only onboarding paths.
- The monitor must expose a PM overview with epics, issues, plans, reviews, blockers, and delivery-health indicators.
- The web dashboard must render PM data alongside operational controls.
- The PI cockpit must expose delivery-health context, not just run-state context.

## Success Criteria

- A user can run `fulcrum install plan` and immediately see which integration path Fulcrum recommends for their environment.
- Codex and opencode get concrete project-local config scaffolding commands.
- The web monitor shows planning hotspots and delivery-health counts without leaving the control room.
- The cockpit TUI can show planning and delivery context in the same session as operational run data.
