# Pickup Prompt — Fulcrum Memory v2 Planning

**Paste the block below into a new Claude Code session in `/home/mkh/workspace/pi-stack-plan/`.**

---

Resume work on Fulcrum's Memory + Project Content Index v2. Previous session finished the requirements; now we plan implementation.

**Start by reading, in this order:**

1. `docs/handover/2026-04-16-memory-v2-split-handover.md` — full context of the previous session (scope, decisions, critical constraints, outstanding decisions, strict rules).
2. `docs/brainstorms/2026-04-16-memory-architecture-v2/00-scope-split.md` — **authoritative v2a/v2b boundary.** Read before touching any plan.
3. `docs/brainstorms/2026-04-16-memory-architecture-v2/index.md` — requirements hub + section-numbering reference.
4. `docs/brainstorms/2026-04-16-memory-v2-source-inventory.md` — 21-PR split (9 v2a + 12 v2b) with file-level adoption plan.

Skim as needed (not required up front): other requirements chunks (`01-*` through `08-*`), research docs under `docs/research/`.

**Mission (three phases):**

1. **`ce:plan` on v2a.** Scope: chunks 03–06 (v2a items) + source inventory PRs 1–9 + Part 08 rows tagged `[v2a]`. Output: detailed implementation plan at `docs/plans/2026-04-XX-memory-v2a-plan.md` with tasks, acceptance gates, file-level changes per PR. Resolve v2a blocker decisions (see handover §"Outstanding architectural decisions") before drafting — flag them to the user if they need user input.

2. **`ce:plan` on v2b** (can run in parallel with phase 1). Scope: chunks 02 (§1.3, v2b portions of §1.5), chunk 06 (§8.1, §8.2, §8.3), source inventory PRs 10–21, Part 08 `[v2b]` rows. Output: roadmap-shaped plan at `docs/plans/2026-04-XX-memory-v2b-plan.md` with explicit prerequisites (identity decision, 249-session sweep, Fulcrum-specific eval, Copilot user request) as gates, not tasks.

3. **Cross-plan handoff review.** After both plans land, check:
   - Every v2a output is forward-compatible with v2b (no table rebuilds, no breaking schema changes).
   - v2b prerequisites are explicit gates, not hidden tasks.
   - Kuzu DDL additions in v2a PR 7 compose with v2b PR 10 expansion.
   - PCI watcher topology chosen in v2a PR 4 works for v2b's additional indexing paths.
   - `FULCRUM_MEMORY_V2=1` flag lifecycle is coherent across both plans.
   - No v2b PR silently relies on v2a-deferred work.
   Produce the review at `docs/plans/2026-04-XX-memory-v2-cross-plan-review.md`.

4. **Present both plans + the cross-plan review to the user for decision.** Do not execute; wait for explicit approval.

**Strict rules (from handover):**

- **DO NOT commit anything.** No `git add`, no `git commit` on requirements, manifest, research, handover, ideation, or the forthcoming plans. All stay uncommitted working docs until user explicitly says otherwise.
- **DO NOT re-open scope.** v2a/v2b boundary is set in `00-scope-split.md`. If new scope appears, surface to user — don't absorb.
- **DO NOT defend decisions the user reframed.** Chunk 07 session log documents 12 revisions driven by user reframes (CLI-first, activation model, v2a/v2b split). Planning honors v12 conclusions, not earlier.
- **DO NOT plan everything in one monolithic doc.** Two plans — v2a and v2b — as separate files. Cross-plan review is a third file.
- **DO cite file paths + line numbers** in plan tasks. Every task references a concrete file + concrete change, not abstract work. Kuzu DDL tasks should point to `packages/memory/src/kuzu/schema.ts`; hook rewrites to `packages/cli/src/hooks.ts`; ingest extensions to `packages/memory/src/ingest.ts`; etc.
- **DO use the research findings.** `docs/research/*` has copy-verbatim file-level recommendations from prior art, prior-art, prior-art, prior art, prior art. Plan tasks should reference them when adopting patterns.
- **DO preserve all 10 critical constraints from the handover** (global-only data, L0→L1→L2 order, full sha256, dormancy model, CLI-first primary, write-side automation, context_type no-default, sanitize-before-WAL, monitor loopback, rollback operator-only).

**Key outstanding decisions that may block v2a planning** (surface to user if you can't resolve with evidence):

- PCI watcher topology: chokidar (existing) vs prior-art per-dir `fs.watch` (Tier A #11). Blocks PR 4.
- `memories.kind` CHECK-widening: drop constraint + app-level validation vs table rebuild. Blocks PR 1.
- `min_score` return envelope shape (MCP protocol needs to distinguish "no match" from "below floor"). Affects PR 2 + PR 6.
- Kuzu DDL for v2a: what node/edge tables PR 7 authors (File + CodeChunk + Symbol + edges). Verify against current `packages/memory/src/kuzu/schema.ts` shape.

**Output format for each plan doc:**

Match the spec chunk style (frontmatter + sections + code blocks + file refs). Each PR gets:
- Title + tag + effort estimate (respect revised estimates per feasibility review)
- Dependencies on other PRs
- File-level task list with paths + what changes
- Tests / acceptance gates (map to specific AC numbers from Part 07)
- Rollback strategy
- Open questions only if they block the PR

**When both plans are done, before presenting:**

- Run `document-review` with `mode:headless` on each plan doc.
- Fix auto-applicable findings.
- Include residual P0/P1 findings in the presentation to user.

Now read the handover + `00-scope-split.md` and tell me your plan for the plan before you start drafting. Do NOT begin writing the v2a plan until I acknowledge the approach.
