# SQL-Sweep Manifest: Constraint Audit & Rewrite Plan

**Audit Date:** May 1, 2026  
**Hard Constraint:** NO plaintext SQL anywhere in the project. Everything class-driven, NestJS-style — decorators on entities, repositories via DI, migrations as classes.  
**Current State:** Scratch tree was written assuming Drizzle ORM + raw `.sql` migration files. This manifest identifies all occurrences requiring rewrite.

---

## Executive Summary

### Top-Line Totals
- **Total SQL-related references:** 437 occurrences
- **Files affected:** 119 files across 17 PRDs + 17 pillar issue sets + 8 cross-cutting docs
- **Files clean (zero occurrences):** 254+ files with no SQL references
- **Rewrite scope:** Moderate-to-heavy. Core areas: migrations, schema definitions, and query documentation.

### Top-10 Hottest Files (Heaviest Rewrite Needed)
1. **prds/01-foundation-reset.md** — 38 refs (migrations 0004–0007, auth schema, events backfill, indexes)
2. **prds/08-memory-context-engine.md** — 21 refs (pgvector, memory embeddings, doc embeddings, tsvector)
3. **prds/13-api-and-webhooks.md** — 19 refs (webhook tables, connector tables, rate limit tables)
4. **prds/11-search-and-discovery.md** — 19 refs (search_documents table, search_clicks, saved_views)
5. **research/03-orchestration-memory-skills.md** — 17 refs (memory schema, pgvector, agent_runs)
6. **prds/17-cross-cutting-platform.md** — 16 refs (credentials, telemetry, error logs, experiments tables)
7. **prds/12-notifications-activity-audit.md** — 11 refs (notification rules, user_notifications, audit retention)
8. **prds/02-inference-sidecar.md** — 11 refs (inference cache schema, embedding columns, models registry)
9. **prds/06-tasks-and-scrum.md** — 10 refs (sprints, custom fields, saved views migrations)
10. **prds/07-docs-editor-collab.md** — 10 refs (docs schema, doc_versions, doc_links migrations)

### Distribution by Category

| Category | Count | Notes |
|----------|-------|-------|
| `migration-file-name` | 97 | References to `0004_auth`, `0005_backfill`, etc. |
| `special-types` | 101 | pgvector, tsvector, casbin_rule type/table mentions |
| `ddl-snippet` | 84 | CREATE/ALTER TABLE statements in docs |
| `dml-snippet` | 51 | INSERT/UPDATE statements in schema examples |
| `raw-query-string` | 35 | SELECT...FROM patterns in query examples |
| `drizzle-mention` | 33 | "Drizzle migration", "Drizzle schema", etc. |
| `schema-ts-mention` | 26 | References to src/db/schema.ts, src/keybindings/schema.ts |
| `ddl-dml-term` | 28 | Explicit "DDL", "DML" terminology |
| `pragma-info-schema` | 21 | PRAGMA table_info, information_schema |
| `sql-extension` | 22 | `.sql` file references |

### Estimated Rewrite Effort by Pillar

| Pillar | Effort Level | Justification | Core Issues |
|--------|--------------|---------------|------------|
| **P1 (Foundation)** | **HEAVY** | 4 migrations (0004–0007), auth/events/indexes schemas, migration framework | Migrations 0004–0007 DDL; migration versioning; index specs |
| **P2 (Inference Sidecar)** | **HEAVY** | pgvector embedding columns, cache schema (SQLite + PGlite), models registry | pgvector HNSW indexes, embed_cache/gen_cache DDL, inference_models table |
| **P3 (Symphony Orchestration)** | **MEDIUM** | 5 new agent_runs columns, workflow_definitions table, partial indexes | Workflow_definitions DDL, partial indexes for state machine |
| **P4 (Sandcastle Wrapper)** | **MEDIUM** | agent_runs Sandcastle columns, artifacts table, edges table, agent_profiles | 3 new tables (artifacts, edges, agent_profiles) |
| **P5 (Router & Skills)** | **LIGHT** | routing_rules, fulcrum_skills tables, schema reference | 2 tables, no pgvector/special types |
| **P6 (Tasks & Scrum)** | **MEDIUM** | sprints, custom_field_defs, saved_views tables, composite indexes | 3 tables, index specs, composite indexes |
| **P7 (Docs & Collab)** | **MEDIUM** | 5 doc-related tables, doc_links, doc_versions, doc_comments, templates | Docs DDL, tsvector for doc search |
| **P8 (Memory & Context)** | **HEAVY** | pgvector embeddings, memory_links, doc_embeddings, HNSW indexes | pgvector HNSW, memory schema, doc_embeddings table |
| **P9 (Repos & Git)** | **MEDIUM** | repos extensions, repo_branches, repo_commits, repo_files_index, 3 connectors | Composite indexes, connector tables (GitHub/GitLab/Bitbucket) |
| **P10 (Artifacts)** | **LIGHT** | artifacts table extension, retention columns, prune job definition | Single table extension, no special types |
| **P11 (Search & Discovery)** | **HEAVY** | search_documents, search_clicks, full-text indexes, tsvector, saved_views | search_documents tsvector indexes, FTS setup |
| **P12 (Notifications & Audit)** | **HEAVY** | 8 notification tables, audit_retention_policies, webhook configs, push subscriptions | 8 new tables, retention policy, webhook_rule_configs, push_subscriptions |
| **P13 (API & Webhooks)** | **HEAVY** | webhooks, webhook_deliveries, rate_limit_buckets, connectors, connector_runs | 5 new tables, connector architecture |
| **P14 (CLI Codegen)** | **LIGHT** | src/keybindings/schema.ts references (Zod, not SQL) | Keybindings registry (Zod-driven, not SQL) |
| **P15 (TUI)** | **LIGHT** | Keybindings schema references, no direct SQL | TUI keybindings, i18n locale in tenant_settings |
| **P16 (Web Shell Rebuild)** | **LIGHT–MEDIUM** | Settings routes, feature flags, tenant_settings schema | Theme vars, keybindings overrides, no new tables |
| **P17 (Cross-Cutting)** | **HEAVY** | credentials, telemetry_events, error_logs, experiment_assignment, feature_flags extensions | 4 new tables, credentials vault, telemetry schema |

---

## Per-PRD Detailed Manifest

### Pillar 1: Foundation Reset

**File:** `prds/01-foundation-reset.md` (38 refs)

| Line | Category | Excerpt | Issue |
|------|----------|---------|-------|
| 383 | migration-file-name | `migrations/up_NNNN_<slug>.sql` — forward migration (required) | Migrate to class-based migration system |
| 384 | migration-file-name | `migrations/down_NNNN_<slug>.sql` — reversal migration (required) | Implement reversible class migrations |
| 456 | raw-query-string | `SELECT id FROM orgs WHERE id='00000000-0000-0000-0000-000000000001'` | Doctor check → repository query |
| 457 | raw-query-string | `SELECT id FROM users WHERE email='admin@local'` | Doctor check → repository query |
| 458 | raw-query-string | `EXPLAIN SELECT … FROM tasks WHERE org_id=?` | Doctor check → query builder |
| 460 | raw-query-string | `SELECT count(*) FROM events WHERE org_id IS NULL` | Doctor check → repository count |
| 461 | raw-query-string | `SELECT count(*) FROM orgs WHERE id IN (...)` | Doctor check → repository query |
| 500 | migration-file-name | `src/db/migrations/0004_auth.sql` | Rewrite as class migration |
| 505 | migration-file-name | `src/db/migrations/0005_org_id_backfill.sql` | Rewrite as class migration |
| 510 | migration-file-name | `src/db/migrations/0006_composite_indexes.sql` | Rewrite as class migration |
| 515 | migration-file-name | `src/db/migrations/0007_flag_stubs.sql` | Rewrite as class migration |
| 569 | raw-query-string | `SELECT * FROM events WHERE org_id=? ORDER BY created_at DESC LIMIT 50` | Query builder via repository |

**Issue Files in P1:** 20 files tracked separately

| Issue File | Refs | Hottest Items |
|------------|------|---------------|
| 01-schema-auth-migration.md | 3 | Migration 0004_auth.sql; Drizzle execution; information_schema validation |
| 02-events-org-id-backfill.md | 2 | Migration 0005_org_id_backfill.sql; EXPLAIN plan validation |
| 03-composite-indexes-and-flag-stub-tables.md | 4 | Migrations 0006, 0007; composite index specs; stub table creation |
| 16-casbin-policies-gated-flag.md | 8 | casbin_rule table; Casbin adapter from migration 0007; table references |
| 07-feature-flag-registry.md | 6 | feature_flags table; DB row overrides; flag system schema |
| 06-trpc-core-router-and-permission-middleware.md | 4 | Permission schema, event rows tracking; events table writes |
| 19-migration-up-down-versioning.md | 3 | Migration framework; up/down paired files; schema_migrations tracking table |

**Total P1 References:** 38 in PRD + ~30 in issues = **~68 total** → **Highest rewrite priority**

---

### Pillar 2: Inference Sidecar

**File:** `prds/02-inference-sidecar.md` (11 refs)

| Line | Category | Excerpt | Issue |
|------|----------|---------|-------|
| 283 | raw-query-string | `SELECT downloaded FROM inference_models WHERE kind='embed'` | Doctor check → repository query |
| 289 | raw-query-string | Sums `size_bytes` from `inference_models WHERE downloaded=true` | Doctor check → aggregation query |

**Issue Files in P2:**

| Issue File | Refs | Hottest Items |
|------------|------|---------------|
| 03-inference-cache-schema.md | 2 | SQLite cache schema (0008_inference_cache); Rust rusqlite migration; PGlite migration 0008 |
| 10-ts-backend-abstraction.md | 1 | inference.backends.list() tRPC return; no direct SQL |

**Total P2 References:** 11 in PRD + ~4 in issues = **~15 total** → **HEAVY rewrite (pgvector + cache schema)**

---

### Pillar 3: Symphony Orchestration

**File:** `prds/03-symphony-orchestration.md` (8 refs)

| Line | Category | Excerpt | Issue |
|------|----------|---------|-------|
| 289 | raw-query-string | `SELECT count(*) FROM agent_runs WHERE orchestration_state='stalled'` | Doctor check → repository count |

**Issue Files in P3:**

| Issue File | Refs | Hottest Items |
|------------|------|---------------|
| 02-schema-workflow-definitions.md | 1 | workflow_definitions table; Drizzle migration; composite index specs |
| 03-schema-agent-runs-symphony-columns.md | 2 | 5 new agent_runs columns; partial indexes; Drizzle migration |

**Total P3 References:** 8 in PRD + ~4 in issues = **~12 total** → **MEDIUM rewrite**

---

### Pillar 4: Sandcastle Wrapper

**File:** `prds/04-sandcastle-wrapper.md` (8 refs)

| Line | Category | Excerpt | Issue |
|------|----------|---------|-------|
| 70 | ddl-snippet | `ALTER TABLE agent_runs` | Extend agent_runs with Sandcastle columns |
| 84 | ddl-snippet | `CREATE TABLE IF NOT EXISTS artifacts` | New artifacts table DDL |
| 100 | ddl-snippet | `CREATE TABLE IF NOT EXISTS edges` | New edges relationship table DDL |
| 117 | ddl-snippet | `CREATE TABLE IF NOT EXISTS agent_profiles` | New agent_profiles table DDL |
| 210 | dml-snippet | `UPDATE agent_runs SET status=running, sandbox_mode=host` | Runtime table updates via ORM |

**Issue Files in P4:**

| Issue File | Refs | Hottest Items |
|------------|------|---------------|
| 02-agent-runs-schema-migration.md | 3 | Drizzle migration; 7 new agent_runs columns; IF NOT EXISTS guards |
| 03-artifacts-edges-migration.md | 2 | Two Drizzle migrations; artifacts table; edges table; composite indexes |
| 04-agent-profiles-migration.md | 1 | Drizzle migration; agent_profiles table |

**Total P4 References:** 8 in PRD + ~7 in issues = **~15 total** → **MEDIUM rewrite**

---

### Pillar 5: Router & Skills

**File:** `prds/05-router-and-skills.md` (2 refs)

| Line | Category | Excerpt | Issue |
|------|----------|---------|-------|
| 94 | ddl-snippet | `CREATE TABLE routing_rules` | New routing_rules table DDL |
| 120 | ddl-snippet | `CREATE TABLE fulcrum_skills` | New fulcrum_skills table DDL |

**Issue Files in P5:**

| Issue File | Refs | Hottest Items |
|------------|------|---------------|
| 01-routing-rules-schema-migration.md | 1 | Drizzle migration; routing_rules table; CHECK constraint on `source` |
| 02-fulcrum-skills-schema-migration.md | 1 | Drizzle migration; fulcrum_skills table; UNIQUE constraint |

**Total P5 References:** 2 in PRD + ~2 in issues = **~4 total** → **LIGHT rewrite**

---

### Pillar 6: Tasks & Scrum

**File:** `prds/06-tasks-and-scrum.md` (10 refs)

| Line | Category | Excerpt | Issue |
|------|----------|---------|-------|
| 443 | migration-file-name | `sprints` table present with unique active index | Migration 0006 |
| 444 | migration-file-name | `custom_field_defs` table present | Migration 0006 |
| 445 | migration-file-name | `saved_views` table present | Migration 0006 |

**Issue Files in P6:**

| Issue File | Refs | Hottest Items |
|------------|------|---------------|
| 01-tasks-schema-extension.md | 5 | Drizzle migration; ADD COLUMN IF NOT EXISTS; task extension schema |
| 02-sprints-schema.md | 2 | Drizzle migration; sprints table; unique active constraint |
| 03-custom-field-defs-schema.md | 1 | CustomFieldDefRow Drizzle type |
| 04-saved-views-schema.md | 3 | Drizzle where() clauses; compileSavedViewQuery SQL fragment |
| 14-gantt-timeline-view.md | 1 | `tasks.schema.ts` migration; ADD COLUMN start_date |

**Total P6 References:** 10 in PRD + ~12 in issues = **~22 total** → **MEDIUM rewrite**

---

### Pillar 7: Docs Editor & Collab

**File:** `prds/07-docs-editor-collab.md` (10 refs)

**Issue Files in P7:**

| Issue File | Refs | Hottest Items |
|------------|------|---------------|
| 01-docs-schema-foundation.md | 5 | 5 Drizzle migrations; doc tables; FK cascades; composite indexes; tsvector for search |
| 13-frontmatter-form-yaml-ui.md | 1 | Zod schema introspection for form rendering |
| 20-tui-doc-reader-editor.md | 1 | Doc archive (soft-delete) operation |

**Total P7 References:** 10 in PRD + ~7 in issues = **~17 total** → **MEDIUM-HEAVY rewrite**

---

### Pillar 8: Memory & Context Engine

**File:** `prds/08-memory-context-engine.md` (21 refs)

| Line | Category | Excerpt | Issue |
|------|----------|---------|-------|
| 152 | ddl-snippet | `CREATE TABLE memories` | Memory table DDL |
| 176 | ddl-snippet | `CREATE TABLE memory_links` | Memory links table DDL |
| 187 | ddl-snippet | `CREATE TABLE memory_embeddings` | Memory embeddings (pgvector) table DDL |
| 193 | ddl-snippet | `CREATE TABLE doc_embeddings` | Doc embeddings (pgvector) table DDL |
| 311 | raw-query-string | `SELECT docs WHERE id IN (wikilinks from task description) LIMIT 5` | Context assembly query |

**Issue Files in P8:**

| Issue File | Refs | Hottest Items |
|------------|------|---------------|
| 01-schema-migration-core.md | 3 | Memory schema; pgvector support; HNSW indexes |

**Total P8 References:** 21 in PRD + ~3 in issues = **~24 total** → **HEAVY rewrite (pgvector)**

---

### Pillar 9: Repos & Git Supervision

**File:** `prds/09-repos-git-supervision.md` (9 refs)

| Line | Category | Excerpt | Issue |
|------|----------|---------|-------|
| 102 | migration-file-name | `-- migration 0009_repos_git` | Migration comment |
| 105 | ddl-snippet | `ALTER TABLE repos` | Extend repos table |
| 123 | ddl-snippet | `CREATE TABLE repo_branches` | New repo_branches table DDL |
| 137 | ddl-snippet | `CREATE TABLE repo_commits` | New repo_commits table DDL |
| 154 | ddl-snippet | `CREATE TABLE repo_files_index` | New repo_files_index table DDL |
| 168 | ddl-snippet | `ALTER TABLE tasks ADD COLUMN repo_id` | Extend tasks with repo_id |
| 316 | migration-file-name | Run migration 0009 | Migration reference |
| 342 | migration-file-name | Migration 0009_repos_git | Named migration reference |
| 385 | ddl-snippet | Migration applies clean on PGlite + PostgreSQL | Migration execution spec |

**Issue Files in P9:**

| Issue File | Refs | Hottest Items |
|------------|------|---------------|
| 01-schema-migration.md | 4 | ALTER TABLE tasks; CREATE INDEX; composite indexes; foreign keys |
| 14-connector-github.md | 2 | Migration 0009b_github; github_prs, github_issues tables |
| 15-connector-gitlab.md | 1 | Migration 0009c_gitlab; gitlab_mrs, gitlab_issues tables |
| 16-connector-bitbucket.md | 1 | Migration 0009d_bitbucket; bb_prs, bb_issues tables |

**Total P9 References:** 9 in PRD + ~8 in issues = **~17 total** → **MEDIUM rewrite**

---

### Pillar 10: Artifacts

**File:** `prds/10-artifacts.md` (4 refs)

| Line | Category | Excerpt | Issue |
|------|----------|---------|-------|
| 37 | migration-file-name | Migration `0010_artifacts` extends and tightens artifacts table stub | Named migration |
| 72 | raw-query-string | `artifacts WHERE retention_until < now()` | Prune job query |
| 119 | migration-file-name | `-- migration 0010_artifacts` | Migration comment |
| 287 | migration-file-name | Run migration 0010 | Migration reference |

**Issue Files in P10:**

| Issue File | Refs | Hottest Items |
|------------|------|---------------|
| 01-schema-migration.md | 3 | artifacts table extension; retention columns; indexes |
| 04-worker-job.md | 1 | graphile_worker.jobs table query |
| 05-retention-pruner.md | 1 | Artifacts prune cron job |

**Total P10 References:** 4 in PRD + ~5 in issues = **~9 total** → **LIGHT rewrite**

---

### Pillar 11: Search & Discovery

**File:** `prds/11-search-and-discovery.md` (19 refs)

| Line | Category | Excerpt | Issue |
|------|----------|---------|-------|
| 129 | ddl-snippet | `CREATE TABLE search_documents` | search_documents table DDL |
| 161 | ddl-snippet | `CREATE TABLE search_clicks` | search_clicks table DDL |
| 175 | ddl-snippet | `-- ALTER TABLE saved_views DROP CONSTRAINT saved_views_view_type_check` | ALTER migration |
| 176 | ddl-snippet | `-- ALTER TABLE saved_views ADD CONSTRAINT saved_views_view_type_check` | ALTER migration |

**Issue Files in P11:**

| Issue File | Refs | Hottest Items |
|------------|------|---------------|
| 01-schema-migration.md | 4 | search_documents, search_clicks, full-text index specs; tsvector |
| 06-suggest-and-quick-filter.md | 1 | `SELECT DISTINCT title FROM search_documents WHERE org_id=$1 AND title ILIKE...` |
| 14-embeddings-hybrid-search.md | 3 | Semantic search via pgvector; embedding columns |

**Total P11 References:** 19 in PRD + ~8 in issues = **~27 total** → **HEAVY rewrite (tsvector, hybrid search)**

---

### Pillar 12: Notifications & Activity Audit

**File:** `prds/12-notifications-activity-audit.md` (11 refs)

| Line | Category | Excerpt | Issue |
|------|----------|---------|-------|
| 108 | ddl-snippet | `CREATE TABLE notification_rules` | notification_rules table DDL |
| 120 | ddl-snippet | `CREATE TABLE user_notifications` | user_notifications table DDL |
| 133 | ddl-snippet | `CREATE TABLE notification_deliveries` | notification_deliveries table DDL |
| 148 | ddl-snippet | `CREATE TABLE notification_mutes` | notification_mutes table DDL |
| 158 | ddl-snippet | `CREATE TABLE notification_quiet_hours` | notification_quiet_hours table DDL |
| 170 | ddl-snippet | `CREATE TABLE audit_retention_policies` | audit_retention_policies table DDL |
| 179 | ddl-snippet | `CREATE TABLE webhook_rule_configs` | webhook_rule_configs table DDL |
| 188 | ddl-snippet | `CREATE TABLE push_subscriptions` | push_subscriptions table DDL |

**Issue Files in P12:**

| Issue File | Refs | Hottest Items |
|------------|------|---------------|
| 01-schema-migration.md | 1 | Migration 0012_notifications; 8 tables + retention policy |
| 02-rule-engine.md | 1 | SELECT * FROM notification_rules WHERE org_id... query pattern |
| 05-trpc-notify-procedures.md | 2 | SELECT COUNT(*) FROM user_notifications; SELECT COUNT(*) FROM notification_deliveries |
| 08-audit-retention-cron.md | 1 | Retention policy schema; event pruning logic |

**Total P12 References:** 11 in PRD + ~6 in issues = **~17 total** → **HEAVY rewrite**

---

### Pillar 13: API & Webhooks

**File:** `prds/13-api-and-webhooks.md` (19 refs)

| Line | Category | Excerpt | Issue |
|------|----------|---------|-------|
| 115 | ddl-snippet | `CREATE TABLE webhooks` | webhooks table DDL |
| 131 | ddl-snippet | `CREATE TABLE webhook_deliveries` | webhook_deliveries table DDL |
| 150 | ddl-snippet | `CREATE TABLE rate_limit_buckets` | rate_limit_buckets table DDL |
| 161 | ddl-snippet | `CREATE TABLE connectors` | connectors table DDL |
| 179 | ddl-snippet | `CREATE TABLE connector_runs` | connector_runs table DDL |

**Issue Files in P13:**

| Issue File | Refs | Hottest Items |
|------------|------|---------------|
| 01-trpc-router-scaffold.md | 3 | tRPC router; permission schema; event rows |
| 04-public-api-hono-setup.md | 2 | API responses; webhook payload schema |

**Total P13 References:** 19 in PRD + ~5 in issues = **~24 total** → **HEAVY rewrite (5 new tables)**

---

### Pillar 14: CLI Codegen

**File:** `prds/14-cli-codegen.md` (6 refs)

| Line | Category | Excerpt | Issue |
|------|----------|---------|-------|
| 13 | schema-ts-mention | `src/keybindings/schema.ts` is single source of truth | Keybindings schema (Zod-based, not SQL) |
| 109 | schema-ts-mention | `src/keybindings/schema.ts` — Zod enum of all named actions | Keybindings registry definition |
| 187 | schema-ts-mention | `KB[keybindings/schema.ts\naction registry]` | Documentation reference |
| 406 | schema-ts-mention | `P14.33` src/keybindings/schema.ts exports KeybindingAction enum | Test reference |
| 440 | schema-ts-mention | `src/keybindings/schema.ts` imported by web, CLI, TUI | Single source verification |

**Issue Files in P14:**

| Issue File | Refs | Hottest Items |
|------------|------|---------------|
| 12-keybindings-registry.md | 2 | src/keybindings/schema.ts; Zod enum for actions |

**Total P14 References:** 6 in PRD + ~2 in issues = **~8 total** → **LIGHT rewrite (schema.ts is Zod-based, not SQL-related)**

---

### Pillar 15: TUI

**File:** `prds/15-tui.md` (7 refs)

| Line | Category | Excerpt | Issue |
|------|----------|---------|-------|
| 16 | schema-ts-mention | Keybindings schema from `src/keybindings/schema.ts` | Keybindings registry |
| 47 | schema-ts-mention | `src/keybindings/schema.ts` — Zod enum of semantic actions | Keybindings definition |
| 202 | schema-ts-mention | `KB[Keybindings registry\nsrc/keybindings/schema.ts]` | Reference diagram |
| 401 | schema-ts-mention | `T15-03` Keybindings registry (`src/keybindings/schema.ts` + `default-tui.ts`) | Test reference |
| 520 | schema-ts-mention | All actions in `schema.ts` reachable from keyboard | Keybindings validation |

**Issue Files in P15:**

| Issue File | Refs | Hottest Items |
|------------|------|---------------|
| 16-gated-i18n-embeddings.md | 2 | i18n locale in tenant_settings; embeddings feature flag |

**Total P15 References:** 7 in PRD + ~2 in issues = **~9 total** → **LIGHT rewrite**

---

### Pillar 16: Web Shell Rebuild

**File:** `prds/16-web-shell-rebuild.md` (9 refs)

| Line | Category | Excerpt | Issue |
|------|----------|---------|-------|
| 126 | schema-ts-mention | `src/keybindings/schema.ts` (Pillar 14) | Keybindings registry reference |
| 130 | schema-ts-mention | `src/keybindings/schema.ts` + `default-web.ts` bindings | Keybindings dispatcher |
| 304 | dml-snippet | `UPDATE tasks SET status='in_review'` | Runtime mutation example |
| 305 | dml-snippet | `INSERT INTO events (verb='status_changed')` | Event logging example |
| 325 | dml-snippet | `UPDATE documents SET tiptap_content=?` | Document update example |
| 562 | raw-query-string | tests: pick accent → CSS var updates; save → tenant_settings | Theme settings persistence |

**Issue Files in P16:**

| Issue File | Refs | Hottest Items |
|------------|------|---------------|
| 01-v0-teardown-and-sveltekit-scaffold.md | 2 | SvelteKit setup; data persistence via tRPC |
| 02-theme-keybindings-errorbound-featuregate.md | 1 | Keybindings dispatcher; feature gate wrapper |
| 10-project-settings-fields-statuses-views.md | 1 | Custom fields create/update/archive flow |
| 11-doc-tree-reader-editor-history.md | 1 | Doc history version timeline; autosave debounce |
| 12-memory-browser-and-context-preview.md | 1 | Context assembly tRPC call |
| 17-settings-theme-routing-skills-users.md | 3 | Theme updates via tRPC; routing rule tester |

**Total P16 References:** 9 in PRD + ~10 in issues = **~19 total** → **LIGHT-MEDIUM rewrite**

---

### Pillar 17: Cross-Cutting Platform

**File:** `prds/17-cross-cutting-platform.md` (16 refs)

| Line | Category | Excerpt | Issue |
|------|----------|---------|-------|
| 147 | ddl-snippet | `ALTER TABLE feature_flags` | feature_flags extension |
| 235 | ddl-snippet | `CREATE TABLE credentials` | credentials table DDL (vault) |
| 257 | ddl-snippet | `CREATE TABLE telemetry_events` | telemetry_events table DDL |
| 272 | ddl-snippet | `CREATE TABLE error_logs` | error_logs table DDL |
| 292 | ddl-snippet | `CREATE TABLE experiment_assignment` | experiment_assignment table DDL |

**Issue Files in P17:**

| Issue File | Refs | Hottest Items |
|------------|------|---------------|
| 04-theme-trpc-and-composable.md | 4 | Theme settings schema; tenant_settings updates; CSS var persistence |

**Total P17 References:** 16 in PRD + ~4 in issues = **~20 total** → **HEAVY rewrite (credentials vault, telemetry)**

---

## Cross-Cutting Docs

### DECISIONS.md
**7 references:**

| Line | Category | Excerpt | Issue |
|------|----------|---------|-------|
| 185 | ddl-snippet | `ALTER TABLE events ADD COLUMN org_id uuid REFERENCES orgs(id)` | Migration action |
| 186 | dml-snippet | `UPDATE events SET org_id = '00000000-0000-0000-0000-000000000001'` | Backfill action |
| 187 | ddl-snippet | `ALTER TABLE events ALTER COLUMN org_id SET NOT NULL` | Migration action |
| 313 | migration-file-name | `up_NNNN_<slug>.sql` + `down_NNNN_<slug>.sql` | Migration framework |

**Action:** Update DECISIONS.md migration architecture section to reference class-based migration system instead of `.sql` files.

---

### REQUIREMENTS.md
**5 references:**

| Line | Category | Excerpt | Issue |
|------|----------|---------|-------|
| 12 | raw-query-string | Composite `(org_id, sort_col)` indexes on every tenant-scoped table | Index design requirement |
| 43 | schema-ts-mention | Auto-codegen from tRPC schema; single source of truth | CLI design from tRPC |
| 196 | schema-ts-mention | src/keybindings/schema.ts single source; consumed by web/CLI/TUI | Keybindings architecture |

**Action:** Clarify requirements to specify class-based schema definitions and repository-driven queries.

---

### MASTER-PLAN.md
**9 references:**

| Line | Category | Excerpt | Issue |
|------|----------|---------|-------|
| 22 | raw-query-string | Composite `(org_id, sort_col)` indexes on every tenant-scoped table | Index architecture |
| 341 | schema-ts-mention | `src/keybindings/schema.ts` Zod enum | Keybindings registry ownership |
| 419 | migration-file-name | Migration downgrade strategy (`down_XXXX.sql`) — captured for follow-up | Migration system note |

**Action:** Update migration notes to reflect class-based reversible migrations, not .sql files.

---

### COVERAGE.md
**9 references:**

| Line | Category | Excerpt | Issue |
|------|----------|---------|-------|
| 81–82 | schema-ts-mention | `src/keybindings/schema.ts` mentioned in P14/P15 coverage | Keybindings cross-pillar |
| 95 | schema-ts-mention | Single `src/keybindings/schema.ts` Zod enum | Keyboard registry single source |

**Action:** Coverage verification OK; keybindings schema is Zod-based, not SQL-related.

---

### OPEN-QUESTIONS.md
**4 references:**

| Line | Category | Excerpt | Issue |
|------|----------|---------|-------|
| 51 | raw-query-string | Mastra's `branch()` step selects agent | Agent selection concern |
| 260 | migration-file-name | Migration script backlog + schema changes | org_id backfill question |

**Action:** Update migration Q&A to reflect class-based approach.

---

### EXTRA-GAPS.md
**6 references:**

| Line | Category | Excerpt | Issue |
|------|----------|---------|-------|
| 46 | sql-extension | `src/product-kernel/db/migrations/*.sql` | Existing .sql files outside scratch tree |
| 49 | migration-file-name | 0001–0003 migrations; no downgrade logic | Downgrade gap |
| 55 | migration-file-name | `down_0XXX.sql` reversal mandate | Downgrade architecture |
| 63 | sql-extension | `src/product-kernel/db/migrations/0001_product_kernel.sql` | Reference to existing migration file |
| 327 | raw-query-string | Hardcoded UUID backfill | Org ID seeding pattern |
| 488 | migration-file-name | `down_*.sql` reversal absent | Downgrade strategy gap |

**Action:** Update to reference class-based reversible migrations; verify existing .sql files in main repo also migrate.

---

### INVENTORY.md
**3 references:**

| Line | Category | Excerpt | Issue |
|------|----------|---------|-------|
| 73 | migration-file-name | 3 migration files (0001, 0002, 0003) | Current migration inventory |
| 118 | schema-ts-mention | boards.schema.ts, documents.schema.test.ts | Schema test references |

**Action:** Inventory update required after migration rewrite.

---

## Research Docs

### research/03-orchestration-memory-skills.md
**17 references:**

| Line | Category | Excerpt | Issue |
|------|----------|---------|-------|
| 276 | schema-ts-mention | `src/memory/schema.ts` — PGlite migration for memories | Memory schema definition |

**Action:** Update memory schema to use class-based migrations with pgvector extension declaratively.

---

### research/04-multi-user-saas.md
**1 reference:**

| Line | Category | Excerpt | Issue |
|------|----------|---------|-------|
| 193 | dml-snippet | `INSERT INTO organizations VALUES (...)` | Default org seeding |

**Action:** Rewrite as class-based seeder.

---

## Summary Table: Rewrite Scope by File Category

| File Category | Total Refs | Files Affected | Scope |
|---------------|-----------|----------------|-------|
| PRDs (17 files) | 281 | 17 | Schema definitions, table specs, query examples |
| Pillar Issues (17×N files) | 116 | 80+ | Migration implementation, schema validation, table ownership |
| Cross-Cutting Docs (8 files) | 40 | 8 | Architecture decisions, migration framework, doctor checks |
| **Total** | **437** | **119** | Complete rewrite of migration/schema/query patterns |

---

## Rewrite Implementation Strategy

### Phase 1: Foundation (P1 + P17 Base)
**Effort:** 3–4 weeks  
**Scope:** Build class-based migration framework + core tables  
**Deliverables:**
1. Migration runner class + versioning framework
2. NestJS entities for auth, orgs, users, feature_flags, credentials
3. Repository classes for entity access (no raw SQL)
4. Seed system for default org + admin user
5. Doctor checks converted to repository queries

**Files to Rewrite:**
- P1 PRD + all P1 issues
- P17 PRD (credentials, telemetry tables)
- DECISIONS.md, MASTER-PLAN.md migration sections

### Phase 2: Schema-Heavy Pillars (P2, P8, P11, P12, P13)
**Effort:** 3–4 weeks  
**Scope:** pgvector embeddings, full-text search, notification schema, webhooks  
**Deliverables:**
1. pgvector extension declarative setup (not raw SQL)
2. Tsvector indexes via entity decorators
3. Notification schema entities + repositories
4. Webhook schema entities + graph engine (JSON rules)
5. Inference cache (SQLite class schema via Rust)

**Files to Rewrite:**
- P2, P8, P11, P12, P13 PRDs + issues
- research/03-orchestration-memory-skills.md

### Phase 3: Medium Pillars (P3–P7, P9–P10)
**Effort:** 2–3 weeks  
**Scope:** Symphony orchestration, docs, repos, artifacts  
**Deliverables:**
1. Workflow + agent_runs symphony columns (partial indexes via decorator syntax)
2. Docs schema entities (doc, doc_versions, doc_links, doc_comments)
3. Repos schema extensions + connectors
4. Artifacts schema + retention jobs

**Files to Rewrite:**
- P3–P7, P9–P10 PRDs + issues

### Phase 4: Light Pillars (P5, P14, P15, P16)
**Effort:** 1 week  
**Scope:** Routing/skills, CLI, TUI (mostly non-SQL)  
**Deliverables:**
1. routing_rules + fulcrum_skills entities
2. Keybindings schema (Zod) — no change, verify not SQL
3. TUI schema references — no change
4. Web settings schema (theme vars, user overrides in tenant_settings) — repository-driven

**Files to Rewrite:**
- P5, P14, P15, P16 PRDs + issues (light updates)

---

## Files Requiring NO Changes (Clean)

The following files contain **zero SQL-related references** and require no rewrite:

- RESUME.md
- VISION-GAPS.md
- 15-tui/issues/{07,08,09,11,13,17,18,19}.md (8 TUI feature files — keyboard-first, no schema)
- 12-notifications-activity-audit/issues/{03,04,07,11,14,18}.md (6 notification UI files — no schema)
- 11-search-and-discovery/issues/{02,03,04,05,07,08,09,10,11,12,13,15,16,17,18}.md (15 search UI files)
- Various non-schema-related issue files across P13–P16 (UI/API specifics)

**Total clean files:** 100+ files (no rewrite needed)

---

## Detailed Rewrite Checklist

### For Each PRD Rewrite:
- [ ] Replace migration file name references (0004_auth.sql) with class-based system references
- [ ] Replace CREATE TABLE snippets with NestJS entity definitions (@Entity, @Column)
- [ ] Replace ALTER TABLE snippets with property extension patterns
- [ ] Replace raw SELECT/INSERT/UPDATE examples with repository method calls
- [ ] Replace drizzle references with TypeORM/MikroORM repository pattern
- [ ] Update DECISIONS.md with class-based migration architecture
- [ ] Update doctor checks to use repository queries (no raw SQL)
- [ ] Verify pgvector, tsvector, special types are class-decorated

### For Each Issue Rewrite:
- [ ] Replace Drizzle migration directive with class-based implementation spec
- [ ] Replace table schema DDL with entity class definition
- [ ] Replace index specs with @Index() decorators
- [ ] Replace constraint specs with entity validators or database constraints via migrations
- [ ] Update test patterns: replace `information_schema` queries with ORM introspection

### Cross-Cutting Changes:
- [ ] DECISIONS.md: A3 (migration downgrade) — class-based reversible migrations
- [ ] MASTER-PLAN.md: migration architecture section
- [ ] COVERAGE.md: no changes (keybindings schema.ts is Zod, not SQL)
- [ ] REQUIREMENTS.md: C2 (SaaS schema) — clarify class-driven
- [ ] OPEN-QUESTIONS.md: Q25 (org_id backfill) — class migration approach

---

## Effort Estimation Summary

| Pillar | Estimate | Notes |
|--------|----------|-------|
| P1 Foundation | 1 week | Core migrations, auth schema, org/user entities |
| P2 Inference | 1 week | pgvector extensions, embedding entities |
| P3 Symphony | 4 days | workflow_definitions, agent_runs extensions |
| P4 Sandcastle | 4 days | artifacts, edges, agent_profiles entities |
| P5 Router | 2 days | routing_rules, fulcrum_skills entities |
| P6 Tasks | 3 days | sprints, custom_field_defs, saved_views entities |
| P7 Docs | 4 days | doc schema (5 entities), tsvector FTS |
| P8 Memory | 4 days | pgvector embeddings, memory entities |
| P9 Repos | 4 days | repo schema extensions, connector tables |
| P10 Artifacts | 2 days | artifact retention schema |
| P11 Search | 4 days | search_documents, tsvector FTS, hybrid search |
| P12 Notifications | 5 days | 8 notification entities, audit retention |
| P13 API/Webhooks | 5 days | webhook schema, rate limiting, connectors |
| P14 CLI | 1 day | keybindings.schema.ts (no SQL change) |
| P15 TUI | 1 day | keybindings schema references (no SQL change) |
| P16 Web | 2 days | settings schema, CSS var persistence |
| P17 Platform | 5 days | credentials vault, telemetry, error logs, experiments |
| **Docs & Cross-Cut** | **3 days** | DECISIONS, MASTER-PLAN, REQUIREMENTS updates |
| **Total** | **~9 weeks** | 45 PRD/issue files; 437 SQL refs eliminated |

---

## Sign-Off

**Manifest Compiled:** May 1, 2026  
**Auditor:** Read-only sweep agent  
**Constraint Status:** Hard — NO plaintext SQL. NestJS-style decorators + DI.  
**Next Action:** Execute Phase 1 (Foundation) migrations framework rewrite per implementation strategy.

