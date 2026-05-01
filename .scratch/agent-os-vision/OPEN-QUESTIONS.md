# Fulcrum Agent OS — Open Questions & Gray Areas

**Compiled:** 2026-05-01  
**Source:** INVENTORY.md, VISION-GAPS.md, 01-pm-tools.md, 02-docs-editor.md, 03-orchestration-memory-skills.md, 04-multi-user-saas.md, 05-symphony-sandcastle.md

---

## 1. Vision / Scope / Philosophy

### Q1. Is Fulcrum's task tracker the canonical source of truth, or does it integrate Linear?
- **Source**: `05-symphony-sandcastle.md` § "Tracker adapter direction", VISION-GAPS.md § "No distinction projects"
- **Question**: Symphony orchestration requires a tracker adapter. Does Fulcrum implement one to drive its own PGlite task table (self-contained product), or does Symphony integrate with Linear as a peer service (Fulcrum becomes Linear-powered)?
- **Why it matters**: This determines whether the built-in kanban is authoritative for agent dispatch or whether users must have Linear. It shapes the product surface, the multi-repo story, and the agent assignment workflow.
- **Recommended answer**: Fulcrum tracks are canonical. Implement a Fulcrum-native Symphony tracker adapter (§Tracker Integration in SPEC.md) so the product is self-contained. Linear integration becomes an optional future connector for teams already in Linear.
- **Alternatives considered**: 
  1. Linear-first: Symphony drives Linear tickets. Simpler integration path (Linear's REST API + Codex protocol). Downside: requires Linear account; Fulcrum loses autonomy; product coupling.
  2. Hybrid: Both valid. Adapter toggle via config. Complexity: dual state reconciliation, conflict resolution on concurrent edits.
- **Blast radius if wrong**: If Linear is required, the self-hosted claim weakens; users without Linear accounts cannot use Fulcrum's orchestration. Switching later requires rewriting task assignment and retention logic.

### Q2. Is Docker/Podman a hard prerequisite for local-first, or optional with sandboxless fallback?
- **Source**: `05-symphony-sandcastle.md` § "Docker requirement for local-first"
- **Question**: Sandcastle provides container isolation; `noSandbox` mode exists but writes directly to the host filesystem. Should Fulcrum require Docker/Podman for safe local-first operation, or default to `noSandbox` with Docker as optional hardening?
- **Why it matters**: Affects install narrative, security posture, agent trust boundary, and `fulcrum doctor` health checks. "Local-first" means different things if agents can modify the host filesystem directly.
- **Recommended answer**: Docker is RECOMMENDED but not REQUIRED. Default to `noSandbox` locally; `fulcrum doctor` warns if not installed; `fulcrum install --enable-docker` hardens to container mode. Document trust boundaries per mode clearly in docs/sandcastle.md.
- **Alternatives considered**:
  1. Hard requirement: Docker is mandatory. Cleaner security model, simpler docs, but blocks users without Docker (containers on macOS, Apple Silicon support).
  2. Dual path: Both equally supported. More testing burden; different failure modes per path.
- **Blast radius if wrong**: If Docker required, adoption slows for non-Docker users. If too permissive, agent side-effects (code execution outside worktree) become a support burden.

---

## 2. Tracker + Orchestration (Symphony / Sandcastle / Mastra Layering)

### Q3. What is the conformance surface for Symphony SPEC.md — test gates, trace docs, or runtime type-safety?
- **Source**: `05-symphony-sandcastle.md` § "Test gates" option; `SPEC.md` § Validation & Test Matrix
- **Question**: Symphony is a spec, not a library. How does Fulcrum validate that its TS implementation conforms to REQUIRED sections (issue state machine, retry backoff formula, hook timeouts, sanitization invariants)? Via (a) test suite per checklist, (b) conformance document tracing spec→code, (c) both?
- **Why it matters**: Specs drift without gates. Determines how to detect when Symphony SPEC.md updates require Fulcrum code changes. Blocks when hidden semantic violations occur.
- **Recommended answer**: Both: (a) test suite `src/orchestration/__tests__/symphony-conformance.test.ts` exercises every REQUIRED item as a failing-first test; (b) `docs/symphony-conformance.md` traces each spec section to the file/function that implements it. CI fails if tests don't pass or if a spec REQUIRED item has no trace.
- **Alternatives considered**:
  1. Test gates only. Cheaper, but unseen semantic gaps can slip through (e.g., retry backoff formula correct in tests, wrong in one code path).
  2. Trace doc only. Good for humans, hard to enforce; spec drift still possible.
- **Blast radius if wrong**: Silent spec non-conformance leads to orchestration behavior diverging from OpenAI's reference. Interop with other Symphony implementations breaks; debugging becomes context-dependent.

### Q4. Which layer decides if a task goes to Claude Code vs. Codex vs. Pi — Symphony config, Mastra workflow, or pre-dispatch router?
- **Source**: `03-orchestration-memory-skills.md` § "Auto-Assignment / Routing Heuristics"; `05-symphony-sandcastle.md` § "Outer loop vs. inner execution"
- **Question**: Agent selection routing (task type → agent) can happen at multiple layers: (a) json-rules-engine + LLM fallback before Symphony sees the task (pre-dispatch), (b) WORKFLOW.md config per issue type (Symphony layer), (c) Mastra agent-selection workflow (semantic layer). Where should it live?
- **Why it matters**: Affects how rules are versioned, tested, and updated. Determines whether routing is user-configurable (YAML), data-driven (JSON rules table), or LLM-driven (expensive but context-aware).
- **Recommended answer**: Pre-dispatch (Option a). The router lives in `src/router/auto-assign.ts`, runs BEFORE task hits Symphony, populates a `WORKFLOW.md` assignment field. json-rules-engine first, LLM Haiku fallback, explicit `--agent` override wins. Keeps routing logic separated from Symphony's orchestration state machine and Mastra's agent-capability layer.
- **Alternatives considered**:
  1. Symphony config: Each WORKFLOW.md declares preferred agent type via front-matter. Harder to batch-update across tasks; requires template inheritance.
  2. Mastra workflow: Mastra's `branch()` step selects agent. Cleanest from SDK perspective, but adds latency (LLM call inside every task dispatch); mixes concern with agent capability detection.
- **Blast radius if wrong**: If routing lives at wrong layer, changing rules becomes hard (e.g., "all refactor tasks go to Claude Code now" requires updating N tasks if per-task config, or N rules if centralized). Rollback difficult.

### Q5. How should Mastra and Symphony interact — is Mastra only for agent capability definitions, or also workflow orchestration?
- **Source**: `03-orchestration-memory-skills.md` § "Recommended Agent-OS Architecture"; `05-symphony-sandcastle.md` § "Relationship to Mastra"
- **Question**: Mastra provides workflow graphs, agent definitions, tool registries, and memory backends. Symphony defines issue-dispatch orchestration (poll → claim → run → reconcile → retry). Can Mastra's `workflow.branch()` replace Symphony's state machine, or are they separate layers?
- **Why it matters**: Determines where multi-agent loops, hand-offs, and decision trees belong. Affects who owns retry logic, stall detection, workspace cleanup.
- **Recommended answer**: Separate layers. Mastra = WHAT agents do and how they remember; Symphony = WHEN and WHY agents are dispatched. Mastra handles multi-turn agent loops within a single task; Symphony handles issue-to-issue dispatch, retry scheduling, and tracker reconciliation. No overlap.
- **Alternatives considered**:
  1. Mastra-centric: All orchestration as Mastra workflows. Requires wrapping Symphony's state machine inside a Mastra graph. Adds abstraction; harder to conformance-test.
  2. Hybrid: Simple dispatch in Symphony, complex multi-agent handoffs in Mastra. Works but requires careful API boundaries.
- **Blast radius if wrong**: Wrong boundary makes debugging complex — unclear which layer owns a state transition. Easier to introduce bugs; harder to unit-test orchestration in isolation.

### Q6. Should Fulcrum track Symphony submodule at `main` or use versioned releases?
- **Source**: `05-symphony-sandcastle.md` § "Sync policy"; README notes "engineering preview, no semver tags"
- **Question**: Symphony has no release tags (intentional spec-driven design). Should Fulcrum track `vendor/openai-symphony main`, or pin a specific commit with manual updates?
- **Why it matters**: Affects stability guarantees and upgrade burden. `main` = latest spec, more frequent CI changes. Pinned = stability, manual overhead.
- **Recommended answer**: Track `main` with weekly automated conformance checks. `git submodule update --remote vendor/openai-symphony` via CI job that diffs SPEC.md, runs `test:symphony-conformance`, and opens a PR if changes detected. This balances staying current with gating instability.
- **Alternatives considered**:
  1. Pin specific commit: Safer, but spec drift accumulates; discover breaking changes months later.
  2. Ignore updates: Stale; miss fixes and clarifications.
- **Blast radius if wrong**: If tracking `main` without gates, spec breaking changes silently corrupt Fulcrum's implementation. If pinned too long, orchestration behavior diverges from OpenAI's reference.

---

## 3. Tasks / Scrum / Sprints

### Q7. Should Fulcrum implement a full sprint/cycle model, or only flat backlog + kanban?
- **Source**: `01-pm-tools.md` § "Gaps — What No OSS Tool Covers"; VISION-GAPS.md § "Sprint / scrum / dev cycles interactive monitoring"
- **Question**: Jira/Linear both have sprints (named cycles with start/end dates, capacity planning, velocity tracking). Does Fulcrum need this, or is a flat backlog per project sufficient?
- **Why it matters**: Sprints enable team planning ceremonies, burndown/velocity metrics, and forecasting. Backlog-only is simpler to build but weaker for team coordination.
- **Recommended answer**: MVP = flat backlog + kanban board. Add sprints in Phase 2 after web shell ships. Sprints require: `sprints` table (name, start_date, end_date, project_id), task.sprint_id FK, capacity tracking, velocity rollup. Design schema now to avoid later rewrites. Schema addition: ~30 LOC, zero breaking changes.
- **Alternatives considered**:
  1. Full sprints in MVP: More complete PM, but 5+ new tables, custom field bucketing, capacity math. 2–3 weeks extra work.
  2. No sprints ever: Simpler product, but limits team-scale use cases.
- **Blast radius if wrong**: If omitted from schema, adding sprints later requires backfill migration for existing tasks (which sprint?) and capacity logic retrofit.

### Q8. How should burndown and velocity metrics be computed — real-time queries or pre-computed rollups?
- **Source**: `01-pm-tools.md` § "LayerChart + PGlite live queries"; `03-orchestration-memory-skills.md` § "Velocity / cycle metrics computation"
- **Question**: Burndown charts need historical issue state transitions (when tasks moved to "done"). Velocity needs sprint-scoped completed-task counts. Should Fulcrum compute these on-demand (SELECT COUNT(*) WHERE sprint_id = ? AND status = 'completed'), or pre-compute and cache in a `metrics` table?
- **Why it matters**: Affects query latency, dashboard responsiveness, and historical accuracy. On-demand works for small teams; pre-computed scales.
- **Recommended answer**: On-demand for MVP. Schema already has `events` table (audit log of all mutations). Query `events WHERE subject_kind = 'task' AND verb = 'status_changed' AND payload->>'new_status' = 'completed'` → group by sprint/date → render. Add pre-computed `metrics_cache` table in Phase 2 if dashboard queries slow (>500ms).
- **Alternatives considered**:
  1. Materialized view per sprint: Fast but static (rebuilt periodically); requires refresh logic.
  2. Time-series DB (InfluxDB, Prometheus): Overkill for local-first; adds infrastructure.
- **Blast radius if wrong**: If on-demand gets slow, retrofitting a cache means schema migration + catch-up backfill logic. Better to leave room in `events` schema now.

### Q9. What is the scope of "custom fields" — text/select/number/date, or include computed/aggregate fields?
- **Source**: `01-pm-tools.md` § "Custom fields engine" (no OSS tool covers this)
- **Question**: Jira/Linear allow users to define custom fields per project (Estimate, Sprint, Assignee, custom dropdowns). Does Fulcrum support this? If so, at what complexity level — simple scalar types, or also aggregates/formulas?
- **Why it matters**: Determines how much schema flexibility is needed. Affects query builder, bulk operations, saved views (filters must understand custom fields).
- **Recommended answer**: Deferred to Phase 2. MVP ships with hard-coded fields (status, priority, parent, assignee, due_date, estimate). Notes field for custom metadata. Custom fields require: field type registry, PGlite JSON column or dynamic table schema, Zod validation per type, UI form builder. Estimated 2+ weeks after UI shell ships. Design a placeholder `custom_fields jsonb` column on tasks now (zero cost, room to grow).
- **Alternatives considered**:
  1. Full custom fields MVP: Powerful, but complex schema (either dynamic columns or JSON with full indexing). Estimated 3+ weeks delay.
  2. Never: Simpler product, but enterprises ask for this immediately.
- **Blast radius if wrong**: If custom_fields not in schema now, adding it later requires rolling back to add the column. If schema too rigid, custom fields can't be indexed.

### Q10. Should "saved views" (filtered + sorted task lists) be a UI-only feature or stored in the database?
- **Source**: `01-pm-tools.md` § "Saved views / filter presets"
- **Question**: Linear allows users to save named views ("Open bugs in frontend"). Should Fulcrum persist these as shareable database records, or are they browser-local URL params?
- **Why it matters**: Sharing views with team requires DB persistence. URL params are stateless but not shareable or collaborative.
- **Recommended answer**: Database-persisted. Add `saved_views` table: `{id, project_id, name, query_json, order_by, created_by, shared}`. Design query JSON schema now (WHERE/ORDER BY clauses as AST), even if not fully implemented until Phase 2. Use URL params for transient ad-hoc views.
- **Alternatives considered**:
  1. URL params only: Simpler to build, but sharing requires copy-paste; no history.
  2. Both: Full feature parity, but schema complexity.
- **Blast radius if wrong**: If omitted from schema, adding later breaks existing URL shareable links (query format changes).

---

## 4. Docs / Editor / Wiki / Collab

### Q11. What is the doc taxonomy — flat list, per-project tree, or per-type folders?
- **Source**: VISION-GAPS.md § "No project scoping in UI" + "No type taxonomy"; `02-docs-editor.md` § "Doc Taxonomy / Hierarchy"
- **Question**: Currently all docs live in a flat list per project. Should they be organized into: (a) folders/tree per doc type (specs, runbooks, decisions, wikis), (b) per-project trees (shared docs vs. project-local), (c) both?
- **Why it matters**: Determines UI sidebar shape, breadcrumbs, and query filtering. Affects how memory context assembly finds relevant docs (doc type constrains relevance).
- **Recommended answer**: Per-project tree with doc-type taxonomy. Schema: `docs.parent_id` (adjacency list), `docs.doc_type` enum (spec, adr, wiki, scratch, runbook). UI sidebar shows doc tree per project; doc type drives toolbar config and required fields (e.g., ADR requires decision/status fields).
- **Alternatives considered**:
  1. Flat per-project: Simpler, scales to ~50 docs; beyond that, users need search.
  2. Type-only folders: Easier to find "all specs", harder to find project-specific docs.
  3. Both (nested): Powerful, more code (~400 LOC for drag-drop tree + CRUD).
- **Blast radius if wrong**: If taxonomy not in schema from start, moving docs later requires breaking backlinks. Best to design schema now, defer UI until Phase 2.

### Q12. What is the editorial experience — realtime collab, version history, or read-only preview?
- **Source**: VISION-GAPS.md § "Editor: live preview, slash commands ... comments-on-selection"; `02-docs-editor.md` § "Real-Time Collaboration"
- **Question**: Fulcrum uses Yjs + Hocuspocus for realtime editing. Should all docs support concurrent editing (person A + Claude Code editing same doc), or only solo + async versioning?
- **Why it matters**: Realtime collab requires Hocuspocus server, Y-WebRTC for P2P fallback, merge conflict resolution (CRDT handles rich-text, but metadata/structure?). Async-only is simpler.
- **Recommended answer**: Realtime collab in MVP via Yjs + in-process Hocuspocus. Supports: human + agent working same doc in-session. Y-WebRTC fallback if Hocuspocus disconnects. Conflict resolution: CRDT for text, LWW (last-write-wins) for metadata (doc_type, title). Document the trade-off: CRDT ≠ semantic conflict resolution.
- **Alternatives considered**:
  1. Async only (save-merge-notify): Simpler, no collab infra. Harder to explain when Claude Code and user both edit.
  2. Full semantic merge (ops transform): Complex; likely unnecessary if use cases are brief co-editing.
- **Blast radius if wrong**: If Hocuspocus has bugs, clients can't edit (offline-first fallback via Y-IndexedDB mitigates). If CRDT has corruption, doc becomes unreadable (rare but non-zero risk with Yjs).

### Q13. Should docs support structured frontmatter editing (form UI) or only raw YAML?
- **Source**: `02-docs-editor.md` § "Block editor" + "frontmatter form"; "Markdown plus YAML frontmatter is canonical"
- **Question**: YAML frontmatter is canonical for agent + human diffs. Should TipTap editor also expose a form UI to edit frontmatter (doc_type, tags, status), or require users to hand-edit YAML?
- **Why it matters**: Forms are more discoverable (new users don't know frontmatter syntax); raw YAML is more flexible and diff-friendly.
- **Recommended answer**: Form UI for common fields (doc_type, tags, due_date, status); raw YAML toggle for advanced. TipTap custom node for frontmatter block, Zod schema validation, form builder via shadcn-svelte + Bits UI. Phase 2 feature (after editor ships).
- **Alternatives considered**:
  1. YAML only: Canonical, but UX is hostile for non-technical users.
  2. Form only: Discoverable, but loses flexibility; diffs show form JSON, not YAML.
- **Blast radius if wrong**: If form not designed into schema, adding it later means canonicalizing both YAML and JSON representations (sync burden).

### Q14. How should version history work — snapshot per save, delta-based, or event-log only?
- **Source**: `02-docs-editor.md` § "Document Storage / Versioning"
- **Question**: Docs can be versioned via: (a) full snapshots per save (simple, expensive storage), (b) delta-based (jsondiffpatch diffs, smaller, harder to reconstruct), (c) event log only (smallest, hardest to reconstruct). Which trade-off?
- **Why it matters**: Affects ability to show diff, restore versions, and storage costs.
- **Recommended answer**: Snapshots + deltas. PGlite schema: `doc_versions(id, doc_id, version_num, snapshot jsonb, delta jsonb, created_at)`. Save snapshot every 10 saves or daily; compute delta between them via jsondiffpatch. Enables fast diff view (compare adjacent snapshots) and restore (reconstruct via deltas). Estimated storage: 1 year of 1k-doc project ≈ 500 MB.
- **Alternatives considered**:
  1. Snapshot only: Simple, but storage grows linearly (1 year ≈ 2 GB).
  2. Delta only: Small storage, but reconstruct requires merging N deltas (slow, error-prone).
  3. Event log: Minimal storage, but reconstruct via events is complex.
- **Blast radius if wrong**: If storage model chosen wrong, migrating versioning data later is a backfill nightmare. Lock in snapshot+delta schema now.

---

## 5. Memory / Context / RAG / Search

### Q15. How should memory scoping work — per-project only, global-with-gating, or both?
- **Source**: `03-orchestration-memory-skills.md` § "Memory layer"; VISION-GAPS.md § "Per-project memory + global, gated"
- **Question**: Memories can be: (a) per-project only (isolated), (b) global-shared (all agents see all memories, discovery risk), (c) scoped by gating rules (global by default, project-scoped if flagged). Which?
- **Why it matters**: Affects context assembly pipeline. Per-project only is safest; global with gating is powerful but requires relevance filtering (hard).
- **Recommended answer**: Per-project default. Add `memories.global` boolean flag. Retrieval query: `WHERE (project_id = $1 OR global = true)`. Agents retrieve project memories + global memories marked relevant. Humans explicitly flag facts as global when useful for other projects. Relevance gating = TBD (heuristic: mention count, recency, agent confirmation).
- **Alternatives considered**:
  1. Per-project only: Simpler, no gating logic. Limits cross-project knowledge reuse.
  2. Global always: Agents discover everything, but noise increases; memory retrieval becomes search (expensive with embeddings, TBD deterministic).
- **Blast radius if wrong**: If per-project enforced at schema level, adding global memory later requires migration. Better to design flexibility now.

### Q16. Should fact extraction from docs/runs be automatic (embedding-triggered) or on-demand (user action)?
- **Source**: `02-docs-editor.md` § "Agent-context extraction hooks"; `03-orchestration-memory-skills.md` § "Memory engines"
- **Question**: When a doc is saved or an agent run completes, should Fulcrum automatically extract facts (entities, decisions, blockers) into the `memories` table, or only when the user clicks "Extract" or an agent requests context?
- **Why it matters**: Automatic = better memory coverage, but risk of noise (unimportant facts extracted). On-demand = curated but manual burden.
- **Recommended answer**: Hybrid. On-doc-save: run remark plugin to extract headings + metadata → store in `docs.context_summary text` (for search + context assembly). On-agent-run: LLM-driven extraction only if agent explicitly calls a "Remember fact" tool. Automatic is low-cost structured extraction; semantic extraction deferred.
- **Alternatives considered**:
  1. Fully automatic: mem0-style continuous extraction. High-quality but Python sidecar required; performance burden.
  2. Fully manual: Users explicitly add memories. Better control, but adoption drops (humans forget to remember).
- **Blast radius if wrong**: If too aggressive, memories table fills with noise. If too passive, useful knowledge never surfaces. Hybrid is lowest-risk.

### Q17. Should memory retrieval use pgvector embeddings or deterministic Postgres FTS only?
- **Source**: VISION-GAPS.md § "No embeddings, no RAG, no semantic search"; `03-orchestration-memory-skills.md` § "Vector Stores"
- **Question**: User's original ask forbids embeddings unless explicitly approved. `03-orchestration` recommends PGlite + pgvector as the default. Contradiction? Should retrieval use embeddings for semantic matching, or stick to deterministic FTS (tsvector + keyword matching)?
- **Why it matters**: Embeddings enable semantic "find memory about 'deployment'" even if word "deployment" never appears. FTS requires exact/partial keywords. Different relevance guarantees.
- **Recommended answer**: FTS-only for MVP, per user's original ask. PGlite + pgvector is available; do NOT use for retrieval until user approves. Retrieval: Postgres FTS (`tsvector` + `tsquery`) + keyword-based ranking. Phase 2: if memory retrieval quality is poor, revisit embeddings with user explicit approval.
- **Alternatives considered**:
  1. Embeddings from start: Better quality, breaks user's ask. Cost: model dependency (Anthropic embedding API or local model).
  2. Hybrid: FTS + optional embeddings. More code, unclear when to use which.
- **Blast radius if wrong**: If embeddings used without approval, reputational risk (user discovers external model call). If FTS is insufficient, knowledge discovery frustrates users.

### Q18. How should project-scoped and global memory queries be combined in context assembly?
- **Source**: `03-orchestration-memory-skills.md` § "Must-write gaps: retriever.ts"
- **Question**: Context assembly needs to: (a) find project-scoped memories, (b) find global memories, (c) rank them by relevance + recency + importance. What's the algorithm? BM25? Simple keyword boosting? LLM relevance confirmation?
- **Why it matters**: Affects context quality, query latency, and hallucination risk (irrelevant memory injected into prompt).
- **Recommended answer**: Ranked union with decay scoring. Query both project-scoped + global memories via FTS. Score = (BM25 + recency_decay + explicit_importance_flag) / (distance_from_project_baseline). Combine results, de-dup, sort by score, truncate to top-20. Estimated 150 LOC in `src/memory/retriever.ts`.
- **Alternatives considered**:
  1. Project-scoped only: No cross-project drift, but knowledge silos.
  2. All global first: Simple query, but noise when projects have similar terminology.
  3. LLM relevance check: Best quality, but expensive (API call per query).
- **Blast radius if wrong**: If scoring is wrong, context assembly pulls irrelevant memories; agent prompt bloat + hallucinations increase.

---

## 6. Skills / Workflows

### Q19. How often should Fulcrum sync upstream from mattpocock/skills?
- **Source**: `03-orchestration-memory-skills.md` § "Skills loader"; VISION-GAPS.md § "Workflow per matt-pocock skills repo"
- **Question**: `fulcrum skills sync --fetch-upstream` can pull fresh skills from mattpocock/skills repo. How often should this run — manual only, daily, weekly? What's the conflict resolution?
- **Why it matters**: Fresh = latest best practices; too frequent = churn + breaking changes. Manual = controlled, but adoption lags.
- **Recommended answer**: Manual default, with CI option for auto-sync on Monday mornings (configurable). `fulcrum skills sync --fetch-upstream` diffs SKILL.md files, auto-merges non-conflicting, prompts on conflicts (user chooses: keep local, take upstream, or merge manually). Conflicts stored in `skills.lock.json` under `[skill].upstream_conflict`. Phase 2: auto-merge CI job.
- **Alternatives considered**:
  1. Always fresh (daily): Latest practices, but high breakage risk (user's customizations overwritten).
  2. Manual only: Safest, but skills stale (users stick with old versions).
- **Blast radius if wrong**: If too aggressive, users' custom skills erased. If too passive, users don't upgrade (technical debt).

### Q20. What model owns skill namespacing — per-agent folders, or flat name prefix registry?
- **Source**: INVENTORY.md § "Decisions on Record" (`Skill name: prefix-free`); `03-orchestration-memory-skills.md` § "Skills system"
- **Question**: Skills are currently stored per-agent (e.g., `~/.agents/claude-code/skills/myskill/`). Should they stay per-agent, or centralize to a flat `~/.fulcrum/skills/myskill/` registry with per-agent availability flags?
- **Why it matters**: Per-agent = each agent has isolated skill set; flat = shared skill library, easier to sync/version. Affects install/update/discovery.
- **Recommended answer**: Flat registry with per-agent enables/disables. Schema: `fulcrum_skills(name, location, enabled_agents json, upstream_ref, version_pinned, hash_verified)`. Install places skill at `~/.fulcrum/skills/{name}/SKILL.md`. Per-agent surface adapters (in component-lifecycle) expose only enabled skills to each agent CLI. Existing decision is correct; double-check post-shell-ship that adapters route correctly.
- **Alternatives considered**:
  1. Per-agent folders: Already built, no change. But skill updates = N copies to maintain.
  2. Shared registry: Better for MVP, adds complexity if multi-agent coordination is needed.
- **Blast radius if wrong**: If per-agent persisted, syncing skills becomes O(agents) work. If flat registry breaks, every agent breaks.

---

## 7. Multi-User / Accounts / Tenancy / SaaS

### Q21. Should local mode require explicit auth bootstrap, or auto-create a default user?
- **Source**: `04-multi-user-saas.md` § "Auth Strategy: Local vs SaaS"
- **Question**: Local mode uses Better Auth + SQLite. First run should: (a) prompt for email/password + create admin user, (b) auto-create a default passwordless account (admin@local.test), or (c) skip auth entirely?
- **Why it matters**: Affects user onboarding, security posture, and path to SaaS (if default user exists, migration is one config var; if no user, multi-user path requires data backfill).
- **Recommended answer**: Auto-create default user on first `fulcrum init`. User email/password optional; if skipped, passkey-only login. Session stored in SQLite; subsequent runs auto-log in via existing session. Zero friction for solo users; multi-user path starts with "invite collaborator" (new users get email link).
- **Alternatives considered**:
  1. Explicit bootstrap: Clearer intent, more control. Users must type email twice; slightly more friction.
  2. Fully passwordless: Better UX, but passkey support is newer (fallback to email OTP needed).
- **Blast radius if wrong**: If passwordless not implemented, default user with weak password is a local-machine risk. If bootrap prompt required, users get stuck.

### Q22. Should composite `(org_id, ...)` indexes be added NOW or deferred to SaaS phase?
- **Source**: `04-multi-user-saas.md` § "Multi-Tenancy Schema Patterns" + "Must-Write Gaps"
- **Question**: Row-level security (RLS) on Postgres requires `org_id` column for filtering. Without `(org_id, <col>)` composite indexes, queries are 100× slower. Should these be added to schema NOW (no-op in local mode, future-proofs for Postgres), or only when SaaS is greenlit?
- **Why it matters**: Adding later = schema migration + index backfill on data. Adding now = zero cost, future-proofs.
- **Recommended answer**: Add indexes NOW. No cost in local PGlite (indexes optional). Schema migrations: add `CREATE INDEX (org_id, status) ON tasks` for every high-traffic table. Benefit: day-1 SaaS readiness; no refactoring when multi-user launches.
- **Alternatives considered**:
  1. Defer: Simpler schema now, but index creation during SaaS launch is risky (downtime on large tables).
- **Blast radius if wrong**: If deferred, SaaS launch requires downtime-inducing schema changes. If added now and never used, zero cost.

### Q23. What is the plan for adding `org_id` to the `events` audit log retroactively?
- **Source**: `04-multi-user-saas.md` § "Audit Log"
- **Question**: `events` table was created without `org_id` column. Multi-tenant audit requires org scoping. Schema migration adds the column, but existing events rows have NULL org_id. How should backfill work?
- **Why it matters**: Missing `org_id` in existing events breaks audit log queries for multi-tenant ("show me all events for Org X").
- **Recommended answer**: In next schema migration: (1) add `org_id uuid REFERENCES organizations(id)` nullable to events; (2) add migration script that backlogs existing rows to the local org ID (well-known UUID `00000000-0000-0000-0000-000000000001`); (3) make `org_id` NOT NULL post-backfill. Estimated LOC: 30 in migration, 50 in SQL backfill.
- **Alternatives considered**:
  1. Accept nulls: Simpler, but audit queries must filter `IS NOT NULL`.
  2. Drop existing events: Cleanest, but loses audit history if users had long-running deployments.
- **Blast radius if wrong**: If not done, audit log becomes unusable at scale (can't filter by tenant). If done wrong, data loss if backfill script fails (test in lower env first).

---

## 8. Repo Supervision

### Q24. Should Fulcrum track multi-repo state continuously or on-demand?
- **Source**: VISION-GAPS.md § "Repo supervision (personal + AI agents)"; INVENTORY.md § "Repos surface in CLI only"
- **Question**: `repos` table exists but no CLI surface. When should Fulcrum sync repo state (branches, commits, file tree) — continuously (background job per repo), on-demand (`fulcrum repo status`), or per-task (only during agent run)?
- **Why it matters**: Affects memory requirements, git operation frequency, and context freshness for agents.
- **Recommended answer**: On-demand per task. During Symphony `before_run` hook, `fulcrum repo sync --repo <id>` fetches latest commits/branches for context assembly. Background sync (graphile-worker) for repos referenced in recent tasks (LRU cache, 5 repos max). Full multi-repo status available via `fulcrum repo list --with-branches`.
- **Alternatives considered**:
  1. Continuous: Fresh context, but expensive (N repos × M agents = O(N×M) git ops/min).
  2. On-demand only: Simpler, but stale context if repo changes between checks.
- **Blast radius if wrong**: If sync too frequent, git server gets hammered. If too lazy, agents see old code state.

---

## 9. Artifacts / Files

### Q25. What is the artifact lifecycle — created during runs, harvested after, indexed for search?
- **Source**: INVENTORY.md § "`artifacts` table exists; no upload UI, no preview"; `05-symphony-sandcastle.md` § "Artifacts"
- **Question**: Agent runs produce artifacts (generated code files, reports, logs). When/how should Fulcrum index them? (a) Harvest in `after_run` hook, store in `artifacts` table with file path, index filenames/types? (b) Inline as docs with frontmatter? (c) Keep in workspace, link via edges?
- **Why it matters**: Affects searchability, reusability, and retention policy (how long are artifacts kept?).
- **Recommended answer**: Harvest in `after_run` hook. Sandcastle provides `copyFileOut()` to extract artifacts from sandbox. Store in `artifacts` table: `{id, run_id, task_id, filename, mime, size, path, metadata_json}`. Create search_documents entries for each artifact (filename + content preview). Link via edges table: `artifact → (generated_by) → agent_run`.
- **Alternatives considered**:
  1. Inline as docs: Natural for markdown, but binaries need preview handlers.
  2. Workspace-only: Simpler, but discovery harder; cleanup requires manual deletion.
- **Blast radius if wrong**: If not harvested, artifact gets lost in sandbox cleanup. If not indexed, agents can't search prior artifacts (redundant work).

---

## 10. Notifications / Activity / Audit

### Q26. Should the event log emit notifications for all mutations, or only high-level summaries?
- **Source**: `04-multi-user-saas.md` § "Notifications"
- **Question**: Events table has every mutation (task created, status changed, doc edited). Should Fulcrum emit notifications for all, or only filtered events (task assigned to me, mentioned, collaboration invited)?
- **Why it matters**: Affects notification spam. If too noisy, users disable. If too sparse, important changes missed.
- **Recommended answer**: Filtered in MVP. `fulcrum doctor --config` allows users to choose notification types: (a) mentions only, (b) assignments only, (c) project updates. Novu integration (Phase 2) handles multi-channel (email, in-app, push). Events table logs everything; notification rules are a separate `notification_rules` table per user.
- **Alternatives considered**:
  1. All events notify: Complete coverage, noise.
  2. None: Silent, but users miss changes.
- **Blast radius if wrong**: If too noisy, users lose trust (turns off notifications). If too quiet, critical updates missed.

---

## 11. Search / Discoverability

### Q27. Should Fulcrum support saved searches and search facets, or only free-text FTS?
- **Source**: `01-pm-tools.md` § "Search facets / saved searches"; VISION-GAPS.md § "Search facets / saved searches"
- **Question**: Postgres FTS works for keyword search. Should MVP also support: (a) faceted search (filter by doc_type, status, assignee), (b) saved searches (named query presets), or only (c) Cmd+K free-text?
- **Why it matters**: Facets + saved searches enable power users; free-text only is simpler to build.
- **Recommended answer**: Free-text FTS in MVP. Phase 2: add faceted search (shadcn-svelte filters) + saved views (stored as query JSON in `saved_views` table). Design query schema now (`{facets: {doc_type, status}, text: '...'}` as JSON), no implementation required yet.
- **Alternatives considered**:
  1. Full facets MVP: Complete discovery, but 2+ weeks of work.
  2. Never: Simpler, but discoverability suffers at scale.
- **Blast radius if wrong**: If query schema not designed, adding facets later means query format breaks. Lock in structure now.

---

## 12. Integrations / API / Webhooks

### Q28. Should Fulcrum expose a public API (REST / tRPC / GraphQL) in MVP, or defer to Phase 2?
- **Source**: `04-multi-user-saas.md` § "API Layer (for SaaS path)"
- **Question**: Local-only MVP doesn't need a public API. But if SaaS is planned, when should the API surface ship? (a) MVP, via tRPC for type-safe internal + OpenAPI wrapper for external, (b) Phase 2 after core UI ships, or (c) only if a specific integration need emerges?
- **Why it matters**: MVP speed vs. future SaaS readiness. API requires testing, docs, versioning discipline.
- **Recommended answer**: Defer to Phase 2. MVP = tRPC internal context only (SvelteKit ↔ PGlite). Phase 2: expose tRPC procedures via `@trpc/server/adapters/express`; add OpenAPI wrapper (`@hono/zod-openapi`) for partner integrations. Benefits: (a) ship web shell faster, (b) lock in data model before API surface, (c) test-drive API internally before external consumption.
- **Alternatives considered**:
  1. API in MVP: Future-proofs, but adds testing burden; slower web shell ship.
  2. Never: Acceptable for solo use, but SaaS adoption suffers (partners can't integrate).
- **Blast radius if wrong**: If deferred and SaaS launches without API, early integrations must use web scraping. If added too early, API churn blocks releases.

---

## Summary: Count by Topic

| Topic | Count |
|-------|-------|
| Vision / Scope / Philosophy | 2 |
| Tracker + Orchestration | 4 |
| Tasks / Scrum / Sprints | 4 |
| Docs / Editor / Wiki / Collab | 4 |
| Memory / Context / RAG / Search | 4 |
| Skills / Workflows | 2 |
| Multi-User / Accounts / Tenancy / SaaS | 3 |
| Repo Supervision | 1 |
| Artifacts / Files | 1 |
| Notifications / Activity / Audit | 1 |
| Search / Discoverability | 1 |
| Integrations / API / Webhooks | 1 |
| **TOTAL** | **28** |

---

## Top 5 Highest-Stakes Questions

These decisions unlock or block the most downstream work:

1. **Q1 — Tracker Autonomy (Fulcrum vs. Linear)** — Determines whether the product is self-contained or Linear-dependent. Affects Symphony adapter scope, kanban authority, and SaaS path. Estimated impact: 3–4 weeks of work for Fulcrum tracker adapter vs. 2-day Linear integration.

2. **Q2 — Docker Prerequisite** — Gates the trust boundary for local-first. Affects install docs, security posture, agent isolation guarantees. Choosing wrong creates support burden (either "you must have Docker" friction or "agents corrupt your home dir" risk).

3. **Q3 — Symphony Conformance Gates** — Without explicit conformance testing, spec drift silently breaks orchestration. Highest probability of silent production bugs; most hidden impact.

4. **Q22 — Composite Indexes NOW** — Easiest decision to defer, hardest to retrofit. One line per table, zero cost in local mode. Deferring = schema migration + downtime during SaaS launch. Recommend: DO IT NOW.

5. **Q16 — Fact Extraction Strategy** — Determines whether memory layer is useful or noisy. Automatic extraction (good signal) vs. user-driven (low friction but requires discipline). Wrong choice wastes memory table or adds Python sidecar later.

---

**Last updated:** 2026-05-01  
**Next review:** After user grill-me session on gray areas
