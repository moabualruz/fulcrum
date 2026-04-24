---
date: 2026-04-24
topic: agent-os-full-product-delivery
focus: docs/research/2026-04-24-local-first-agent-os-product-stack.md
---

# Ideation: Full Product Delivery For Local-First Agent OS

## Codebase Context

Current branch contains recovered docs plus a fresh Rust/TypeScript spike. The spike proves contracts and module boundaries, but it is explicitly not a shippable product. The source documents define Fulcrum as a local-first CLI agent operating system with owned state, memory+code intelligence, live PM cockpit, action orchestration, worktree delivery, and optional product integrations.

Grounding inputs:

- `docs/research/2026-04-24-local-first-agent-os-product-stack.md`
- `docs/brainstorms/2026-04-24-agent-os-system-design-requirements.md`
- `docs/plans/2026-04-24-agent-os-system-design-plan.md`
- `docs/plans/2026-04-24-fulcrum-cli-agent-os-scope.md`
- `docs/spikes/agent-os-validation.md`

Key gap: existing implementation units are validation units. Full product delivery needs install, persistence, daemon lifecycle, CLI/TUI/cockpit workflows, real indexing, memory import, sidecar supervision, policy UX, backup/restore, packaging, release profiles, and acceptance criteria.

Current external research reinforced these planning constraints:

- Tauri supports JavaScript frontends with Rust application logic and typed command invocation.
- Plane is useful as an optional PM adapter, but default product cannot depend on Plane booting.
- Windmill is useful for human-triggered workflows/actions, but Fulcrum must own agent run lifecycle.
- LightRAG is the memory graph RAG candidate; RAG-Anything is deferred because early docs are mostly markdown/code, not PDFs/Office/multimodal.
- Zoekt, Tree-sitter, and LanceDB cover different code intelligence layers and should not be collapsed into generic RAG.
- OpenTelemetry gives event/trace vocabulary without requiring a heavy observability backend.

## Ranked Ideas

### 1. Install-To-First-Run Product Slice

**Description:** Define the first shippable milestone as one local path: install, initialize workspace, create task, launch a supervised run, watch live events, inspect artifact, shut down cleanly.

**Rationale:** A user cannot evaluate an agent OS through architecture diagrams. The product must prove its value through one complete daily workflow.

**Downsides:** Forces uncomfortable product decisions early: persistence, CLI naming, default directories, daemon lifecycle, and artifact model.

**Confidence:** 96%

**Complexity:** High

**Status:** Explored

### 2. Capability Profiles For Shipping

**Description:** Ship profiles instead of forcing every external product into the default path: `core`, `code`, `memory`, `actions`, and `full`.

**Rationale:** Local-first fails when one sidecar breaks. Profiles let the product ship useful capability while heavier integrations mature behind validation gates.

**Downsides:** Requires clear UX so users understand which features are enabled.

**Confidence:** 94%

**Complexity:** Medium

**Status:** Explored

### 3. Daily Operator Command Spine

**Description:** Make CLI/TUI commands the stable product backbone: init, up/down, doctor, task, run, context, index, memory, worktree, review, merge, backup, restore, uninstall.

**Rationale:** This is a CLI agent OS; commands define the product more than crate boundaries.

**Downsides:** Requires careful CLI contract design before rich internals are complete.

**Confidence:** 92%

**Complexity:** Medium

**Status:** Explored

### 4. Context Builder As First Killer Feature

**Description:** Productize explainable context packs combining task, exact code hits, AST symbols, semantic chunks, markdown memory, provenance, graph refs, and ranking reasons.

**Rationale:** Better context is immediate agent value and validates memory/code graph decisions before deeper automation.

**Downsides:** Needs strong ranking and freshness diagnostics to avoid becoming another opaque RAG layer.

**Confidence:** 91%

**Complexity:** High

**Status:** Explored

### 5. Worktree Delivery Conveyor

**Description:** Center the MVP workflow on task -> worktree -> agent run -> live events -> artifact -> review queue -> merge/close/cleanup.

**Rationale:** The product becomes a delivery system, not a dashboard attached to indexes.

**Downsides:** Worktree safety, merge conflicts, and artifact capture add operational risk.

**Confidence:** 90%

**Complexity:** High

**Status:** Explored

### 6. Local Supervisor As Product Backbone

**Description:** The daemon should own sidecar start/stop, ports, logs, versions, resource use, degraded mode, and repair commands.

**Rationale:** Multi-product local stacks are fragile unless operations are first-class.

**Downsides:** Requires platform-specific service behavior and robust process cleanup.

**Confidence:** 88%

**Complexity:** High

**Status:** Explored

### 7. Adapter Certification Matrix

**Description:** Promote external products only through executable gates: health, ID mapping, CRUD, delete semantics, provenance, offline behavior, footprint, backup/restore, and user workflow.

**Rationale:** Prevents "researched" from meaning "shippable." Every product becomes a certifiable capability.

**Downsides:** Certification work is slower than writing thin wrappers.

**Confidence:** 89%

**Complexity:** Medium

**Status:** Explored

### 8. Local Data Durability Pack

**Description:** Treat backup, restore, export, import, doctor, rebuild, and uninstall as release-blocking features.

**Rationale:** Local-first must mean recoverable and inspectable, not fragile localhost state.

**Downsides:** Adds non-glamorous work early.

**Confidence:** 87%

**Complexity:** Medium

**Status:** Explored

## Rejection Summary

| # | Idea | Reason Rejected |
|---|---|---|
| 1 | Ship Plane-first cockpit | Too risky for local-first; Plane may be too heavy and would blur ownership. |
| 2 | Ship full stack only | Too brittle; one broken product blocks all value. |
| 3 | Make Windmill the agent runner | Violates Fulcrum ownership of live agent lifecycle and heartbeats. |
| 4 | Build custom memory RAG before LightRAG validation | Reinvents too much before proving LightRAG gap. |
| 5 | Make RAG-Anything early default | User clarified early/mid docs are mostly markdown; multimodal docs are deferred. |
| 6 | Use Grafana/SigNoz as cockpit | Generic observability cannot own PM/operator workflows. |
| 7 | TypeScript-only backend for speed | Weakens daemon, local packaging, file watching, and process supervision goals. |
| 8 | Treat spike units as delivery plan | Spike units validate architecture; they do not ship user workflows. |

## Session Log

- 2026-04-24: Full-product delivery ideation after spike proved insufficient. 30 raw ideas generated by sub-agents, deduped into 8 survivors.
