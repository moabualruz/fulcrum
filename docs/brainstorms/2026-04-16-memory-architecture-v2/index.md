---
date: 2026-04-16
topic: memory-architecture-v2
kind: index
---

# Memory Architecture v2 — Index

Fulcrum's unified memory + code index + control-plane knowledge substrate. Spec + companion docs + research.

**Scope.** Memory automation via hooks, PCI (Project Content Index) for code + prose, unified Kuzu knowledge graph spanning 51 tables, Dreaming promotion pipeline, CLI-first methodology with selective MCP overlay, per-host plugin standardization. Grounded in five reference projects (prior art, prior art, prior art, prior-art, prior-art) inspected from local source.

**How to read.** Sequential (01 → 07) tells the full story. Each part is a standalone document with back/next links. Parts 01–02 establish philosophy + activation model + complete inventory. Parts 03–06 specify the architecture. Part 07 collects acceptance criteria, open planning questions, and session history.

---

## Requirements (v12, split into v2a/v2b)

**v12 reframe (2026-04-16):** after multi-persona document review, v2 is split into a baseline MVP (v2a) and a knowledge-graph roadmap (v2b). See **[00 — Scope Split](00-scope-split.md)** for the authoritative v2a/v2b boundary, the v2a PR sequence (8 PRs ~3 weeks), the v2a acceptance-criteria subset, and why each major idea landed in v2a vs. v2b.

| # | Part | v2a / v2b content |
|---|---|---|
| 00 | [**Scope Split — v2a Baseline / v2b Knowledge Graph**](00-scope-split.md) | **Read first.** Declares the v2a/v2b boundary, PR sequence, acceptance-criteria subset, deferred-to-v2b list, and review-finding mitigations. |
| 01 | [Problem & Design Philosophy](01-problem-and-philosophy.md) | Foundational — serves both v2a and v2b. Problem statement, design philosophy (write-side automation, CLI-first), Karpathy LLM Wiki mapping, consolidation tiers, central store + scoping. |
| 02 | [Activation Model & Complete Inventory](02-activation-and-inventory.md) | Activation model (§1.4) serves both. Complete inventory (§1.5) documents all 51 tables + packages — v2a implements memory/PCI/control-plane-lifecycle scope; v2b extends to full graph unification (git objects, external sync, A2A cards, monitor graph endpoints, agent adapters, policy events, analytics). Monitor loopback invariant added per safe-fix #6. |
| 03 | [Write & Recall Paths](03-write-and-recall-paths.md) | `recall_memory` / `query_memory` / `search_code` = v2a. `code_context` / `project_context` (cross-type traversal) = v2b. Fence + min_score floor = v2a. |
| 04 | [Data Model & Tiers](04-data-model.md) | `memories` / PCI / `projects` schema = v2a. `context_type` no-default applied per safe-fix. Short-term / durable tiers = v2a. Additional graph node tables (external_ref, git_*, agent_adapter) = v2b. |
| 05 | [Context Guards, Watcher, WAL, Sanitization](05-safety-watcher-wal.md) | All v2a. WAL ordering invariant (sanitize-before-WAL) added per safe-fix #5. `fulcrum memory rollback` operator-only constraint added per safe-fix #7. |
| 06 | [Hooks, Dreaming, Race Conditions, Migration](06-hooks-dreaming-operations.md) | Hook wiring + basic Dreaming + race/migration = v2a. Dreaming thresholds reconciled per safe-fix #1 (prior art B.4 verbatim). Re-sanitize at promotion boundary per security-F5. §8.1 Kuzu full 51-table unification = v2b. §8.2 procedural-memory proposals = v2b. §8.3 global pointer = v2b. |
| 07 | [Acceptance Criteria, Planning Questions, Session Log](07-acceptance-and-planning.md) | 70 criteria + 37 planning questions. v2a subset defined in `00-scope-split.md`. Session log v1–v12. |
| 08 | [Per-Host Plugin Integration Requirements](08-per-host-plugin-integration.md) | Per-row `[v2a] / [v2b]` tags. v2a ~4h 22m (hook-matcher narrowing, lifecycle signals for existing 5 hosts, shared-skills symlink deployment, Codex marketplace fix, OpenCode allowlist, Pi dead-JSON deletion, Pi cockpit CLI). v2b ~5h 23m (Copilot integration, Claude marketplace bundle, Gemini `BeforeModel`/`AfterModel`/`PreCompress`, Codex `approval_mode`, Pi npm publish). Total ~9h 45m canonical per safe-fix #3. |

## Section numbering reference (safe-fix #4)

Cross-references to `§X.Y` throughout the doc map to chunk headings:

| Ref | Location | Heading text |
|---|---|---|
| §1.0 | Part 03 | Wiki entry shape |
| §1.1 | Part 02 | Project Content Index (PCI) — unified substrate |
| §1.2 | Part 01 | Central store + scoping — one DB, one vault root, portable pathing |
| §1.3 | Part 02 | Control-plane unification — all Fulcrum entities are knowledge nodes |
| §1.4 | Part 02 | Activation model — CLI-first; MCP is a selective, add-on-demand overlay |
| §1.5 | Part 02 | Complete inventory — every package, every table, every surface |
| §1 write paths | Part 03 | Write Paths |
| §2 recall paths | Part 03 | Recall Paths |
| §2.1 / §2.2 / §2.6 | Part 03 | (divergence / fence / min_score floor subsections) |
| §3.1 – §3.4 | Part 04 | Data Model subsections |
| §4 | Part 04 | Short-Term vs Durable Tiers |
| §5 | Part 05 | Context-Type Guards |
| §5.5 / §5.5.1–5 / §5.6 | Part 05 | Watcher + WAL subsections |
| §6 | Part 05 | Sanitization + Fence |
| §7 | Part 06 | Per-Agent Hook Wiring |
| §8 / §8.1 / §8.2 / §8.3 | Part 06 | Dreaming + Kuzu graph + proposal pipeline + global pointer |
| §9 | Part 06 | Race Conditions and Resolution |
| §10 | Part 06 | Migration + Rollout |
| §11.X | Part 07 (#1–59) + Part 08 (#60–70) | Acceptance Criteria |
| §12.X | Part 07 (#1–31) + Part 08 (#32–37) | Open Questions for Planning |
| §H1–H6 | Part 08 | Per-Host Requirements |
| §S1–S4 | Part 08 | Cross-Cutting Standards |

---

## Companion docs

- **[Copy-File Manifest & Integration Plan](../2026-04-16-memory-v2-copy-file-manifest.md)** — Tier A (≈1700 lines verbatim), Tier B (≈3500 lines adapted), Tier C (concept only), Tier D (explicit rejects). 15-PR integration order spanning ~5 weeks. File-by-file adoption from prior-art / prior-art / prior art / prior art / prior art with source paths, target Fulcrum paths, and license-preservation notes.

---

## Research grounding this spec

Located in `docs/research/`:

- **[`memory-patterns-prior-art-hermis.md`](../../research/memory-patterns-prior-art-hermis.md)** — initial web research on prior art + prior art memory patterns (write points, recall points, token controls, scoping, anti-patterns).
- **[`memory-patterns-prior-art.md`](../../research/memory-patterns-prior-art.md)** — prior art (47k-star ChromaDB-backed memory system) patterns: WAL, silent rebuild, BM25+vec fusion, LongMemEval benchmark.
- **[`memory-prior-art-local.md`](../../research/memory-prior-art-local.md)** — local deep-dive on prior art TS source. Top 5 copy-verbatim files (temporal-decay, MMR, hybrid, events, memory-schema); top 5 patterns to adapt (promotion ranker, managed-block sentinels, recall tracking, Dreaming phases, sanitizer starter); three patterns that don't fit.
- **[`memory-prior-art-prior-art-local.md`](../../research/memory-prior-art-prior-art-local.md)** — local deep-dive on prior art (Python) + prior art (Python). 5 concepts to port from each; `on_pre_compress` correction; ChromaDB-specific choices don't constrain us; LongMemEval harness highly adoptable.
- **[`code-search-prior-art-prior-art.md`](../../research/code-search-prior-art-prior-art.md)** — local deep-dive on reference implementations (both TypeScript). Retrieval-pipeline crown jewel; AST chunker; incremental syncer; prior-art's watcher (only piece prior-art lacks).
- **[`plugin-standards-per-agent-host.md`](../../research/plugin-standards-per-agent-host.md)** — per-host plugin/extension standards for Claude Code, Gemini, Codex, OpenCode, GitHub Copilot, Pi. 799 lines. Consolidated into v2 Part 08.

---

## Precursors

- **[Ideation artifact](../../ideation/2026-04-16-memory-automation-hooks-ideation.md)** — 46 raw candidates → 28 distinct ideas → 7 survivors → user merged all 7 into the unified-system brainstorm that became this spec.
- **[Handover: memory automation via hooks](../../handover/memory-automation-via-hooks.md)** — original plan from prior session that seeded this v2 brainstorm.

---

## Status & next steps

- **v12** applies the v2a/v2b scope split + 7 safe fixes from document review.
- **v2a is ready for `ce:plan`** — 8 PRs, ~3 weeks, closes the originally-stated problem. PR sequence + acceptance criteria subset in `00-scope-split.md`.
- **v2b is a separate roadmap** — deferred until after v2a ships and produces evidence. Prerequisites: identity decision (AGENTS.md vs title), Dreaming offline sweep on 249 sessions, Fulcrum-specific recall eval to replace LongMemEval, user request for Copilot.
- Copy-file manifest (`../2026-04-16-memory-v2-copy-file-manifest.md`) needs a v2a/v2b tag pass — pending.
- Next: `ce:plan` on v2a using source inventory PRs 1–8 + v2a-tagged rows from Part 08.

## Revision history

See [Part 07 — Session Log](07-acceptance-and-planning.md#session-log) for the full v1→v10 revision history with the user-driven reframes that shaped the spec.
