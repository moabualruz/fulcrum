---
title: "feat: adaptive plugin install and operator surfaces"
status: active
date: 2026-04-16
origin: docs/brainstorms/2026-04-16-plugin-install-operator-surfaces-requirements.md
---

# Plan: Adaptive Plugin/Extension Install and Operator Surfaces

## Architecture Decisions

- Model installation as runtime-aware packaging, not protocol-aware plumbing.
- Keep project-local integrations template-driven and idempotent.
- Feed PM dashboard and cockpit from one shared monitor endpoint.
- Keep the monitor UI buildless for now.

## Milestones

1. Adaptive install planner and runtime matrix.
2. Project-local installers for Codex and opencode.
3. PM overview endpoint in monitor.
4. Web monitor PM panel.
5. TUI PM summary pane.
6. Documentation refresh.

## Task Breakdown

- Add a CLI install planner that classifies runtimes into plugin-first, extension-first, rules-first, config-first, or CLI-only.
- Extend `fulcrum init` to scaffold Codex and opencode configs.
- Add tests for adaptive planning and new scaffolders.
- Add `/pm/overview` to the monitor with planning and blocker aggregates.
- Render PM overview in the web monitor.
- Render PM summary in the TUI.
- Update installation and monitor docs, plus add packaging guidance.

## Risks and Mitigations

- Risk: runtime recommendations drift from reality.
  Mitigation: keep the planner declarative and document assumptions clearly.
- Risk: monitor dashboard grows into an unmaintainable frontend.
  Mitigation: keep it static HTML/JS and center complexity in the endpoint shape.
- Risk: TUI becomes overcrowded.
  Mitigation: keep PM data summary-level rather than trying to mirror the full web dashboard.

## Quality Gates

- CLI tests for adaptive planner and new scaffolders.
- Monitor test for PM overview endpoint.
- Targeted package test runs before commit.

## Rollout

- Ship planner and docs first so onboarding immediately improves.
- Land PM overview as a shared foundation.
- Iterate on richer plugin and extension lifecycle flows in later passes.
