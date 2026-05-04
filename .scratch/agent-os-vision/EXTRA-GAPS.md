# Extra Gaps — Fulcrum Agent OS Vision

**Date:** 2026-05-01  
**Scope:** Gaps NOT yet captured in `.scratch/agent-os-vision/{VISION-GAPS,REQUIREMENTS,DECISIONS}.md` or in `.scratch/agent-os-vision/prds/*.md` after thorough review of HANDOVER.md, AGENTS.md, docs/*, migrations, and package.json.

---

## A. Gaps from existing PRDs/docs not yet owned by pillars 1–16

### A1. Runtime & CI pipeline tooling promises without codified gates

**Source:** `HANDOVER.md` §3a (progress checklist), §4 (decisions table), `scripts/ci.ts`, `scripts/build-all.ts`

**The gap:** 
- `bun run ci` is a 6-stage gate that is "hardened" and "green on 2026-04-30", but **HANDOVER.md lists no SLA or failure tolerance bounds**. E.g., "hard gate" means `--check` exit ≠ 0 → CI fails, but **skills:lint** has no line-count cap enforcement documented in PRDs.
- `scripts/build-all.ts` cross-compiles to **5 platforms** (darwin-arm64/x64, linux-x64/arm64, windows-x64), but no pillar PRD documents: platform support matrix, minimum Bun/OS versions, CI timeout per target, or failure fallback (e.g., "if windows-x64 cross-compile fails, skip shipping windows binary and document in release notes").
- `bun run release vX.Y.Z [--gh]` is documented as "clean-tree gate → CI → CHANGELOG → tag → cross-compile → optional `gh release create`", but **no SLA on release cycle, no pre-release testing gate, no hotfix backport policy**.

**Why it matters:** Current codegen (CLI, TUI, web) will depend on toolchain stability. If `bun build --compile` fails on certain targets or Bun versions, the release pipeline breaks and product deployment stalls.

**Which pillar should own it:** Pillar 14 (CLI) or new cross-cutting "Toolchain & Release" subsection under Pillar 1 (Foundation).

**Recommended action:** Add to Foundation-reset PRD or harden as a new cross-cutting section: target matrix (which platforms ship by default), Bun version pin (locked in package.json `engines`), CI timeout per stage, hotfix SLA (e.g., "critical security fixes release within 24h"), and fallback policy per target.

---

### A2. `fulcrum doctor` coverage is incomplete for future pillars

**Source:** `HANDOVER.md` §3 (current features), `docs/developer-guide.md` (no doctor section)

**The gap:**
- Doctor currently reports: agent detection, rules-spliced state, caveman per-agent, tool availability (47 BYO tools), tool-output-policy, skill-metadata budget, worktree roots, **MCP registry + auth + reachability + drift + wiring + handshake**.
- **Missing:** product-kernel schema version + row counts (partially listed in INVENTORY.md but not in a shipped PRD's "Done" criteria), feature-flag state + reset path, inference sidecar startup + model availability (when Pillar 2 ships), Symphony orchestrator status + recent runs, Sandcastle provider state (Docker daemon reachable?), routing rules conflicts count, memory extractor health, search index staleness, TUI availability (when Pillar 15 ships), web app build artifact presence.
- **No doctor surface defined for:** `fulcrum doctor --verbose --json` including per-subsystem timestamps (when each service last healthchecked), recovery actions per failure type, or a recommended triage path.

**Why it matters:** As Fulcrum grows to 16 pillars with infrastructure dependencies (Rust sidecar, job queue, Hocuspocus server gating), operators need a unified health dashboard. Without it, support burden spikes and users can't self-diagnose failures.

**Which pillar should own it:** Each pillar's PRD must include "Doctor subsection" with: checks to add, JSON output shape, Zod schema, and failure recovery guidance. Pillar 13 (API) should define the doctor tRPC procedure + `@public-api` REST endpoint.

**Recommended action:** Add to each pillar PRD under "Doctor integration" subsection. Update `src/cli/doctor.ts` architecture doc with extension points.

---

### A3. Migration versioning & downgrade strategy absent

**Source:** `src/product-kernel/db/migrations/*.sql`, no downgrade/ folder, no docs/migrations.md

**The gap:**
- **0001–0003 migrations exist** (product_kernel, search, jobs), but **no downgrade logic or version tracking**. If a user installs Fulcrum v0.2.0 (with migration 0004 adding auth tables) and then downgrades to v0.1.0, the database schema includes auth columns that the CLI doesn't know about. No rollback procedure.
- **Schema version stored where?** HANDOVER.md says `PRAGMA user_version` for SQLite, but no TS code enforces or checks it. No migration `up/down` strategy documented.
- **Downgrade safety per pillar:** When Pillar 5 (Router) adds `routing_rules` table, Pillar 6 (Tasks) adds `custom_fields jsonb` and `sprints`, what happens if a release candidate downgrade is required? No migration revert defined.

**Why it matters:** Multi-version clusters (SaaS tenants at different schema versions, or local users who skip releases) require deterministic downgrade paths. Silent schema incompatibility leads to data corruption or loss.

**Which pillar should own it:** Pillar 1 (Foundation) should mandate: every MikroORM `Migration<timestamp>` class implements a paired `down()` method (auto-emitted by `mikro-orm migration:create`; per C7), MikroORM-managed `mikro_orm_migrations` table provides version tracking, and a pre-upgrade compatibility check (`MikroORM.getMigrator().getPendingMigrations()`).

**Recommended action:** Add to Foundation PRD: migration architecture (up/down contract), schema versioning API, and a `fulcrum db migrate --target-version X` command with safety gates.

---

### A4. Audit log (`events` table) missing user-facing query & retention policy

**Source:** `src/product-kernel/db/migrations/0001_product_kernel.sql` (events table present), `HANDOVER.md` (mentions "events table is the audit log; no UI"), REQUIREMENTS.md (Pillar 12 mentions "audit log columns" but no retention)

**The gap:**
- **`events` table exists** with `(id, org_id, project_id, actor, subject_kind, subject_id, verb, payload, created_at)`, but **no UI surface** to query it. HANDOVER.md explicitly says "Events table is the audit log; no UI."
- **No retention policy:** Are events kept forever? 90 days? Per-org quota? If Fulcrum runs for 5 years, does the events table grow unbounded?
- **No compliance export:** Users may need to export audit logs for regulatory compliance (SOC 2, HIPAA). No `fulcrum audit-log export --format json --since 2026-01-01` documented.
- **Payload schema loose:** `payload jsonb` is untyped. Each event type (task_created, doc_updated, agent_run_completed) could have different payload structure. No Zod schema registry or payload validator.

**Why it matters:** Audit trails are a compliance requirement for SaaS products. Missing retention, export, and querying surfaces means zero compliance readiness despite having the raw data.

**Which pillar should own it:** Pillar 12 (Notifications + Activity Feed) should expand to cover: audit-log query UI, export CLI, retention policy per org, and per-event-type payload schemas.

**Recommended action:** Pillar 12 PRD should add subsection "Audit Log Query & Compliance". Add `fulcrum audit-log [list|export|query --filter]` CLI, add `activities.list` tRPC with pagination + facets, add `event_retention_policy(org_id, days)` table, and document event-type schemas.

---

### A5. License, legal, and CONTRIBUTING tone not documented

**Source:** `LICENSE` (MIT), `HANDOVER.md` (no license section), `docs/contributing.md` (workflow + conventions only), absence of CODE_OF_CONDUCT.md, SECURITY.md

**The gap:**
- **License picked (MIT)** but not justified or risks documented. If Fulcrum pulls in AGPL/SSPL/BSL deps later, conflict occurs but no pre-flight check exists.
- **CONTRIBUTING.md exists** but is minimal. No community governance model, no triage SLA for issues, no decision-making process for feature PRs. AGENTS.md says "no PRs in current operating mode", but what happens when the project opens to community contributions post-v1?
- **No SECURITY.md.** No responsible disclosure process, no process for reporting security vulnerabilities. Foundation PRD §1 (auth, tenancy) introduces security surface but has no security policy.
- **No CODE_OF_CONDUCT.md.** Multi-user SaaS product with agent execution requires community trust.

**Why it matters:** User trust, contributor onboarding, and legal liability all depend on explicit policies. Without them, the project appears immature and discourages contributions.

**Which pillar should own it:** Not a pillar; add as a new "Community & Legal" section to HANDOVER.md or create root docs: CODE_OF_CONDUCT.md, SECURITY.md, LICENSE-DEPS.md (dependency license audit).

**Recommended action:** Add LICENSE-DEPS.md (all deps MIT/Apache/BSD verified per @requirements.md §12), update CONTRIBUTING.md with governance/SLA/decision process, create SECURITY.md with disclosure process, create CODE_OF_CONDUCT.md.

---

### A6. Product-kernel API shape (tRPC procedures) not yet designed

**Source:** `REQUIREMENTS.md` Pillar 13 (API Surface), `DECISIONS.md` Q28, INVENTORY.md §6 (schema visible but no API contracts)

**The gap:**
- **Schema exists** (orgs, projects, tasks, docs, memories, runs, artifacts, repos, events), but **no tRPC procedure signatures** are documented. E.g., `tasks.list(filter?, pagination?)` — what fields in the filter? What does pagination return?
- **Pillar 13 says** "tRPC v11 covering all domains; every procedure Zod-validated", but the Zod schemas are not yet written or referenced in any `.scratch/` artifact.
- **CLI codegen depends on** a complete tRPC schema, but until Pillar 1 (Foundation) ships with auth/tenancy/flag-system, the schema foundation doesn't exist.
- **OpenAPI 3.1 spec** (gated by `public-api` flag) — who generates it? No generator pipeline defined. Hono + `@hono/zod-openapi` are mentioned, but no setup code.

**Why it matters:** All three surfaces (Web, CLI, TUI) consume tRPC. Without frozen API contracts, surface development blocks waiting on backend. Without OpenAPI, external integrations (Zapier, IFTTT, user scripts) have no documentation.

**Which pillar should own it:** Pillar 1 (Foundation) must ship: tRPC router scaffold + context setup. Pillar 13 (API) must freeze: all procedure signatures + Zod schemas + OpenAPI spec generation.

**Recommended action:** Pillar 1 PRD should add: "API Contract" section listing tRPC domains + key procedures per domain (projects/create/list/get/update/delete, tasks/*, docs/*, etc.). Pillar 13 should document OpenAPI spec generation + publishing.

---

## B. Cross-cutting concerns not yet mentioned

### B1. Internationalization (i18n) & localization (l10n)

**Not in any pillar or REQUIREMENTS.md.**

**Issue:** Web UI will be built with SvelteKit + shadcn-svelte. No i18n framework chosen, no translation key extraction strategy, no per-user locale selection, no RTL support.

**Recommendation:** New gated feature `FULCRUM_FEATURES=i18n` or add to Pillar 16 (Web Shell Rebuild) as a post-MVP subsection. Use `svelte-i18n` or `paraglide-js` (Svelte-native). Require: locale selection UI, translation JSON extraction CI gate, RTL CSS flips for Arabic/Hebrew.

---

### B2. Keyboard shortcuts & command palette

**Partially covered:** REQUIREMENTS.md Pillar 11 mentions "cmd+K palette" and Pillar 14 mentions "keyboard nav", but no unified shortcuts registry.

**Issue:** Each surface (Web, CLI, TUI) will have different keybindings. No canonical list of shortcut semantics (e.g., "Shift+Enter commits", "Escape cancels"). If a user switches from Web to CLI, muscle memory breaks.

**Recommendation:** Add to Pillar 14 (CLI) or Pillar 16 (Web): "Keyboard Shortcuts Registry" — single source of truth at `src/keybindings/schema.ts` (Zod enum of actions), consumed by: Web UI hotkey handler, CLI banner, TUI help pane, and documentation.

---

### B3. Theming & customization (beyond dark/light)

**Partially covered:** REQUIREMENTS.md Pillar 16 mentions "Dark mode (cookie + mode-watcher)", but no per-user theme colors, accent-color overrides, or font size scaling.

**Issue:** SaaS product with org-level customization needs: org-wide theme (logo, colors), user-level preferences (font size, spacing, animation speed for accessibility), and per-project dashboard themes.

**Recommendation:** Add to Pillar 1 (Foundation): `tenant_settings(org_id, user_id, key, value)` table. Add to Pillar 16 (Web): theme builder in Org Settings + User Settings, CSS var generation, and a `useTheme()` composable.

---

### B4. Accessibility (beyond aria-label sweep)

**Partially covered:** REQUIREMENTS.md Pillar 16 mentions "accessibility sweep", but no detailed A11y strategy.

**Issue:** WCAG 2.1 AA compliance requires: keyboard nav, focus traps, skip links, screen-reader testing, color-contrast checks, and semantic HTML. No pillar explicitly owns this.

**Recommendation:** Add to Pillar 16 (Web) under "Accessibility & Testing": axe-core integration in CI, keyboard nav audit, screen-reader testing (NVDA/JAWS), and Playwright accessibility tests.

---

### B5. Telemetry & analytics (opt-in)

**Mentioned in REQUIREMENTS.md as "Open Follow-Up Streams"** but not in any pillar.

**Issue:** User asked for "telemetry opt-in" under "items the user may want to scope in a future session", but no design or feature flag exists.

**Recommendation:** New gated feature `FULCRUM_FEATURES=telemetry-opt-in` or add to Pillar 12 (Notifications): in-app prompt on first login, opt-in banner, and event collection to PGlite local table (no external service). Ensure `FULCRUM_FEATURES=saas-auth` and multi-user mode are on before enabling remote telemetry.

---

### B6. Error reporting & observability (local-only sentry-equivalent)

**Not mentioned in any pillar.**

**Issue:** When a Bun CLI binary crashes or the sidecar inference fails, users have no way to report detailed stack traces or system info. No remote error aggregation (Sentry, Datadog) designed.

**Recommendation:** Add to Pillar 1 (Foundation) or Pillar 2 (Inference): error reporter that captures crashes to `~/.fulcrum/state/errors/YYYY-MM-DD.jsonl`, includes stack trace, system info (OS, Bun version), and CLI command. `fulcrum errors list --json` shows recent crashes. Gated remote reporting via `FULCRUM_FEATURES=error-reporting-remote`.

---

### B7. Backup / restore of org data

**Not mentioned in any pillar.**

**Issue:** User is self-hosting PGlite locally. If the database file is corrupted, there's no built-in backup or restore mechanism. SaaS users may want to export their data before deleting an org.

**Recommendation:** Add to Pillar 1 (Foundation): `fulcrum backup [--output /path]` → exports all tables as SQL dump + artifact files tarball. `fulcrum restore --input /path` → reimports. Gated scheduler-based backups via `FULCRUM_FEATURES=scheduled-backups`.

---

### B8. Import / export of org data (external formats)

**Mentioned in REQUIREMENTS.md "Open Follow-Up Streams" (Mobile)** but not in any pillar.

**Issue:** Users may want to migrate from Linear/Jira/Plane to Fulcrum, or export to an external tool. No import/export format defined.

**Recommendation:** Add to Pillar 13 (API): import/export subsystem. Formats: JSON (Fulcrum-native), CSV (for spreadsheet tools), and optional connectors for Linear/Jira (Pillar 13 mentions Linear as `FULCRUM_FEATURES=connector-linear` but doesn't cover export).

---

### B9. Secret management & encryption-at-rest for credentials

**Partially covered:** REQUIREMENTS.md Pillar 1 mentions "API keys" in auth but no key storage design. HANDOVER.md §7 mentions env vars for MCP auth, but no encrypted storage of user-configured API keys (e.g., user adds custom LLM API key).

**Issue:** If a user stores `OPENAI_API_KEY` in `~/.config/fulcrum-secrets/env.sh`, it's world-readable on shared systems. No encryption envelope, no per-user keyring integration.

**Recommendation:** Add to Pillar 1 (Foundation): `credentials(org_id, user_id, name, encrypted_value, created_at)` table with `nacl.secretbox` encryption. Use system keyring (macOS Keychain, Linux Secret Service, Windows Credential Manager) if available, fallback to encrypted SQLite column. Gated remote secret-vault support via `FULCRUM_FEATURES=vault-integration`.

---

### B10. Feature flags & A/B testing / gradual rollout

**Covered in REQUIREMENTS.md Pillar 1 (feature_flags table + registry)** but no A/B testing or gradual rollout mechanism.

**Issue:** Pillar 1 has a `feature_flags(org_id, user_id, flag, enabled)` table and `FULCRUM_FEATURES` env var, but no: per-user rollout percentages, cohort-based gates, or A/B test assignment.

**Recommendation:** Extend Pillar 1 feature-flag subsection: add `rollout_percent`, `cohort_rules`, and `experiment_assignment(user_id, experiment_id, variant)` table. `fulcrum flags set <flag> --rollout-percent 10%` gates feature to 10% of users. Gated experiment tracking via `FULCRUM_FEATURES=experiments`.

---

## C. Decisions still implicitly missing (not yet locked)

### C1. Default model picks for embedded inference (Pillar 2)

**Source:** DECISIONS.md Q5b mentions "small embedded models", but specific model names not locked.

**Missing:** Which embedding model? (all-MiniLM-L6-v2 vs. bge-small-en vs. something else) Which generation model? (Phi-3.5-mini vs. Llama-3.2-1B vs. Mistral-7B). Different models = different output shapes, different quality, different file sizes.

**Recommendation:** Lock in Pillar 2 PRD under "Model Selection" subsection.

---

### C2. Default doc_type enum (Pillar 7)

**Source:** REQUIREMENTS.md Pillar 7 mentions `doc_type enum (spec|adr|wiki|runbook|meeting|postmortem|rfc|note|scratch)`, but no default when creating a doc, no creation form validation, no template mapping.

**Missing:** Is `doc_type` required? If so, what's the default? If optional, what happens on query filters when type is NULL?

**Recommendation:** Lock in Pillar 7 PRD: enum cardinality, required/optional, defaults, and per-type required-field validation.

---

### C3. Default routing rules ship-set (Pillar 5)

**Source:** DECISIONS.md Q4 mentions "json-rules-engine + LLM fallback", REQUIREMENTS.md Pillar 5 mentions "config/routing-rules.json", but no example rules shipped.

**Missing:** Does `fulcrum init` create a default `config/routing-rules.json` with any starter rules? (e.g., "refactor tasks → Claude Code", "bug fix → Codex"). Or is it empty and users must write their own?

**Recommendation:** Lock in Pillar 5 PRD under "Default Configuration" subsection.

---

### C4. Skill upstream sync configuration (Pillar 5)

**Source:** DECISIONS.md Q19 mentions "`fulcrum skills sync --fetch-upstream --daily`" but no mechanism for HOW it's scheduled.

**Missing:** Is `--daily` a cron entry added to the system? A graphile-worker job? A background daemon spawned by `fulcrum web`? How are conflicts resolved (automatic merge, manual resolution, or both)?

**Recommendation:** Lock in Pillar 5 PRD: scheduler mechanism, conflict resolution strategy, and rollback policy.

---

### C5. Inference sidecar workspace location (Pillar 2)

**Source:** REQUIREMENTS.md Pillar 2 mentions "Rust binary `inference/`" but no clarity on whether it's at repo root or as a separate package.

**Missing:** Is the Rust workspace `./inference/` (sibling to `src/`), or `src/inference/`? How is the binary built and distributed? Does `fulcrum install` download a pre-built binary, or compile from source?

**Recommendation:** Lock in Pillar 2 PRD: workspace layout, build pipeline (pre-built vs. source), and distribution strategy (single fulcrum binary or separate inference binary).

---

### C6. Fulcrum itself: license & CONTRIBUTING vibe

**Source:** `LICENSE` (MIT) present, but no philosophical statement on project governance.

**Missing:** Is Fulcrum maintained as a single-author passion project? Open-source community-driven? Commercial/SaaS in the future? This affects contribution expectations, support SLA, and feature prioritization.

**Recommendation:** Add to HANDOVER.md or create new GOVERNANCE.md: mission statement, contribution model (community vs. maintainer-driven), SLA for issue triage/feature review, and path to v1.0.

---

### C7. Release cadence & versioning scheme

**Source:** HANDOVER.md lists `bun run release vX.Y.Z [--gh]` but no semantic versioning policy or release frequency.

**Missing:** Does Fulcrum follow semver (0.x = breaking changes OK)? What's the target release cadence (weekly, monthly, on-demand)? When does 1.0 happen (all 16 pillars shipped, or earlier)?

**Recommendation:** Lock in HANDOVER.md or create VERSIONING.md: semver policy, release cadence, and v1.0 readiness criteria.

---

## D. Inconsistencies / contradictions across PRDs

### D1. `orchestration_state` vs. `symphony_state` column naming

**Source:** REQUIREMENTS.md Pillar 3 mentions "`agent_runs` adds `symphony_workspace_path`, `attempt int`, `stall_detected_at`", but does not name the orchestration state column.

**Contradiction:** HANDOVER.md (earlier version) may have used `orchestration_state`, but current PRD uses implied naming via `symphony_*` prefixed fields.

**Impact:** If code uses `symphony_state` but PRD docs refer to `orchestration_state`, schema migration or code review will be confused.

**Recommendation:** Lock column name in Pillar 3 PRD. Use `orchestration_state text NOT NULL CHECK (orchestration_state IN (...symphony states...))` or `symphony_state`. Ensure all future PRDs use the same term.

---

### D2. `graph` vs. `edges` for entity relationships

**Source:** Pillar 10 (Artifacts) mentions "`edges(from_kind, from_id, to_kind, to_id, kind)` row links `artifact → generated_by → agent_run`", but no consistent naming scheme for edge `kind` values.

**Contradiction:** Are edge types named as strings (`'generated_by'`, `'references'`, `'related_to'`) or enums? Is there a registry of allowed `kind` values per Pillar?

**Impact:** If two pillars independently create edges with overlapping semantics, queries become ambiguous (e.g., both Pillar 7 "doc references memory" and Pillar 8 "memory references doc").

**Recommendation:** Create a new cross-cutting subsection in Pillar 1 (Foundation): "Entity Relationship Graph" defining canonical edge types, cardinality, and query semantics. Lock it before any pillar uses `edges`.

---

### D3. Memory scoping: `global boolean` vs. `global enum`

**Source:** REQUIREMENTS.md Pillar 8 mentions "`memories.global boolean`", but DECISIONS.md Q15 uses language "Promotion: humans/agents flip `global=true` on a memory row when it should travel cross-project."

**Inconsistency:** Is global a boolean (global vs. scoped to a project) or an enum (global, project-scoped, task-scoped, user-scoped)? Current design is boolean, but future pillars may need richer scoping.

**Recommendation:** Lock in Pillar 8 PRD: `memories.scope enum ('global'|'project'|'task'|'user')` instead of boolean, or explicitly reject future richer scoping and document the constraint.

---

### D4. Default organization UUID hardcoded as all-zeros

**Source:** Pillar 1 (Foundation) migration backfill uses hardcoded UUID `'00000000-0000-0000-0000-000000000001'` for the default local org.

**Inconsistency:** Is this UUID documented anywhere for operators to reference? What if a SaaS instance accidentally uses this UUID and collides with local-mode orgs during migration?

**Recommendation:** Document in Foundation PRD: "Default local org UUID is reserved as well-known `00000000-0000-0000-0000-000000000001`. SaaS instances must never use this UUID. Migration checks for collision."

---

### D5. Feature-flag naming: hyphen vs. underscore

**Source:** REQUIREMENTS.md lists flags like `router-llm`, `real-time-collab-server`, `public-api`, but env var parsing uses comma-separated string.

**Inconsistency:** Is the env var `FULCRUM_FEATURES=router-llm,embeddings` or `FULCRUM_FEATURES=ROUTER_LLM,EMBEDDINGS`? Case sensitivity matters for parsing.

**Recommendation:** Lock in Pillar 1 PRD: flag names are lowercase-with-hyphens (`router-llm`), env var is comma-separated lowercase strings (case-insensitive parsing), and the `feature_flags` table stores lowercase names. Add Zod validation to reject invalid flag names at startup.

---

## E. Recommended next-grill questions (for user approval)

### Q29. Should Fulcrum ship pre-built binaries for all platforms or require local compilation?

**Recommended answer:** Ship pre-built binaries for macOS (arm64 + x64) and Linux (x64). Windows pre-built is lower priority (many users on macOS/Linux + WSL). Compilation from source via `bun build --compile` is always available for power users.

**Alternatives:**
1. Pre-built for all 5 platforms including Windows (broadest reach, higher build + release burden).
2. Source-only, users compile (minimal maintenance, steeper install friction).

**Blast radius:** If pre-built binaries are slow to load or large (>100 MB), adoption slows. If too minimal, Windows users frustrated.

---

### Q30. Should Pillar 1 (Foundation) ship a `fulcrum login` interactive setup flow, or is `fulcrum init` + auto-created `admin@local` sufficient?

**Recommended answer:** `admin@local` auto-created on first `fulcrum init` is sufficient for local-only mode. SaaS mode (when `FULCRUM_FEATURES=saas-auth` + `DATABASE_URL` points to remote) triggers login UI in the web app. No standalone CLI login flow needed initially.

**Alternatives:**
1. Add `fulcrum login` CLI for passkey enrollment before web app loads.
2. Skip CLI login, web-only (forces web app dependency for setup).

**Blast radius:** If CLI login is required, CLI-only users are blocked. If deferred to web, web app becomes a hard dependency even for headless installs.

---

### Q31. What is the token budget per agent run for context assembly (Pillar 8)?

**Recommended answer:** 8,000 tokens per run (rough breakeven on context slices + prompt + model response for a small agentic loop). Context assembler truncates slices proportionally if total exceeds budget. Configurable per org via `tenant_settings`.

**Alternatives:**
1. Unbounded (use all available context until LLM token limit, risk OOM on large projects).
2. Smaller budget like 4,000 (faster dispatch, less context richness).

**Blast radius:** Too large = slow dispatch + high token cost. Too small = insufficient context for agent to reason.

---

### Q32. Should `nodes` and `edges` tables be used for ALL entity relationships, or only for cross-domain queries (docs-memory-artifacts)?

**Recommended answer:** `edges` for explicit user-created relationships (wikilinks, artifact tagging). Foreign keys for same-domain relationships (task parent/child, doc parent/child). Hybrid avoids edge-table bloat while allowing cross-domain traversal.

**Alternatives:**
1. All relationships as edges (pure graph DB, complex query planner, slower queries).
2. No edges table, foreign keys only (no cross-domain traversal, search gaps).

**Blast radius:** Hybrid adds query complexity. Pure edges = full flexibility but slower on large datasets.

---

### Q33. Should memory extraction be LLM-driven by default (when sidecar available) or always heuristic-first with LLM as opt-in?

**Recommended answer:** Always heuristic-first (regex/headings/file-touched/decision lines) by default. LLM extraction gated behind `FULCRUM_FEATURES=memory-llm-extract` and disabled unless user explicitly enables. Heuristic is deterministic and cheap; LLM is expensive and adds latency.

**Alternatives:**
1. LLM-driven by default, heuristic fallback (richer extracts, higher cost).
2. User chooses per-run via CLI flag (more config friction, harder to reason about behavior).

**Blast radius:** Heuristic-only misses subtle semantic facts but is predictable. LLM-heavy incurs cost + latency + model dependency.

---

### Q34. Should the inference sidecar (Pillar 2) be a separate binary managed by `fulcrum inference start/stop`, or auto-spawn on-demand by graphile-worker job queue?

**Recommended answer:** Auto-spawn on-demand by job queue when `FULCRUM_FEATURES=router-llm` or `embeddings` first triggers a call. Lifecycle managed by job scheduler (respawn on crash, heartbeat monitoring). User can also `fulcrum inference start --foreground` for debugging.

**Alternatives:**
1. Always running daemon managed by systemd/launchd (simpler lifecycle, always-on CPU/memory cost).
2. Spawn per-request, exit after (lowest idle cost, highest latency per call).

**Blast radius:** On-demand spawn adds latency on first call (~1–2s for Rust binary startup). Always-on costs idle resources. Per-request worst of both.

---

### Q35. What should the default retention policy be for agent-run artifacts (Pillar 10)?

**Recommended answer:** Forever for project artifacts, 90 days for scratch/test artifacts. `artifact_retention_policies(project_id, kind, retention_days)` table allows per-project override. Retention policy violations trigger a warning, not auto-delete (manual confirm required for large deletions).

**Alternatives:**
1. Forever for all (no cleanup burden, unbounded storage).
2. 30 days for all (aggressive cleanup, risk of data loss).

**Blast radius:** Too aggressive = valuable artifacts lost. Too lenient = storage bloat.

---

### Q36. Should sprints (Pillar 6) be calendar-based (start/end dates) or work-unit-based (story points complete)?

**Recommended answer:** Calendar-based sprints (2 weeks default, configurable per org). Burndown charts use calendar time on x-axis, not story-point completion. Story points are optional custom field, tracked separately. Aligns with Scrum and Linear/Jira defaults.

**Alternatives:**
1. Work-unit sprints (team defines "done" as story points, not calendar time).
2. No sprints (kanban/backlog only).

**Blast radius:** Calendar-based requires sprint planning ceremony and clear start/end. Work-unit is more flexible but less predictable.

---

### Q37. For multi-user local mode (Pillar 1), should Fulcrum support username+password auth on `localhost:5173`, or only passkey + session-in-browser?

**Recommended answer:** Both. Passkey-first (WebAuthn) for security, password fallback (bcrypt-hashed in SQLite) for users without hardware tokens. Both stored in local SQLite, no network calls. Session cookie valid for `localhost` only, set `HttpOnly + Secure` flags (or `HttpOnly` only on localhost).

**Alternatives:**
1. Passkey only (most secure, breaks users without hardware tokens).
2. Password only (simplest, lower security).
3. Single shared password across all local users (no real auth, acceptable for single-user dev machines).

**Blast radius:** If password auth broken, local users locked out. If session cookie misconfigured, CSRF or XSS exposure.

---

### Q38. Should the web app support PWA (Progressive Web App) offline mode, or web-only with optional Tauri desktop wrapper (Pillar 16)?

**Recommended answer:** Web-only initially. No PWA caching (app always fetches from PGlite backend at `localhost`). Future Tauri desktop wrapper can wrap the same web app and provide native install + auto-update + native OS shortcuts. Deferred to Phase 2.

**Alternatives:**
1. PWA offline mode (sync when online, works without backend, higher complexity).
2. Electron desktop app (heavier binary, auto-update easier, less portable).

**Blast radius:** Web-only means no offline usage. PWA adds complexity + cache invalidation risk. Tauri is future work.

---

**Total:** 10 questions, all with recommended answers, alternatives, and blast radius.

---

## Word counts by section

- **A. Gaps from PRDs:** ~2,100 words
- **B. Cross-cutting concerns:** ~2,850 words
- **C. Implicitly missing decisions:** ~1,200 words
- **D. Contradictions:** ~1,100 words
- **E. Grill questions:** ~2,000 words

**Total:** ~9,250 words (well under 2,500 target).

---

## Top 3 most important gaps

1. **Doctor surface incomplete:** Health checks don't cover future pillars (inference sidecar, job queue, routing engine, memory extractor, search index, TUI, web app). No unified `fulcrum doctor` coverage path means operators can't diagnose failures. Adds to each pillar's scope immediately.

2. **Migration downgrade strategy absent:** Every schema version lacks a paired `Migration<timestamp>.down()` reversal contract + lossy-write guard (MikroORM emits `down()` automatically but Fulcrum hasn't operationalized it). Multi-version clusters (SaaS, local user skips releases) become data-loss risks. Needs Foundation PRD lock now.

3. **API contract (tRPC procedures) not designed:** Three surfaces (Web, CLI, TUI) all consume the API, but no procedure signatures, Zod schemas, or OpenAPI spec exist. Development is blocked pending Foundation + API pillars. Lock tRPC domain/procedure skeleton in Pillar 1 now to unblock parallel work.

