# Fulcrum Agent-OS Full Closure Bundles

> Generated from every `.scratch/agent-os-vision/*/issues/*.md` file. This is the closure scheduler; `TASK-DAG.md` is the policy layer.

## Summary

- Generated: 2026-05-02T18:38:58.934Z
- Issues: 341
- Bundles: 154
- Issue statuses: completed=27, implemented=17, in-progress=4, integration-review=15, ready-for-agent=278
- Bundle statuses: completed=3, implemented=14, in-progress=4, integration-review=8, mixed=11, ready-for-agent=114
- Active protected gate: yes

## Dispatch Rule

Dispatch bundles, not isolated issues, when the bundle has multiple tightly related issues and one owner can keep context cheaply. Split a bundle only when its `write_set` can be partitioned without touching the same protected surface.

## Safe To Dispatch Now

- B068 08-memory-context-engine docs - risk=low, surfaces=docs+memory
- B072 08-memory-context-engine memory 2 - risk=low, surfaces=memory

## Active Or Unclosed Gates

### B007 01-foundation-reset schema-contract 1

- Status: integration-review
- Risk: high
- Surfaces: auth, schema
- Depends on bundles: None
- Frozen by active gate: yes
- Owner model: single integration owner; helper agents read-only/tests-only
- Issues:
  - 01-foundation-reset/issues/01-schema-auth-migration.md - integration-review - Auth migration class — User, Session, Invitation, OrgMember, FeatureFlag entities
  - 01-foundation-reset/issues/02-events-org-id-backfill.md - integration-review - Events org_id backfill migration class — NOT NULL + default-org backfill
  - 01-foundation-reset/issues/03-composite-indexes-and-flag-stub-tables.md - integration-review - Composite (org, …) index decorators + flag-stub entities (two migration classes)

### B043 05-router-and-skills schema-contract

- Status: implemented
- Risk: high
- Surfaces: api, cli, schema, web
- Depends on bundles: None
- Frozen by active gate: yes
- Owner model: single integration owner; helper agents read-only/tests-only
- Issues:
  - 05-router-and-skills/issues/01-routing-rules-schema-migration.md - implemented - Routing rules entity + migration class + composite indexes
  - 05-router-and-skills/issues/02-fulcrum-skills-schema-migration.md - completed - FulcrumSkill entity + migration class + skills.lock.json design
  - 05-router-and-skills/issues/21-marketplace-schema-and-client.md - ready-for-agent - Skill marketplace schema + Ed25519 client (FULCRUM_FEATURES=skill-marketplace)

### B049 06-tasks-and-scrum schema-contract 1

- Status: implemented
- Risk: high
- Surfaces: schema, tasks
- Depends on bundles: None
- Frozen by active gate: yes
- Owner model: single integration owner; helper agents read-only/tests-only
- Issues:
  - 06-tasks-and-scrum/issues/01-tasks-schema-extension.md - implemented - Tasks table schema extension + composite indexes
  - 06-tasks-and-scrum/issues/02-sprints-schema.md - implemented - Sprints schema + at-most-one-active constraint
  - 06-tasks-and-scrum/issues/03-custom-field-defs-schema.md - ready-for-agent - Custom field defs schema + types + defaults seeder

### B061 07-docs-editor-collab schema-contract 1

- Status: in-progress
- Risk: high
- Surfaces: docs, schema
- Depends on bundles: None
- Frozen by active gate: yes
- Owner model: single integration owner; helper agents read-only/tests-only
- Issues:
  - 07-docs-editor-collab/issues/01-docs-schema-foundation.md - implemented - Docs schema foundation — ALTER TABLE docs + doc_links + doc_versions + doc_comments + doc_templates
  - 07-docs-editor-collab/issues/03-frontmatter-schemas.md - completed - Frontmatter Zod schemas — all 9 doc_types + round-trip validation
  - 07-docs-editor-collab/issues/04-doc-template-seeds.md - in-progress - Doc templates seed migration — 9 org-default templates + project-override precedence

### B075 08-memory-context-engine schema-contract

- Status: implemented
- Risk: high
- Surfaces: inference, memory, schema
- Depends on bundles: None
- Frozen by active gate: yes
- Owner model: single integration owner; helper agents read-only/tests-only
- Issues:
  - 08-memory-context-engine/issues/01-schema-migration-core.md - implemented - schema migration core
  - 08-memory-context-engine/issues/02-schema-migration-gated-embeddings.md - ready-for-agent - schema migration gated embeddings

### B124 cli-codegen cli-surface 1

- Status: implemented
- Risk: medium
- Surfaces: cli
- Depends on bundles: None
- Frozen by active gate: yes
- Owner model: single implementer preferred; split only by disjoint write_set
- Issues:
  - 14-cli-codegen/issues/01-codegen-scaffold.md - implemented - codegen scaffold
  - 14-cli-codegen/issues/02-json-flag-and-watch-generation.md - ready-for-agent - json flag and watch generation
  - 14-cli-codegen/issues/03-completion-scripts.md - ready-for-agent - completion scripts

### B149 tui tui-surface 1

- Status: in-progress
- Risk: medium
- Surfaces: platform, tui, web
- Depends on bundles: None
- Frozen by active gate: yes
- Owner model: single implementer preferred; split only by disjoint write_set
- Issues:
  - 15-tui/issues/01-tui-foundation-launcher.md - in-progress - tui foundation launcher
  - 15-tui/issues/02-global-widgets.md - ready-for-agent - global widgets
  - 15-tui/issues/03-theme-engine.md - ready-for-agent - theme engine

### B009 01-foundation-reset schema-contract 3

- Status: integration-review
- Risk: high
- Surfaces: schema
- Depends on bundles: B007
- Frozen by active gate: yes
- Owner model: single integration owner; helper agents read-only/tests-only
- Issues:
  - 01-foundation-reset/issues/19-migration-up-down-versioning.md - integration-review - Migration up/down + schema-version tracking (MikroORM migrator wrapper)

### B036 05-router-and-skills api-contract 1

- Status: implemented
- Risk: medium
- Surfaces: api, orchestration, platform, web
- Depends on bundles: B043
- Frozen by active gate: yes
- Owner model: single implementer preferred; split only by disjoint write_set
- Issues:
  - 05-router-and-skills/issues/03-rules-engine-wrapper.md - completed - json-rules-engine wrapper + rule evaluation core
  - 05-router-and-skills/issues/04-auto-assign-tier1-tier2.md - completed - auto-assign.ts — Tier 1 explicit override + Tier 2 rules evaluation
  - 05-router-and-skills/issues/05-routing-telemetry.md - implemented - Routing telemetry — events row per dispatch decision

### B050 06-tasks-and-scrum schema-contract 2

- Status: implemented
- Risk: high
- Surfaces: schema, tasks
- Depends on bundles: B049
- Frozen by active gate: yes
- Owner model: single integration owner; helper agents read-only/tests-only
- Issues:
  - 06-tasks-and-scrum/issues/04-saved-views-schema.md - implemented - Saved views schema + filter AST type
  - 06-tasks-and-scrum/issues/05-metrics-cache-schema.md - ready-for-agent - Metrics cache schema + graphile-worker rollup job
  - 06-tasks-and-scrum/issues/06-connector-framework-schema.md - ready-for-agent - Connector framework scaffolding + connector_sync_log schema

### B071 08-memory-context-engine memory 1

- Status: implemented
- Risk: high
- Surfaces: memory, platform
- Depends on bundles: B075
- Frozen by active gate: no
- Owner model: single integration owner; helper agents read-only/tests-only
- Issues:
  - 08-memory-context-engine/issues/03-heuristic-extractor-core.md - implemented - heuristic extractor core
  - 08-memory-context-engine/issues/04-heuristic-extraction-hook-agent-run.md - ready-for-agent - heuristic extraction hook agent run
  - 08-memory-context-engine/issues/06-retriever-bm25-recency-importance.md - ready-for-agent - retriever bm25 recency importance

### B039 05-router-and-skills api-contract 4

- Status: implemented
- Risk: high
- Surfaces: api, inference, web
- Depends on bundles: B036, B043
- Frozen by active gate: yes
- Owner model: single integration owner; helper agents read-only/tests-only
- Issues:
  - 05-router-and-skills/issues/12-llm-fallback-tier3-gated.md - ready-for-agent - LLM fallback Tier 3 (FULCRUM_FEATURES=router-llm) + backend selection
  - 05-router-and-skills/issues/13-skills-loader-per-agent-install.md - completed - Skills loader — per-agent directory install + hash verification
  - 05-router-and-skills/issues/14-skills-upstream-sync.md - implemented - Skills upstream sync — fetch, auto-merge clean, conflict to lock file

### B038 05-router-and-skills api-contract 3

- Status: implemented
- Risk: medium
- Surfaces: api, docs, repos, tui, web
- Depends on bundles: B036, B037
- Frozen by active gate: yes
- Owner model: single implementer preferred; split only by disjoint write_set
- Issues:
  - 05-router-and-skills/issues/09-web-routing-settings-page.md - ready-for-agent - Web /settings/routing + /projects/<id>/routing pages
  - 05-router-and-skills/issues/10-tui-routing-rules-screen.md - ready-for-agent - TUI routing rules editor screen
  - 05-router-and-skills/issues/11-pglite-listen-hot-reload.md - implemented - Repository hot-reload for routing rules

### B127 cli-codegen cli-surface 4

- Status: implemented
- Risk: medium
- Surfaces: cli, docs, platform
- Depends on bundles: B123, B124, B125, B126
- Frozen by active gate: yes
- Owner model: single implementer preferred; split only by disjoint write_set
- Issues:
  - 14-cli-codegen/issues/11-doctor-orchestrator.md - ready-for-agent - doctor orchestrator
  - 14-cli-codegen/issues/12-keybindings-registry.md - implemented - keybindings registry
  - 14-cli-codegen/issues/13-performance-and-parity-gate.md - ready-for-agent - performance and parity gate

### B001 01-foundation-reset auth-permissions 1

- Status: integration-review
- Risk: high
- Surfaces: api, auth, memory, permissions, web
- Depends on bundles: B008
- Frozen by active gate: yes
- Owner model: single integration owner; helper agents read-only/tests-only
- Issues:
  - 01-foundation-reset/issues/05-better-auth-integration.md - integration-review - Better-Auth v1 integration — MikroORM-backed adapter, org plugin, passkey plugin, SvelteKit handler
  - 01-foundation-reset/issues/06-trpc-core-router-and-permission-middleware.md - completed - tRPC v11 core router + context + assertPermission middleware
  - 01-foundation-reset/issues/09-auth-trpc-procedures-and-org-management.md - completed - Auth + org tRPC procedures — whoami, invite, acceptInvite, org member management

### B002 01-foundation-reset auth-permissions 2

- Status: integration-review
- Risk: high
- Surfaces: auth, cli, web
- Depends on bundles: B001, B005
- Frozen by active gate: yes
- Owner model: single integration owner; helper agents read-only/tests-only
- Issues:
  - 01-foundation-reset/issues/10-cli-auth-and-flags-verbs.md - integration-review - CLI auth + flags verbs — `fulcrum auth *` and `fulcrum flags *`
  - 01-foundation-reset/issues/11-web-login-signup-logout-pages.md - integration-review - Web login, signup, and logout pages
  - 01-foundation-reset/issues/12-web-invitation-accept-and-user-management-ui.md - integration-review - Web invitation-accept page + admin user-management UI

### B003 01-foundation-reset auth-permissions 3

- Status: integration-review
- Risk: high
- Surfaces: auth, inference, notifications, tui, web
- Depends on bundles: B002, B008
- Frozen by active gate: yes
- Owner model: single integration owner; helper agents read-only/tests-only
- Issues:
  - 01-foundation-reset/issues/13-passkey-enrollment-and-login-flow.md - completed - Passkey enrollment + passkey login flow (WebAuthn via Better-Auth passkey plugin)
  - 01-foundation-reset/issues/14-saas-auth-gated-oauth-and-email-otp.md - integration-review - `saas-auth` flag — OAuth providers, magic-link, email OTP (shipped + gated)
  - 01-foundation-reset/issues/15-tui-base-shell-and-auth-flags-screens.md - integration-review - OpenTUI base shell + auth screen + feature-flags screen

### B004 01-foundation-reset auth-permissions 4

- Status: integration-review
- Risk: high
- Surfaces: permissions
- Depends on bundles: B001, B007
- Frozen by active gate: yes
- Owner model: single integration owner; helper agents read-only/tests-only
- Issues:
  - 01-foundation-reset/issues/16-casbin-policies-gated-flag.md - integration-review - `casbin-policies` flag — node-casbin in-process ABAC integration via FulcrumCasbinAdapter (shipped + gated)

### B006 01-foundation-reset quality-gate

- Status: integration-review
- Risk: low
- Surfaces: general
- Depends on bundles: B003, B004, B008
- Frozen by active gate: no
- Owner model: single implementer preferred; split only by disjoint write_set
- Issues:
  - 01-foundation-reset/issues/18-test-infrastructure-baseline-and-ci.md - integration-review - Test infrastructure baseline — Vitest + Bun test + Playwright + `bun run ci` gate

### B008 01-foundation-reset schema-contract 2

- Status: integration-review
- Risk: high
- Surfaces: api, schema, web
- Depends on bundles: B001, B007
- Frozen by active gate: yes
- Owner model: single integration owner; helper agents read-only/tests-only
- Issues:
  - 01-foundation-reset/issues/04-local-org-seed-and-init.md - integration-review - Synthetic local-org seed + `fulcrum init` bootstrap
  - 01-foundation-reset/issues/07-feature-flag-registry.md - integration-review - Feature-flag registry — env-var + entity-backed override + tRPC procedures
  - 01-foundation-reset/issues/17-zod-schemas-and-trpc-domain-stubs.md - integration-review - Zod schema folder + tRPC domain stub routers for all subsequent pillars

### B010 02-inference-sidecar api-contract 1

- Status: mixed
- Risk: medium
- Surfaces: api, cli, inference, tui, web
- Depends on bundles: B012, B013
- Frozen by active gate: yes
- Owner model: single implementer preferred; split only by disjoint write_set
- Issues:
  - 02-inference-sidecar/issues/04-trpc-procedures-and-health-surface.md - completed - tRPC `inference.*` procedures + `health()` three-surface parity
  - 02-inference-sidecar/issues/09-classify-and-tokenize.md - ready-for-agent - `classify()` + `tokenize()` operations — CLI + tRPC + web debug panel
  - 02-inference-sidecar/issues/11-per-feature-backend-routing-config.md - ready-for-agent - Per-feature backend routing config — web settings + CLI + tRPC

### B012 02-inference-sidecar cli-surface

- Status: implemented
- Risk: medium
- Surfaces: cli, inference, orchestration, tui, web
- Depends on bundles: B010, B013, B014, B015
- Frozen by active gate: yes
- Owner model: single implementer preferred; split only by disjoint write_set
- Issues:
  - 02-inference-sidecar/issues/02-ts-client-and-lifecycle.md - completed - TS client + auto-spawn lifecycle + `fulcrum inference start|status|stop`
  - 02-inference-sidecar/issues/05-embed-operation.md - implemented - `embed()` operation — fastembed-rs crate + cache + CLI + web test page
  - 02-inference-sidecar/issues/07-generate-operation.md - ready-for-agent - `generate()` operation — candle crate + gen cache + CLI + web debug panel

### B013 02-inference-sidecar inference

- Status: implemented
- Risk: medium
- Surfaces: inference
- Depends on bundles: B010, B015
- Frozen by active gate: no
- Owner model: single implementer preferred; split only by disjoint write_set
- Issues:
  - 02-inference-sidecar/issues/06-models-registry-pull-list-rm.md - implemented - Models registry — `fulcrum inference models pull|list|rm` + auto-download on first use
  - 02-inference-sidecar/issues/10-ts-backend-abstraction.md - ready-for-agent - TS backend abstraction — embedded / ollama / lm-studio / openai-compatible

### B015 02-inference-sidecar schema-contract

- Status: mixed
- Risk: high
- Surfaces: inference, schema
- Depends on bundles: B012, B014
- Frozen by active gate: yes
- Owner model: single integration owner; helper agents read-only/tests-only
- Issues:
  - 02-inference-sidecar/issues/03-inference-cache-schema.md - completed - Inference cache entities + migration class + PGlite embedding properties
  - 02-inference-sidecar/issues/08-structured-output.md - ready-for-agent - Structured output — grammar-constrained generation via JSON Schema

### B019 03-symphony-orchestration orchestration

- Status: mixed
- Risk: high
- Surfaces: orchestration, platform
- Depends on bundles: B022, B024
- Frozen by active gate: no
- Owner model: single integration owner; helper agents read-only/tests-only
- Issues:
  - 03-symphony-orchestration/issues/04-tracker-fetch-candidate-issues.md - completed - Tracker adapter: fetchCandidateIssues
  - 03-symphony-orchestration/issues/05-tracker-fetch-by-states.md - completed - Tracker adapter: fetchIssuesByStates + fetchIssueStatesByIds
  - 03-symphony-orchestration/issues/12-otel-telemetry.md - ready-for-agent - OTel spans on every state transition + no-op when exporter unset

### B020 03-symphony-orchestration quality-gate

- Status: mixed
- Risk: medium
- Surfaces: docs, orchestration, repos
- Depends on bundles: B026
- Frozen by active gate: no
- Owner model: single implementer preferred; split only by disjoint write_set
- Issues:
  - 03-symphony-orchestration/issues/01-submodule-spec-pin.md - completed - Vendor openai/symphony as git submodule + conformance doc skeleton
  - 03-symphony-orchestration/issues/15-conformance-trace-doc-hash-gate.md - ready-for-agent - Conformance trace doc + hash gate: gen-conformance-trace.ts + pre-commit hook

### B021 03-symphony-orchestration runtime-loop 1

- Status: implemented
- Risk: medium
- Surfaces: orchestration
- Depends on bundles: B019, B024, B026
- Frozen by active gate: no
- Owner model: single implementer preferred; split only by disjoint write_set
- Issues:
  - 03-symphony-orchestration/issues/06-state-machine-claim-lock.md - implemented - State machine: Unclaimed → Claimed with optimistic lock + events row
  - 03-symphony-orchestration/issues/07-workspace-management.md - completed - Workspace management: create-on-claim, sanitize key, destroy-on-release
  - 03-symphony-orchestration/issues/09-lifecycle-hooks.md - implemented - Lifecycle hooks: before_run / after_run / on_failure / on_cancel with per-hook timeout

### B022 03-symphony-orchestration runtime-loop 2

- Status: in-progress
- Risk: medium
- Surfaces: orchestration
- Depends on bundles: B019, B021, B024, B026
- Frozen by active gate: no
- Owner model: single implementer preferred; split only by disjoint write_set
- Issues:
  - 03-symphony-orchestration/issues/10-retry-backoff-stall-detection.md - in-progress - Retry/backoff formula + stall detection engine
  - 03-symphony-orchestration/issues/11-dispatch-loop-happy-path.md - ready-for-agent - Dispatch loop: Unclaimed → Running → Released happy-path + OTel spans
  - 03-symphony-orchestration/issues/13-graphile-worker-poll-registration.md - ready-for-agent - graphile-worker poll loop registration + stall scanner wiring

### B026 03-symphony-orchestration web-surface

- Status: mixed
- Risk: medium
- Surfaces: docs, orchestration, web
- Depends on bundles: B017, B019, B022, B024
- Frozen by active gate: yes
- Owner model: single implementer preferred; split only by disjoint write_set
- Issues:
  - 03-symphony-orchestration/issues/08-prompt-template-renderer.md - completed - Prompt template renderer: liquidjs strict mode + WORKFLOW.md loader
  - 03-symphony-orchestration/issues/14-conformance-test-suite.md - ready-for-agent - Conformance test suite: one test per REQUIRED SPEC.md item, zero todo
  - 03-symphony-orchestration/issues/18-web-runs-board.md - ready-for-agent - Web: /orchestration dashboard + /projects/[id]/runs board + workflow editor

### B032 04-sandcastle-wrapper runtime

- Status: mixed
- Risk: medium
- Surfaces: platform, runtime
- Depends on bundles: B033, B034
- Frozen by active gate: no
- Owner model: single implementer preferred; split only by disjoint write_set
- Issues:
  - 04-sandcastle-wrapper/issues/01-sandcastle-dep-effect-singleton.md - completed - Sandcastle dep install + Effect singleton enforcement
  - 04-sandcastle-wrapper/issues/05-agent-profile-type-registry.md - ready-for-agent - AgentProfile type + registry with UnknownAgentError
  - 04-sandcastle-wrapper/issues/10-iteration-loop-hard-cap.md - ready-for-agent - Iteration loop + hard cap enforcement

### B034 04-sandcastle-wrapper schema-contract

- Status: mixed
- Risk: high
- Surfaces: runtime, schema
- Depends on bundles: B032
- Frozen by active gate: yes
- Owner model: single integration owner; helper agents read-only/tests-only
- Issues:
  - 04-sandcastle-wrapper/issues/02-agent-runs-schema-migration.md - completed - agent_runs schema migration — Sandcastle columns
  - 04-sandcastle-wrapper/issues/03-artifacts-edges-migration.md - completed - artifacts + edges tables migration
  - 04-sandcastle-wrapper/issues/04-agent-profiles-migration.md - ready-for-agent - agent_profiles table migration + test-result persistence

### B064 07-docs-editor-collab web-surface 1

- Status: mixed
- Risk: high
- Surfaces: docs, web
- Depends on bundles: B061, B062
- Frozen by active gate: yes
- Owner model: single integration owner; helper agents read-only/tests-only
- Issues:
  - 07-docs-editor-collab/issues/02-tiptap-svelte-binding-spike.md - completed - TipTap v2 + svelte-tiptap baseline spike — Svelte 5 runes compat gate
  - 07-docs-editor-collab/issues/13-frontmatter-form-yaml-ui.md - ready-for-agent - Frontmatter form UI + raw YAML toggle — Zod-driven per doc_type
  - 07-docs-editor-collab/issues/14-doc-tree-crud-ui.md - ready-for-agent - Doc tree CRUD — DocTree.svelte + DnD reorder + breadcrumbs + scope toggle (per-project/global)

### B082 09-repos-git-supervision repos

- Status: mixed
- Risk: low
- Surfaces: repos
- Depends on bundles: B078, B079, B084, B085, B086
- Frozen by active gate: no
- Owner model: single implementer preferred; split only by disjoint write_set
- Issues:
  - 09-repos-git-supervision/issues/02-repo-repository-crud.md - ready-for-agent - repo repository crud
  - 09-repos-git-supervision/issues/03-simple-git-wrapper.md - completed - simple git wrapper
  - 09-repos-git-supervision/issues/17-repo-write-ops-gate.md - ready-for-agent - repo write ops gate

### B098 17-cross-cutting-platform api-contract 1

- Status: in-progress
- Risk: high
- Surfaces: api, cli, platform, runtime, tui, web
- Depends on bundles: B007, B106
- Frozen by active gate: yes
- Owner model: single integration owner; helper agents read-only/tests-only
- Issues:
  - 17-cross-cutting-platform/issues/02-secrets-keyring-and-vault.md - in-progress - Secret management — keyring.ts OS abstraction + vault.ts nacl.secretbox + credentials.* tRPC
  - 17-cross-cutting-platform/issues/03-backup-restore-trpc.md - ready-for-agent - Local backup + restore — runner.ts, tRPC procedures, CLI integration
  - 17-cross-cutting-platform/issues/04-theme-trpc-and-composable.md - ready-for-agent - Theme engine — generator.ts, useTheme() composable, theme.* tRPC, CLI + TUI integration

### B104 17-cross-cutting-platform quality-gate

- Status: mixed
- Risk: medium
- Surfaces: docs, notifications, platform
- Depends on bundles: B006, B098, B099
- Frozen by active gate: no
- Owner model: single implementer preferred; split only by disjoint write_set
- Issues:
  - 17-cross-cutting-platform/issues/11-doctor-checks.md - ready-for-agent - Doctor checks — all 11 platform.* checks implemented
  - 17-cross-cutting-platform/issues/12-governance-files.md - ready-for-agent - Governance files — GOVERNANCE.md, SECURITY.md, CODE_OF_CONDUCT.md, VERSIONING.md
  - 17-cross-cutting-platform/issues/23-license-deps-audit.md - completed - License-deps audit + CI gate

### B106 17-cross-cutting-platform schema-contract

- Status: mixed
- Risk: high
- Surfaces: api, notifications, platform, repos, schema
- Depends on bundles: B007, B098, B099, B100
- Frozen by active gate: yes
- Owner model: single integration owner; helper agents read-only/tests-only
- Issues:
  - 17-cross-cutting-platform/issues/01-schema-migration-credentials-telemetry-errors-experiments.md - completed - Migration class — Credential, TelemetryEvent, ErrorLog, ExperimentAssignment, FeatureFlagRollout
  - 17-cross-cutting-platform/issues/17-gated-error-reporting-remote.md - ready-for-agent - GATED: error-reporting-remote — crash POST on new ErrorLog entity, path scrubbing, HMAC
  - 17-cross-cutting-platform/issues/22-observability-events-and-performance-budgets.md - ready-for-agent - Observability — events emit from all tRPC procedures, performance budgets, audit event schemas

### B109 api-and-webhooks api-contract 1

- Status: implemented
- Risk: high
- Surfaces: api, web
- Depends on bundles: B114
- Frozen by active gate: yes
- Owner model: single integration owner; helper agents read-only/tests-only
- Issues:
  - 13-api-and-webhooks/issues/01-trpc-router-scaffold.md - implemented - trpc router scaffold
  - 13-api-and-webhooks/issues/02-websocket-subscriptions.md - ready-for-agent - websocket subscriptions
  - 13-api-and-webhooks/issues/04-public-api-hono-setup.md - ready-for-agent - public api hono setup

## Bundle Index

| Bundle | Phase | Status | Risk | Frozen | Surfaces | Deps | Issues | Owner model |
| --- | ---: | --- | --- | --- | --- | --- | --- | --- |
| B007 01-foundation-reset schema-contract 1 | 0 | integration-review | high | yes | auth+schema | - | 3 | single integration owner; helper agents read-only/tests-only |
| B014 02-inference-sidecar quality-gate | 0 | completed | medium | no | inference+orchestration | - | 1 | single implementer preferred; split only by disjoint write_set |
| B024 03-symphony-orchestration schema-contract | 0 | completed | high | yes | orchestration+schema+tasks | - | 2 | single integration owner; helper agents read-only/tests-only |
| B043 05-router-and-skills schema-contract | 0 | implemented | high | yes | api+cli+schema+web | - | 3 | single integration owner; helper agents read-only/tests-only |
| B049 06-tasks-and-scrum schema-contract 1 | 0 | implemented | high | yes | schema+tasks | - | 3 | single integration owner; helper agents read-only/tests-only |
| B061 07-docs-editor-collab schema-contract 1 | 0 | in-progress | high | yes | docs+schema | - | 3 | single integration owner; helper agents read-only/tests-only |
| B075 08-memory-context-engine schema-contract | 0 | implemented | high | yes | inference+memory+schema | - | 2 | single integration owner; helper agents read-only/tests-only |
| B084 09-repos-git-supervision schema-contract | 0 | ready-for-agent | high | yes | repos+schema | - | 1 | single integration owner; helper agents read-only/tests-only |
| B124 cli-codegen cli-surface 1 | 0 | implemented | medium | yes | cli | - | 3 | single implementer preferred; split only by disjoint write_set |
| B144 search-and-discovery schema-contract 1 | 0 | ready-for-agent | high | yes | cli+docs+memory+schema+search+tasks | - | 3 | single integration owner; helper agents read-only/tests-only |
| B149 tui tui-surface 1 | 0 | in-progress | medium | yes | platform+tui+web | - | 3 | single implementer preferred; split only by disjoint write_set |
| B009 01-foundation-reset schema-contract 3 | 1 | integration-review | high | yes | schema | B007 | 1 | single integration owner; helper agents read-only/tests-only |
| B036 05-router-and-skills api-contract 1 | 1 | implemented | medium | yes | api+orchestration+platform+web | B043 | 3 | single implementer preferred; split only by disjoint write_set |
| B044 06-tasks-and-scrum api-contract 1 | 1 | ready-for-agent | medium | yes | api+cli+tasks+tui+web | B049 | 3 | single implementer preferred; split only by disjoint write_set |
| B050 06-tasks-and-scrum schema-contract 2 | 1 | implemented | high | yes | schema+tasks | B049 | 3 | single integration owner; helper agents read-only/tests-only |
| B071 08-memory-context-engine memory 1 | 1 | implemented | high | no | memory+platform | B075 | 3 | single integration owner; helper agents read-only/tests-only |
| B125 cli-codegen cli-surface 2 | 1 | ready-for-agent | medium | yes | cli+tasks | B124 | 3 | single implementer preferred; split only by disjoint write_set |
| B145 search-and-discovery schema-contract 2 | 1 | ready-for-agent | high | yes | repos+runtime+schema+search+tasks | B144 | 1 | single integration owner; helper agents read-only/tests-only |
| B150 tui tui-surface 2 | 1 | ready-for-agent | medium | yes | tasks+tui+web | B149 | 3 | single implementer preferred; split only by disjoint write_set |
| B037 05-router-and-skills api-contract 2 | 2 | ready-for-agent | medium | yes | api+cli+web | B036 | 3 | single implementer preferred; split only by disjoint write_set |
| B039 05-router-and-skills api-contract 4 | 2 | implemented | high | yes | api+inference+web | B036,B043 | 3 | single integration owner; helper agents read-only/tests-only |
| B046 06-tasks-and-scrum cli-surface | 2 | ready-for-agent | medium | yes | cli+tasks+tui+web | B044 | 1 | single implementer preferred; split only by disjoint write_set |
| B047 06-tasks-and-scrum docs | 2 | ready-for-agent | low | no | docs+tasks | B044 | 2 | single implementer preferred; split only by disjoint write_set |
| B068 08-memory-context-engine docs | 2 | ready-for-agent | low | no | docs+memory | B071 | 1 | single implementer preferred; split only by disjoint write_set |
| B072 08-memory-context-engine memory 2 | 2 | ready-for-agent | low | no | memory | B071 | 1 | single implementer preferred; split only by disjoint write_set |
| B123 cli-codegen api-contract | 2 | ready-for-agent | high | yes | api+cli+notifications+web | B125 | 1 | single integration owner; helper agents read-only/tests-only |
| B126 cli-codegen cli-surface 3 | 2 | ready-for-agent | high | yes | cli+docs+memory+platform+search | B125 | 3 | single integration owner; helper agents read-only/tests-only |
| B151 tui tui-surface 3 | 2 | ready-for-agent | medium | yes | docs+memory+repos+tasks+tui+web | B150 | 3 | single implementer preferred; split only by disjoint write_set |
| B152 tui tui-surface 4 | 2 | ready-for-agent | medium | yes | notifications+repos+runtime+search+tui+web | B149,B150 | 3 | single implementer preferred; split only by disjoint write_set |
| B038 05-router-and-skills api-contract 3 | 3 | implemented | medium | yes | api+docs+repos+tui+web | B036,B037 | 3 | single implementer preferred; split only by disjoint write_set |
| B040 05-router-and-skills api-contract 5 | 3 | ready-for-agent | high | yes | api+cli+docs+web | B039 | 3 | single integration owner; helper agents read-only/tests-only |
| B048 06-tasks-and-scrum gated-integration | 3 | ready-for-agent | high | no | inference+search+tasks | B044,B047,B050 | 3 | single integration owner; helper agents read-only/tests-only |
| B066 08-memory-context-engine api-contract | 3 | ready-for-agent | high | yes | api+memory+search | B071,B072 | 2 | single integration owner; helper agents read-only/tests-only |
| B073 08-memory-context-engine orchestration | 3 | ready-for-agent | medium | no | memory+orchestration | B072 | 1 | single implementer preferred; split only by disjoint write_set |
| B127 cli-codegen cli-surface 4 | 3 | implemented | medium | yes | cli+docs+platform | B123,B124,B125,B126 | 3 | single implementer preferred; split only by disjoint write_set |
| B153 tui tui-surface 5 | 3 | ready-for-agent | high | yes | inference+orchestration+platform+tui+web | B150,B152 | 3 | single integration owner; helper agents read-only/tests-only |
| B041 05-router-and-skills api-contract 6 | 4 | ready-for-agent | medium | yes | api+memory+tui+web | B037,B039,B040 | 3 | single implementer preferred; split only by disjoint write_set |
| B042 05-router-and-skills api-contract 7 | 4 | ready-for-agent | medium | yes | api+cli+docs+platform+tui+web | B037,B039,B040,B043 | 3 | single implementer preferred; split only by disjoint write_set |
| B067 08-memory-context-engine cli-surface | 4 | ready-for-agent | medium | yes | cli+memory | B066 | 1 | single implementer preferred; split only by disjoint write_set |
| B069 08-memory-context-engine gated-integration 1 | 4 | ready-for-agent | high | no | inference+memory | B066,B068,B071,B075 | 3 | single integration owner; helper agents read-only/tests-only |
| B076 08-memory-context-engine tui-surface | 4 | ready-for-agent | medium | yes | memory+tui+web | B066 | 1 | single implementer preferred; split only by disjoint write_set |
| B077 08-memory-context-engine web-surface | 4 | ready-for-agent | low | yes | memory+web | B066,B072 | 2 | single implementer preferred; split only by disjoint write_set |
| B148 tui auth-permissions | 4 | ready-for-agent | high | yes | permissions+platform+tui+web | B153 | 1 | single integration owner; helper agents read-only/tests-only |
| B070 08-memory-context-engine gated-integration 2 | 5 | ready-for-agent | high | no | inference+memory+repos | B069 | 1 | single integration owner; helper agents read-only/tests-only |
| B074 08-memory-context-engine quality-gate | 5 | ready-for-agent | medium | no | docs+memory+platform | B067,B073,B076,B077 | 1 | single implementer preferred; split only by disjoint write_set |
| B154 tui tui-surface 6 | 5 | ready-for-agent | high | yes | docs+inference+platform+tui+web | B148,B149,B150,B151,B152,B153 | 3 | single integration owner; helper agents read-only/tests-only |
| B001 01-foundation-reset auth-permissions 1 | 999 | integration-review | high | yes | api+auth+memory+permissions+web | B008 | 3 | single integration owner; helper agents read-only/tests-only |
| B002 01-foundation-reset auth-permissions 2 | 999 | integration-review | high | yes | auth+cli+web | B001,B005 | 3 | single integration owner; helper agents read-only/tests-only |
| B003 01-foundation-reset auth-permissions 3 | 999 | integration-review | high | yes | auth+inference+notifications+tui+web | B002,B008 | 3 | single integration owner; helper agents read-only/tests-only |
| B004 01-foundation-reset auth-permissions 4 | 999 | integration-review | high | yes | permissions | B001,B007 | 1 | single integration owner; helper agents read-only/tests-only |
| B005 01-foundation-reset cli-surface | 999 | completed | medium | yes | cli+orchestration | B001 | 1 | single implementer preferred; split only by disjoint write_set |
| B006 01-foundation-reset quality-gate | 999 | integration-review | low | no | general | B003,B004,B008 | 1 | single implementer preferred; split only by disjoint write_set |
| B008 01-foundation-reset schema-contract 2 | 999 | integration-review | high | yes | api+schema+web | B001,B007 | 3 | single integration owner; helper agents read-only/tests-only |
| B010 02-inference-sidecar api-contract 1 | 999 | mixed | medium | yes | api+cli+inference+tui+web | B012,B013 | 3 | single implementer preferred; split only by disjoint write_set |
| B011 02-inference-sidecar api-contract 2 | 999 | ready-for-agent | high | yes | api+inference | B013 | 1 | single integration owner; helper agents read-only/tests-only |
| B012 02-inference-sidecar cli-surface | 999 | implemented | medium | yes | cli+inference+orchestration+tui+web | B010,B013,B014,B015 | 3 | single implementer preferred; split only by disjoint write_set |
| B013 02-inference-sidecar inference | 999 | implemented | medium | no | inference | B010,B015 | 2 | single implementer preferred; split only by disjoint write_set |
| B015 02-inference-sidecar schema-contract | 999 | mixed | high | yes | inference+schema | B012,B014 | 2 | single integration owner; helper agents read-only/tests-only |
| B016 02-inference-sidecar tui-surface | 999 | ready-for-agent | medium | yes | inference+tui+web | B010,B011 | 2 | single implementer preferred; split only by disjoint write_set |
| B017 03-symphony-orchestration api-contract | 999 | ready-for-agent | high | yes | api+notifications+orchestration | B022,B026 | 2 | single integration owner; helper agents read-only/tests-only |
| B018 03-symphony-orchestration cli-surface | 999 | ready-for-agent | medium | yes | cli+orchestration | B017 | 1 | single implementer preferred; split only by disjoint write_set |
| B019 03-symphony-orchestration orchestration | 999 | mixed | high | no | orchestration+platform | B022,B024 | 3 | single integration owner; helper agents read-only/tests-only |
| B020 03-symphony-orchestration quality-gate | 999 | mixed | medium | no | docs+orchestration+repos | B026 | 2 | single implementer preferred; split only by disjoint write_set |
| B021 03-symphony-orchestration runtime-loop 1 | 999 | implemented | medium | no | orchestration | B019,B024,B026 | 3 | single implementer preferred; split only by disjoint write_set |
| B022 03-symphony-orchestration runtime-loop 2 | 999 | in-progress | medium | no | orchestration | B019,B021,B024,B026 | 3 | single implementer preferred; split only by disjoint write_set |
| B023 03-symphony-orchestration runtime-loop 3 | 999 | ready-for-agent | high | no | orchestration+repos | B019,B020 | 2 | single integration owner; helper agents read-only/tests-only |
| B025 03-symphony-orchestration tui-surface | 999 | ready-for-agent | medium | yes | orchestration+tui+web | B017 | 1 | single implementer preferred; split only by disjoint write_set |
| B026 03-symphony-orchestration web-surface | 999 | mixed | medium | yes | docs+orchestration+web | B017,B019,B022,B024 | 3 | single implementer preferred; split only by disjoint write_set |
| B027 04-sandcastle-wrapper api-contract | 999 | ready-for-agent | medium | yes | api+runtime+web | B028 | 1 | single implementer preferred; split only by disjoint write_set |
| B028 04-sandcastle-wrapper cli-surface | 999 | ready-for-agent | medium | yes | cli+docs+orchestration+platform+runtime | B032,B033 | 2 | single implementer preferred; split only by disjoint write_set |
| B029 04-sandcastle-wrapper gated-integration | 999 | ready-for-agent | high | no | docs+runtime | B033 | 1 | single integration owner; helper agents read-only/tests-only |
| B030 04-sandcastle-wrapper orchestration | 999 | ready-for-agent | medium | no | orchestration+runtime | B032 | 1 | single implementer preferred; split only by disjoint write_set |
| B031 04-sandcastle-wrapper quality-gate | 999 | ready-for-agent | medium | no | runtime | B032 | 2 | single implementer preferred; split only by disjoint write_set |
| B032 04-sandcastle-wrapper runtime | 999 | mixed | medium | no | platform+runtime | B033,B034 | 3 | single implementer preferred; split only by disjoint write_set |
| B033 04-sandcastle-wrapper runtime-loop | 999 | ready-for-agent | high | no | orchestration+runtime | B030,B032 | 3 | single integration owner; helper agents read-only/tests-only |
| B034 04-sandcastle-wrapper schema-contract | 999 | mixed | high | yes | runtime+schema | B032 | 3 | single integration owner; helper agents read-only/tests-only |
| B035 04-sandcastle-wrapper tui-surface | 999 | ready-for-agent | medium | yes | runtime+tui+web | B027 | 1 | single implementer preferred; split only by disjoint write_set |
| B045 06-tasks-and-scrum api-contract 2 | 999 | ready-for-agent | high | yes | api+repos+tasks | B044,B050,B052 | 3 | single integration owner; helper agents read-only/tests-only |
| B051 06-tasks-and-scrum tasks 1 | 999 | ready-for-agent | low | no | tasks | B044,B050,B053 | 5 | single implementer preferred; split only by disjoint write_set |
| B052 06-tasks-and-scrum tasks 2 | 999 | ready-for-agent | low | no | repos+tasks | B050,B051 | 1 | single implementer preferred; split only by disjoint write_set |
| B053 06-tasks-and-scrum web-surface | 999 | ready-for-agent | low | yes | tasks+web | B044,B050,B051 | 4 | single implementer preferred; split only by disjoint write_set |
| B054 07-docs-editor-collab api-contract 1 | 999 | ready-for-agent | high | yes | api+docs+platform+tui | B061,B062,B064 | 3 | single integration owner; helper agents read-only/tests-only |
| B055 07-docs-editor-collab api-contract 2 | 999 | ready-for-agent | high | yes | api+cli+docs+platform+web | B054,B061,B062 | 3 | single integration owner; helper agents read-only/tests-only |
| B056 07-docs-editor-collab api-contract 3 | 999 | ready-for-agent | high | yes | api+docs+platform | B055,B061,B062 | 1 | single integration owner; helper agents read-only/tests-only |
| B057 07-docs-editor-collab docs 1 | 999 | ready-for-agent | high | no | docs+notifications+tasks | B062,B064 | 3 | single integration owner; helper agents read-only/tests-only |
| B058 07-docs-editor-collab docs 2 | 999 | ready-for-agent | high | no | docs | B062 | 1 | single integration owner; helper agents read-only/tests-only |
| B059 07-docs-editor-collab gated-integration | 999 | ready-for-agent | high | no | docs+inference+repos | B057,B062 | 2 | single integration owner; helper agents read-only/tests-only |
| B060 07-docs-editor-collab inference | 999 | ready-for-agent | high | no | docs+inference+runtime | B064 | 1 | single integration owner; helper agents read-only/tests-only |
| B062 07-docs-editor-collab schema-contract 2 | 999 | ready-for-agent | high | yes | api+docs+schema+search | B057,B061,B064 | 3 | single integration owner; helper agents read-only/tests-only |
| B063 07-docs-editor-collab tui-surface | 999 | ready-for-agent | high | yes | docs+tui+web | B054,B062 | 1 | single integration owner; helper agents read-only/tests-only |
| B064 07-docs-editor-collab web-surface 1 | 999 | mixed | high | yes | docs+web | B061,B062 | 3 | single integration owner; helper agents read-only/tests-only |
| B065 07-docs-editor-collab web-surface 2 | 999 | ready-for-agent | high | yes | docs+web | B054,B057,B062,B064 | 1 | single integration owner; helper agents read-only/tests-only |
| B078 09-repos-git-supervision api-contract | 999 | ready-for-agent | medium | yes | api+repos | B082 | 1 | single implementer preferred; split only by disjoint write_set |
| B079 09-repos-git-supervision cli-surface | 999 | ready-for-agent | medium | yes | cli+repos | B078 | 1 | single implementer preferred; split only by disjoint write_set |
| B080 09-repos-git-supervision gated-integration | 999 | ready-for-agent | high | no | repos | B078,B084 | 3 | single integration owner; helper agents read-only/tests-only |
| B081 09-repos-git-supervision quality-gate | 999 | ready-for-agent | medium | no | docs+platform+repos | B079,B083,B085,B086 | 1 | single implementer preferred; split only by disjoint write_set |
| B082 09-repos-git-supervision repos | 999 | mixed | low | no | repos | B078,B079,B084,B085,B086 | 3 | single implementer preferred; split only by disjoint write_set |
| B083 09-repos-git-supervision runtime-loop | 999 | ready-for-agent | low | no | repos | B082,B084 | 3 | single implementer preferred; split only by disjoint write_set |
| B085 09-repos-git-supervision tui-surface | 999 | ready-for-agent | medium | yes | repos+tui+web | B078,B079 | 1 | single implementer preferred; split only by disjoint write_set |
| B086 09-repos-git-supervision web-surface | 999 | ready-for-agent | low | yes | repos+web | B078 | 4 | single implementer preferred; split only by disjoint write_set |
| B087 16-web-shell-rebuild auth-permissions | 999 | ready-for-agent | high | yes | api+auth+web | B002,B003 | 2 | single integration owner; helper agents read-only/tests-only |
| B088 16-web-shell-rebuild cli-surface | 999 | ready-for-agent | medium | yes | cli+search+web | B089 | 1 | single implementer preferred; split only by disjoint write_set |
| B089 16-web-shell-rebuild web-surface 1 | 999 | ready-for-agent | medium | yes | orchestration+platform+web | B001,B098 | 3 | single implementer preferred; split only by disjoint write_set |
| B090 16-web-shell-rebuild web-surface 2 | 999 | ready-for-agent | low | yes | repos+tasks+web | B089 | 3 | single implementer preferred; split only by disjoint write_set |
| B091 16-web-shell-rebuild web-surface 3 | 999 | ready-for-agent | high | yes | docs+tasks+web | B089,B090 | 3 | single integration owner; helper agents read-only/tests-only |
| B092 16-web-shell-rebuild web-surface 4 | 999 | ready-for-agent | medium | yes | memory+repos+runtime+web | B034,B089 | 3 | single implementer preferred; split only by disjoint write_set |
| B093 16-web-shell-rebuild web-surface 5 | 999 | ready-for-agent | medium | yes | inference+notifications+orchestration+platform+search+web | B016,B026,B088,B089,B092,B098 | 3 | single implementer preferred; split only by disjoint write_set |
| B094 16-web-shell-rebuild web-surface 6 | 999 | ready-for-agent | high | yes | docs+notifications+platform+web | B006,B089,B091,B093,B098,B099,B100 | 3 | single integration owner; helper agents read-only/tests-only |
| B095 16-web-shell-rebuild web-surface 7 | 999 | ready-for-agent | high | yes | docs+runtime+web | B089,B091 | 3 | single integration owner; helper agents read-only/tests-only |
| B096 16-web-shell-rebuild web-surface 8 | 999 | ready-for-agent | high | yes | inference+platform+repos+tasks+web | B012,B089,B090,B091,B102 | 3 | single integration owner; helper agents read-only/tests-only |
| B097 16-web-shell-rebuild web-surface 9 | 999 | ready-for-agent | medium | yes | docs+platform+web | B094 | 1 | single implementer preferred; split only by disjoint write_set |
| B098 17-cross-cutting-platform api-contract 1 | 999 | in-progress | high | yes | api+cli+platform+runtime+tui+web | B007,B106 | 3 | single integration owner; helper agents read-only/tests-only |
| B099 17-cross-cutting-platform api-contract 2 | 999 | ready-for-agent | medium | yes | api+cli+platform+tui+web | B008,B106 | 3 | single implementer preferred; split only by disjoint write_set |
| B100 17-cross-cutting-platform api-contract 3 | 999 | ready-for-agent | high | yes | api+cli+platform | B106 | 1 | single integration owner; helper agents read-only/tests-only |
| B101 17-cross-cutting-platform cli-surface | 999 | ready-for-agent | high | yes | cli+platform+web | B098,B099,B100 | 2 | single integration owner; helper agents read-only/tests-only |
| B102 17-cross-cutting-platform gated-integration 1 | 999 | ready-for-agent | high | no | platform+tasks | B098,B100,B106 | 3 | single integration owner; helper agents read-only/tests-only |
| B103 17-cross-cutting-platform gated-integration 2 | 999 | ready-for-agent | high | no | docs+platform | B098 | 1 | single integration owner; helper agents read-only/tests-only |
| B104 17-cross-cutting-platform quality-gate | 999 | mixed | medium | no | docs+notifications+platform | B006,B098,B099 | 3 | single implementer preferred; split only by disjoint write_set |
| B105 17-cross-cutting-platform runtime-loop | 999 | ready-for-agent | high | no | orchestration+platform | B098,B099 | 2 | single integration owner; helper agents read-only/tests-only |
| B106 17-cross-cutting-platform schema-contract | 999 | mixed | high | yes | api+notifications+platform+repos+schema | B007,B098,B099,B100 | 3 | single integration owner; helper agents read-only/tests-only |
| B107 17-cross-cutting-platform tui-surface | 999 | ready-for-agent | high | yes | platform+tui+web | B098,B099 | 1 | single integration owner; helper agents read-only/tests-only |
| B108 17-cross-cutting-platform web-surface | 999 | ready-for-agent | high | yes | platform+web | B099 | 1 | single integration owner; helper agents read-only/tests-only |
| B109 api-and-webhooks api-contract 1 | 999 | implemented | high | yes | api+web | B114 | 3 | single integration owner; helper agents read-only/tests-only |
| B110 api-and-webhooks api-contract 2 | 999 | ready-for-agent | high | yes | api+docs+notifications+orchestration+search+tasks+web | B109,B114 | 3 | single integration owner; helper agents read-only/tests-only |
| B111 api-and-webhooks api-contract 3 | 999 | ready-for-agent | high | yes | api+repos+web | B109,B114 | 3 | single integration owner; helper agents read-only/tests-only |
| B112 api-and-webhooks api-contract 4 | 999 | ready-for-agent | high | yes | api+platform+repos+web | B111 | 3 | single integration owner; helper agents read-only/tests-only |
| B113 api-and-webhooks api-contract 5 | 999 | ready-for-agent | high | yes | api+docs+platform+web | B109,B110,B111,B112 | 3 | single integration owner; helper agents read-only/tests-only |
| B114 api-and-webhooks schema-contract | 999 | ready-for-agent | high | yes | api+schema+web | B109 | 2 | single integration owner; helper agents read-only/tests-only |
| B115 artifacts api-contract | 999 | ready-for-agent | medium | yes | api+runtime | B118,B120 | 1 | single implementer preferred; split only by disjoint write_set |
| B116 artifacts cli-surface | 999 | ready-for-agent | medium | yes | cli+runtime+tui+web | B115,B122 | 3 | single implementer preferred; split only by disjoint write_set |
| B117 artifacts gated-integration | 999 | ready-for-agent | high | no | runtime | B115,B119 | 1 | single integration owner; helper agents read-only/tests-only |
| B118 artifacts quality-gate | 999 | ready-for-agent | medium | no | docs+platform+runtime+tasks | B119,B121,B122 | 2 | single implementer preferred; split only by disjoint write_set |
| B119 artifacts runtime | 999 | ready-for-agent | medium | no | runtime | B121 | 1 | single implementer preferred; split only by disjoint write_set |
| B120 artifacts runtime-loop | 999 | ready-for-agent | high | no | docs+inference+orchestration+repos+runtime+search+tasks | B115,B119,B121 | 3 | single integration owner; helper agents read-only/tests-only |
| B121 artifacts schema-contract | 999 | ready-for-agent | high | yes | api+cli+inference+runtime+schema | B115 | 2 | single integration owner; helper agents read-only/tests-only |
| B122 artifacts tui-surface | 999 | ready-for-agent | medium | yes | runtime+tasks+tui+web | B115,B116 | 2 | single implementer preferred; split only by disjoint write_set |
| B128 notifications-activity-audit api-contract 1 | 999 | ready-for-agent | high | yes | api+notifications+orchestration+web | B134,B137 | 3 | single integration owner; helper agents read-only/tests-only |
| B129 notifications-activity-audit api-contract 2 | 999 | ready-for-agent | high | yes | api+notifications | B128,B130 | 1 | single integration owner; helper agents read-only/tests-only |
| B130 notifications-activity-audit auth-permissions | 999 | ready-for-agent | high | yes | api+notifications+permissions+platform+web | B135 | 3 | single integration owner; helper agents read-only/tests-only |
| B131 notifications-activity-audit cli-surface | 999 | ready-for-agent | high | yes | cli+notifications+platform | B128,B130 | 2 | single integration owner; helper agents read-only/tests-only |
| B132 notifications-activity-audit gated-integration | 999 | ready-for-agent | high | no | docs+notifications | B134,B137 | 1 | single integration owner; helper agents read-only/tests-only |
| B133 notifications-activity-audit quality-gate | 999 | ready-for-agent | low | no | notifications | B130,B131,B135,B136,B138 | 1 | single implementer preferred; split only by disjoint write_set |
| B134 notifications-activity-audit runtime-loop | 999 | ready-for-agent | low | no | notifications | B135,B137 | 1 | single implementer preferred; split only by disjoint write_set |
| B135 notifications-activity-audit schema-contract | 999 | ready-for-agent | high | yes | api+notifications+permissions+schema+web | B128,B137 | 3 | single integration owner; helper agents read-only/tests-only |
| B136 notifications-activity-audit tui-surface | 999 | ready-for-agent | high | yes | docs+notifications+platform+tui+web | B128,B130 | 1 | single integration owner; helper agents read-only/tests-only |
| B137 notifications-activity-audit web-surface 1 | 999 | ready-for-agent | high | yes | notifications+orchestration+web | B128,B134,B135 | 3 | single integration owner; helper agents read-only/tests-only |
| B138 notifications-activity-audit web-surface 2 | 999 | ready-for-agent | high | yes | inference+notifications+orchestration+web | B128,B134,B137 | 3 | single integration owner; helper agents read-only/tests-only |
| B139 search-and-discovery api-contract | 999 | ready-for-agent | high | yes | api+memory+search | B144,B145,B147 | 3 | single integration owner; helper agents read-only/tests-only |
| B140 search-and-discovery cli-surface 1 | 999 | ready-for-agent | medium | yes | cli+search+tui+web | B139,B147 | 3 | single implementer preferred; split only by disjoint write_set |
| B141 search-and-discovery cli-surface 2 | 999 | ready-for-agent | high | yes | cli+inference+platform+repos+search | B139,B147 | 1 | single integration owner; helper agents read-only/tests-only |
| B142 search-and-discovery gated-integration | 999 | ready-for-agent | high | no | inference+search | B139,B144,B145 | 2 | single integration owner; helper agents read-only/tests-only |
| B143 search-and-discovery quality-gate | 999 | ready-for-agent | low | no | search | B140,B146 | 1 | single implementer preferred; split only by disjoint write_set |
| B146 search-and-discovery tui-surface | 999 | ready-for-agent | medium | yes | search+tui+web | B139,B147 | 2 | single implementer preferred; split only by disjoint write_set |
| B147 search-and-discovery web-surface | 999 | ready-for-agent | medium | yes | docs+memory+repos+runtime+search+tasks+web | B139 | 2 | single implementer preferred; split only by disjoint write_set |

## Issue Index By Bundle

### B007 01-foundation-reset schema-contract 1

- Phase: 0
- Status: integration-review
- Risk: high
- Surfaces: auth, schema
- Depends on: None
- Blocks: B004, B008, B009, B098, B106
- Frozen by active gate: yes
- Write set:
  - src/db/entities/**
  - src/db/migrations/**
  - tests/db/migrations/**
- Issues:
  - 01-foundation-reset/issues/01-schema-auth-migration.md: integration-review; deps=None; tests=tests/db/entities/auth.test.ts; title=Auth migration class — User, Session, Invitation, OrgMember, FeatureFlag entities
  - 01-foundation-reset/issues/02-events-org-id-backfill.md: integration-review; deps=01-foundation-reset/issues/01-schema-auth-migration.md; tests=tests/db/migrations/events-backfill.test.ts; title=Events org_id backfill migration class — NOT NULL + default-org backfill
  - 01-foundation-reset/issues/03-composite-indexes-and-flag-stub-tables.md: integration-review; deps=01-foundation-reset/issues/02-events-org-id-backfill.md; tests=tests/db/migrations/composite-indexes.test.ts ; tests/db/migrations/flag-stubs.test.ts; title=Composite (org, …) index decorators + flag-stub entities (two migration classes)

### B014 02-inference-sidecar quality-gate

- Phase: 0
- Status: completed
- Risk: medium
- Surfaces: inference, orchestration
- Depends on: None
- Blocks: B012, B015
- Frozen by active gate: no
- Write set:
  - inference/**
  - src/cli/inference*
  - src/inference/**
- Issues:
  - 02-inference-sidecar/issues/01-cargo-workspace-scaffold.md: completed; deps=None; tests=bun test tests/trpc/<focused>.test.ts; title=Cargo workspace scaffold + JSON-RPC server skeleton + smoke test

### B024 03-symphony-orchestration schema-contract

- Phase: 0
- Status: completed
- Risk: high
- Surfaces: orchestration, schema, tasks
- Depends on: None
- Blocks: B019, B021, B022, B026
- Frozen by active gate: yes
- Write set:
  - src/db/entities/**
  - src/db/migrations/**
  - tests/db/migrations/**
- Issues:
  - 03-symphony-orchestration/issues/02-schema-workflow-definitions.md: completed; deps=None; tests=bun test tests/db/migrations/<focused>.test.ts; title=Schema migration: workflow_definitions table + tasks eligibility columns
  - 03-symphony-orchestration/issues/03-schema-agent-runs-symphony-columns.md: completed; deps=None; tests=bun test tests/db/migrations/<focused>.test.ts; title=Schema migration: agent_runs Symphony state columns + partial indexes

### B043 05-router-and-skills schema-contract

- Phase: 0
- Status: implemented
- Risk: high
- Surfaces: api, cli, schema, web
- Depends on: None
- Blocks: B036, B039, B042
- Frozen by active gate: yes
- Write set:
  - src/db/entities/**
  - src/db/migrations/**
  - tests/db/migrations/**
- Issues:
  - 05-router-and-skills/issues/01-routing-rules-schema-migration.md: implemented; deps=None; tests=bun test tests/db/migrations/<focused>.test.ts; title=Routing rules entity + migration class + composite indexes
  - 05-router-and-skills/issues/02-fulcrum-skills-schema-migration.md: completed; deps=None; tests=bun test tests/db/migrations/<focused>.test.ts; title=FulcrumSkill entity + migration class + skills.lock.json design
  - 05-router-and-skills/issues/21-marketplace-schema-and-client.md: ready-for-agent; deps=05-router-and-skills/issues/02-fulcrum-skills-schema-migration.md; tests=bun test tests/db/migrations/<focused>.test.ts; title=Skill marketplace schema + Ed25519 client (FULCRUM_FEATURES=skill-marketplace)

### B049 06-tasks-and-scrum schema-contract 1

- Phase: 0
- Status: implemented
- Risk: high
- Surfaces: schema, tasks
- Depends on: None
- Blocks: B044, B050
- Frozen by active gate: yes
- Write set:
  - src/db/entities/**
  - src/db/migrations/**
  - tests/db/migrations/**
- Issues:
  - 06-tasks-and-scrum/issues/01-tasks-schema-extension.md: implemented; deps=None; tests=bun test tests/db/migrations/<focused>.test.ts; title=Tasks table schema extension + composite indexes
  - 06-tasks-and-scrum/issues/02-sprints-schema.md: implemented; deps=None; tests=bun test tests/db/migrations/<focused>.test.ts; title=Sprints schema + at-most-one-active constraint
  - 06-tasks-and-scrum/issues/03-custom-field-defs-schema.md: ready-for-agent; deps=None; tests=bun test tests/db/migrations/<focused>.test.ts; title=Custom field defs schema + types + defaults seeder

### B061 07-docs-editor-collab schema-contract 1

- Phase: 0
- Status: in-progress
- Risk: high
- Surfaces: docs, schema
- Depends on: None
- Blocks: B054, B055, B056, B062, B064
- Frozen by active gate: yes
- Write set:
  - src/db/entities/**
  - src/db/migrations/**
  - tests/db/migrations/**
- Issues:
  - 07-docs-editor-collab/issues/01-docs-schema-foundation.md: implemented; deps=None; tests=bun test tests/db/migrations/<focused>.test.ts; title=Docs schema foundation — ALTER TABLE docs + doc_links + doc_versions + doc_comments + doc_templates
  - 07-docs-editor-collab/issues/03-frontmatter-schemas.md: completed; deps=07-docs-editor-collab/issues/01-docs-schema-foundation.md; tests=bun test tests/db/migrations/<focused>.test.ts; title=Frontmatter Zod schemas — all 9 doc_types + round-trip validation
  - 07-docs-editor-collab/issues/04-doc-template-seeds.md: in-progress; deps=07-docs-editor-collab/issues/01-docs-schema-foundation.md; tests=bun test tests/db/migrations/<focused>.test.ts; title=Doc templates seed migration — 9 org-default templates + project-override precedence

### B075 08-memory-context-engine schema-contract

- Phase: 0
- Status: implemented
- Risk: high
- Surfaces: inference, memory, schema
- Depends on: None
- Blocks: B069, B071
- Frozen by active gate: yes
- Write set:
  - src/db/entities/**
  - src/db/migrations/**
  - tests/db/migrations/**
- Issues:
  - 08-memory-context-engine/issues/01-schema-migration-core.md: implemented; deps=None; tests=bun test tests/db/migrations/<focused>.test.ts; title=schema migration core
  - 08-memory-context-engine/issues/02-schema-migration-gated-embeddings.md: ready-for-agent; deps=08-memory-context-engine/issues/01-schema-migration-core.md; tests=bun test tests/db/migrations/<focused>.test.ts; title=schema migration gated embeddings

### B084 09-repos-git-supervision schema-contract

- Phase: 0
- Status: ready-for-agent
- Risk: high
- Surfaces: repos, schema
- Depends on: None
- Blocks: B080, B082, B083
- Frozen by active gate: yes
- Write set:
  - src/db/entities/**
  - src/db/migrations/**
  - tests/db/migrations/**
- Issues:
  - 09-repos-git-supervision/issues/01-schema-migration.md: ready-for-agent; deps=None; tests=bun test tests/db/migrations/<focused>.test.ts; title=schema migration

### B124 cli-codegen cli-surface 1

- Phase: 0
- Status: implemented
- Risk: medium
- Surfaces: cli
- Depends on: None
- Blocks: B125, B127
- Frozen by active gate: yes
- Write set:
  - src/cli/**
  - tests/cli/**
- Issues:
  - 14-cli-codegen/issues/01-codegen-scaffold.md: implemented; deps=None; tests=bun test tests/db/migrations/<focused>.test.ts; title=codegen scaffold
  - 14-cli-codegen/issues/02-json-flag-and-watch-generation.md: ready-for-agent; deps=14-cli-codegen/issues/01-codegen-scaffold.md; tests=bun test tests/trpc/<focused>.test.ts; title=json flag and watch generation
  - 14-cli-codegen/issues/03-completion-scripts.md: ready-for-agent; deps=14-cli-codegen/issues/01-codegen-scaffold.md; tests=bun test tests/trpc/<focused>.test.ts; title=completion scripts

### B144 search-and-discovery schema-contract 1

- Phase: 0
- Status: ready-for-agent
- Risk: high
- Surfaces: cli, docs, memory, schema, search, tasks
- Depends on: None
- Blocks: B139, B142, B145
- Frozen by active gate: yes
- Write set:
  - src/db/entities/**
  - src/db/migrations/**
  - tests/db/migrations/**
- Issues:
  - 11-search-and-discovery/issues/01-schema-migration.md: ready-for-agent; deps=None; tests=bun test tests/db/migrations/<focused>.test.ts; title=Migration class: SearchDocument entity, SearchClick entity, SavedView.viewType enum extension
  - 11-search-and-discovery/issues/02-indexer-hook-base.md: ready-for-agent; deps=11-search-and-discovery/issues/01-schema-migration.md; tests=bun test tests/db/migrations/<focused>.test.ts; title=SearchIndexHook base: upsert + remove interface, ts_vector population, idempotency tests
  - 11-search-and-discovery/issues/03-indexers-task-doc-memory.md: ready-for-agent; deps=11-search-and-discovery/issues/02-indexer-hook-base.md; tests=bun test tests/db/migrations/<focused>.test.ts; title=Indexers: task, doc, memory — title/body/tags/metadata, wired into save handlers

### B149 tui tui-surface 1

- Phase: 0
- Status: in-progress
- Risk: medium
- Surfaces: platform, tui, web
- Depends on: None
- Blocks: B150, B152, B154
- Frozen by active gate: yes
- Write set:
  - src/tui/**
  - tests/tui/**
- Issues:
  - 15-tui/issues/01-tui-foundation-launcher.md: in-progress; deps=None; tests=src/tui/testing/fake-tty.ts; title=tui foundation launcher
  - 15-tui/issues/02-global-widgets.md: ready-for-agent; deps=15-tui/issues/01-tui-foundation-launcher.md; tests=bun test tests/auth/<focused>.test.ts; title=global widgets
  - 15-tui/issues/03-theme-engine.md: ready-for-agent; deps=15-tui/issues/01-tui-foundation-launcher.md; tests=bun test tests/trpc/<focused>.test.ts; title=theme engine

### B009 01-foundation-reset schema-contract 3

- Phase: 1
- Status: integration-review
- Risk: high
- Surfaces: schema
- Depends on: B007
- Blocks: None
- Frozen by active gate: yes
- Write set:
  - src/db/entities/**
  - src/db/migrations/**
  - tests/db/migrations/**
- Issues:
  - 01-foundation-reset/issues/19-migration-up-down-versioning.md: integration-review; deps=01-foundation-reset/issues/03-composite-indexes-and-flag-stub-tables.md; tests=bun test tests/db/migrations/<focused>.test.ts; title=Migration up/down + schema-version tracking (MikroORM migrator wrapper)

### B036 05-router-and-skills api-contract 1

- Phase: 1
- Status: implemented
- Risk: medium
- Surfaces: api, orchestration, platform, web
- Depends on: B043
- Blocks: B037, B038, B039
- Frozen by active gate: yes
- Write set:
  - src/server/trpc/routers/**
  - src/trpc/**
  - tests/trpc/**
- Issues:
  - 05-router-and-skills/issues/03-rules-engine-wrapper.md: completed; deps=05-router-and-skills/issues/01-routing-rules-schema-migration.md; tests=bun test tests/db/migrations/<focused>.test.ts; title=json-rules-engine wrapper + rule evaluation core
  - 05-router-and-skills/issues/04-auto-assign-tier1-tier2.md: completed; deps=05-router-and-skills/issues/03-rules-engine-wrapper.md; tests=bun test tests/db/migrations/<focused>.test.ts; title=auto-assign.ts — Tier 1 explicit override + Tier 2 rules evaluation
  - 05-router-and-skills/issues/05-routing-telemetry.md: implemented; deps=05-router-and-skills/issues/04-auto-assign-tier1-tier2.md; tests=bun test tests/db/migrations/<focused>.test.ts; title=Routing telemetry — events row per dispatch decision

### B044 06-tasks-and-scrum api-contract 1

- Phase: 1
- Status: ready-for-agent
- Risk: medium
- Surfaces: api, cli, tasks, tui, web
- Depends on: B049
- Blocks: B045, B046, B047, B048, B051, B053
- Frozen by active gate: yes
- Write set:
  - src/server/trpc/routers/**
  - src/trpc/**
  - tests/trpc/**
- Issues:
  - 06-tasks-and-scrum/issues/07-task-crud-baseline.md: ready-for-agent; deps=06-tasks-and-scrum/issues/01-tasks-schema-extension.md,06-tasks-and-scrum/issues/02-sprints-schema.md,06-tasks-and-scrum/issues/03-custom-field-defs-schema.md; tests=bun test tests/db/migrations/<focused>.test.ts; title=Task CRUD baseline — tRPC + Web detail + CLI + TUI
  - 06-tasks-and-scrum/issues/09-custom-fields-trpc-ui.md: ready-for-agent; deps=06-tasks-and-scrum/issues/03-custom-field-defs-schema.md,06-tasks-and-scrum/issues/07-task-crud-baseline.md; tests=bun test tests/db/migrations/<focused>.test.ts; title=Custom fields tRPC procedures + task detail renderer
  - 06-tasks-and-scrum/issues/17-sprints-trpc-crud.md: ready-for-agent; deps=06-tasks-and-scrum/issues/02-sprints-schema.md,06-tasks-and-scrum/issues/07-task-crud-baseline.md; tests=bun test tests/db/migrations/<focused>.test.ts; title=Sprints tRPC CRUD + start + close + CLI + TUI

### B050 06-tasks-and-scrum schema-contract 2

- Phase: 1
- Status: implemented
- Risk: high
- Surfaces: schema, tasks
- Depends on: B049
- Blocks: B045, B048, B051, B052, B053
- Frozen by active gate: yes
- Write set:
  - src/db/entities/**
  - src/db/migrations/**
  - tests/db/migrations/**
- Issues:
  - 06-tasks-and-scrum/issues/04-saved-views-schema.md: implemented; deps=None; tests=bun test tests/db/migrations/<focused>.test.ts; title=Saved views schema + filter AST type
  - 06-tasks-and-scrum/issues/05-metrics-cache-schema.md: ready-for-agent; deps=06-tasks-and-scrum/issues/02-sprints-schema.md; tests=bun test tests/db/migrations/<focused>.test.ts; title=Metrics cache schema + graphile-worker rollup job
  - 06-tasks-and-scrum/issues/06-connector-framework-schema.md: ready-for-agent; deps=06-tasks-and-scrum/issues/01-tasks-schema-extension.md; tests=bun test tests/db/migrations/<focused>.test.ts; title=Connector framework scaffolding + connector_sync_log schema

### B071 08-memory-context-engine memory 1

- Phase: 1
- Status: implemented
- Risk: high
- Surfaces: memory, platform
- Depends on: B075
- Blocks: B066, B068, B069, B072
- Frozen by active gate: no
- Write set:
  - src/context/**
  - src/memory/**
  - tests/memory/**
- Issues:
  - 08-memory-context-engine/issues/03-heuristic-extractor-core.md: implemented; deps=08-memory-context-engine/issues/01-schema-migration-core.md; tests=src/memory/__tests__/extractor-heuristic.test.ts ; tests/skills/upstream-sync.test.ts; title=heuristic extractor core
  - 08-memory-context-engine/issues/04-heuristic-extraction-hook-agent-run.md: ready-for-agent; deps=08-memory-context-engine/issues/03-heuristic-extractor-core.md; tests=bun test tests/db/migrations/<focused>.test.ts; title=heuristic extraction hook agent run
  - 08-memory-context-engine/issues/06-retriever-bm25-recency-importance.md: ready-for-agent; deps=08-memory-context-engine/issues/01-schema-migration-core.md; tests=src/memory/__tests__/retriever.test.ts; title=retriever bm25 recency importance

### B125 cli-codegen cli-surface 2

- Phase: 1
- Status: ready-for-agent
- Risk: medium
- Surfaces: cli, tasks
- Depends on: B124
- Blocks: B123, B126, B127
- Frozen by active gate: yes
- Write set:
  - src/cli/**
  - tests/cli/**
- Issues:
  - 14-cli-codegen/issues/04-ci-snapshot-gate.md: ready-for-agent; deps=14-cli-codegen/issues/01-codegen-scaffold.md,14-cli-codegen/issues/02-json-flag-and-watch-generation.md,14-cli-codegen/issues/03-completion-scripts.md; tests=bun test tests/db/migrations/<focused>.test.ts; title=ci snapshot gate
  - 14-cli-codegen/issues/05-binary-entrypoint-and-compile.md: ready-for-agent; deps=14-cli-codegen/issues/02-json-flag-and-watch-generation.md; tests=bun test tests/db/migrations/<focused>.test.ts; title=binary entrypoint and compile
  - 14-cli-codegen/issues/06-projects-tasks-sprints-commands.md: ready-for-agent; deps=14-cli-codegen/issues/05-binary-entrypoint-and-compile.md; tests=bun test tests/trpc/<focused>.test.ts; title=projects tasks sprints commands

### B145 search-and-discovery schema-contract 2

- Phase: 1
- Status: ready-for-agent
- Risk: high
- Surfaces: repos, runtime, schema, search, tasks
- Depends on: B144
- Blocks: B139, B142
- Frozen by active gate: yes
- Write set:
  - src/db/entities/**
  - src/db/migrations/**
  - tests/db/migrations/**
- Issues:
  - 11-search-and-discovery/issues/04-indexers-run-artifact-repo-sprint.md: ready-for-agent; deps=11-search-and-discovery/issues/02-indexer-hook-base.md; tests=bun test tests/db/migrations/<focused>.test.ts; title=Indexers: run, artifact, repo, project, sprint — wired into after_run/harvest/save handlers

### B150 tui tui-surface 2

- Phase: 1
- Status: ready-for-agent
- Risk: medium
- Surfaces: tasks, tui, web
- Depends on: B149
- Blocks: B151, B152, B153, B154
- Frozen by active gate: yes
- Write set:
  - src/tui/**
  - tests/tui/**
- Issues:
  - 15-tui/issues/04-dashboard-and-projects.md: ready-for-agent; deps=15-tui/issues/02-global-widgets.md; tests=bun test tests/trpc/<focused>.test.ts; title=dashboard and projects
  - 15-tui/issues/05-task-list-and-kanban-board.md: ready-for-agent; deps=15-tui/issues/04-dashboard-and-projects.md; tests=bun test tests/trpc/<focused>.test.ts; title=task list and kanban board
  - 15-tui/issues/06-task-detail-and-forms.md: ready-for-agent; deps=15-tui/issues/05-task-list-and-kanban-board.md; tests=bun test tests/trpc/<focused>.test.ts; title=task detail and forms

### B037 05-router-and-skills api-contract 2

- Phase: 2
- Status: ready-for-agent
- Risk: medium
- Surfaces: api, cli, web
- Depends on: B036
- Blocks: B038, B041, B042
- Frozen by active gate: yes
- Write set:
  - src/server/trpc/routers/**
  - src/trpc/**
  - tests/trpc/**
- Issues:
  - 05-router-and-skills/issues/06-interactive-no-match-prompt-learned-rule.md: ready-for-agent; deps=05-router-and-skills/issues/04-auto-assign-tier1-tier2.md; tests=bun test tests/db/migrations/<focused>.test.ts; title=Interactive no-match prompt + learned rule storage
  - 05-router-and-skills/issues/07-routing-trpc-procedures.md: ready-for-agent; deps=05-router-and-skills/issues/05-routing-telemetry.md,05-router-and-skills/issues/06-interactive-no-match-prompt-learned-rule.md; tests=bun test tests/db/migrations/<focused>.test.ts; title=tRPC routing.* procedures (list/get/create/update/delete/test/dryRun)
  - 05-router-and-skills/issues/08-routing-cli-commands.md: ready-for-agent; deps=05-router-and-skills/issues/07-routing-trpc-procedures.md; tests=bun test tests/db/migrations/<focused>.test.ts; title=CLI fulcrum routing rules * commands

### B039 05-router-and-skills api-contract 4

- Phase: 2
- Status: implemented
- Risk: high
- Surfaces: api, inference, web
- Depends on: B036, B043
- Blocks: B040, B041, B042
- Frozen by active gate: yes
- Write set:
  - src/server/trpc/routers/**
  - src/trpc/**
  - tests/trpc/**
- Issues:
  - 05-router-and-skills/issues/12-llm-fallback-tier3-gated.md: ready-for-agent; deps=05-router-and-skills/issues/04-auto-assign-tier1-tier2.md; tests=bun test tests/db/migrations/<focused>.test.ts; title=LLM fallback Tier 3 (FULCRUM_FEATURES=router-llm) + backend selection
  - 05-router-and-skills/issues/13-skills-loader-per-agent-install.md: completed; deps=05-router-and-skills/issues/02-fulcrum-skills-schema-migration.md; tests=bun test tests/db/migrations/<focused>.test.ts; title=Skills loader — per-agent directory install + hash verification
  - 05-router-and-skills/issues/14-skills-upstream-sync.md: implemented; deps=05-router-and-skills/issues/13-skills-loader-per-agent-install.md; tests=src/server/trpc/routers/__tests__/inference.test.ts; title=Skills upstream sync — fetch, auto-merge clean, conflict to lock file

### B046 06-tasks-and-scrum cli-surface

- Phase: 2
- Status: ready-for-agent
- Risk: medium
- Surfaces: cli, tasks, tui, web
- Depends on: B044
- Blocks: None
- Frozen by active gate: yes
- Write set:
  - src/cli/**
  - tests/cli/**
- Issues:
  - 06-tasks-and-scrum/issues/15-bulk-operations.md: ready-for-agent; deps=06-tasks-and-scrum/issues/07-task-crud-baseline.md; tests=bun test tests/trpc/<focused>.test.ts; title=Bulk operations — web multi-select, CLI, TUI

### B047 06-tasks-and-scrum docs

- Phase: 2
- Status: ready-for-agent
- Risk: low
- Surfaces: docs, tasks
- Depends on: B044
- Blocks: B048
- Frozen by active gate: no
- Write set:
  - src/docs/**
  - src/web/src/lib/components/markdown/**
  - src/web/src/routes/docs/**
- Issues:
  - 06-tasks-and-scrum/issues/10-tiptap-task-description.md: ready-for-agent; deps=06-tasks-and-scrum/issues/07-task-crud-baseline.md; tests=bun test tests/db/migrations/<focused>.test.ts; title=TipTap task description — autosave, wikilinks, mentions
  - 06-tasks-and-scrum/issues/22-sprint-retro-doc.md: ready-for-agent; deps=06-tasks-and-scrum/issues/17-sprints-trpc-crud.md; tests=bun test tests/trpc/<focused>.test.ts; title=Sprint close → retro doc auto-create (cross-ref Pillar 7)

### B068 08-memory-context-engine docs

- Phase: 2
- Status: ready-for-agent
- Risk: low
- Surfaces: docs, memory
- Depends on: B071
- Blocks: B069
- Frozen by active gate: no
- Write set:
  - src/docs/**
  - src/web/src/lib/components/markdown/**
  - src/web/src/routes/docs/**
- Issues:
  - 08-memory-context-engine/issues/05-heuristic-extraction-hook-doc-save.md: ready-for-agent; deps=08-memory-context-engine/issues/03-heuristic-extractor-core.md; tests=bun test tests/db/migrations/<focused>.test.ts; title=heuristic extraction hook doc save

### B072 08-memory-context-engine memory 2

- Phase: 2
- Status: ready-for-agent
- Risk: low
- Surfaces: memory
- Depends on: B071
- Blocks: B066, B073, B077
- Frozen by active gate: no
- Write set:
  - src/context/**
  - src/memory/**
  - tests/memory/**
- Issues:
  - 08-memory-context-engine/issues/08-context-bundle-assembler.md: ready-for-agent; deps=08-memory-context-engine/issues/06-retriever-bm25-recency-importance.md; tests=bun test tests/db/migrations/<focused>.test.ts; title=context bundle assembler

### B123 cli-codegen api-contract

- Phase: 2
- Status: ready-for-agent
- Risk: high
- Surfaces: api, cli, notifications, web
- Depends on: B125
- Blocks: B127
- Frozen by active gate: yes
- Write set:
  - src/server/trpc/routers/**
  - src/trpc/**
  - tests/trpc/**
- Issues:
  - 14-cli-codegen/issues/08-runs-notify-audit-webhooks-commands.md: ready-for-agent; deps=14-cli-codegen/issues/05-binary-entrypoint-and-compile.md; tests=bun test tests/trpc/<focused>.test.ts; title=runs notify audit webhooks commands

### B126 cli-codegen cli-surface 3

- Phase: 2
- Status: ready-for-agent
- Risk: high
- Surfaces: cli, docs, memory, platform, search
- Depends on: B125
- Blocks: B127
- Frozen by active gate: yes
- Write set:
  - src/cli/**
  - tests/cli/**
- Issues:
  - 14-cli-codegen/issues/07-docs-memory-search-commands.md: ready-for-agent; deps=14-cli-codegen/issues/05-binary-entrypoint-and-compile.md; tests=bun test tests/trpc/<focused>.test.ts; title=docs memory search commands
  - 14-cli-codegen/issues/09-interactive-flows-init-backup.md: ready-for-agent; deps=14-cli-codegen/issues/05-binary-entrypoint-and-compile.md; tests=bun test tests/db/migrations/<focused>.test.ts; title=interactive flows init backup
  - 14-cli-codegen/issues/10-interactive-flows-routing-skills-imports.md: ready-for-agent; deps=14-cli-codegen/issues/05-binary-entrypoint-and-compile.md; tests=bun test tests/trpc/<focused>.test.ts; title=interactive flows routing skills imports

### B151 tui tui-surface 3

- Phase: 2
- Status: ready-for-agent
- Risk: medium
- Surfaces: docs, memory, repos, tasks, tui, web
- Depends on: B150
- Blocks: B154
- Frozen by active gate: yes
- Write set:
  - src/tui/**
  - tests/tui/**
- Issues:
  - 15-tui/issues/07-sprints-and-reports.md: ready-for-agent; deps=15-tui/issues/05-task-list-and-kanban-board.md; tests=bun test tests/cli/<focused>.test.ts; title=sprints and reports
  - 15-tui/issues/08-docs-tree-reader-editor.md: ready-for-agent; deps=15-tui/issues/04-dashboard-and-projects.md; tests=bun test tests/auth/<focused>.test.ts; title=docs tree reader editor
  - 15-tui/issues/09-memory-and-context-preview.md: ready-for-agent; deps=15-tui/issues/04-dashboard-and-projects.md; tests=bun test tests/cli/<focused>.test.ts; title=memory and context preview

### B152 tui tui-surface 4

- Phase: 2
- Status: ready-for-agent
- Risk: medium
- Surfaces: notifications, repos, runtime, search, tui, web
- Depends on: B149, B150
- Blocks: B153, B154
- Frozen by active gate: yes
- Write set:
  - src/tui/**
  - tests/tui/**
- Issues:
  - 15-tui/issues/10-runs-and-artifacts.md: ready-for-agent; deps=15-tui/issues/04-dashboard-and-projects.md; tests=bun test tests/trpc/<focused>.test.ts; title=runs and artifacts
  - 15-tui/issues/11-repos-browser.md: ready-for-agent; deps=15-tui/issues/04-dashboard-and-projects.md; tests=bun test tests/auth/<focused>.test.ts; title=repos browser
  - 15-tui/issues/12-search-and-notifications.md: ready-for-agent; deps=15-tui/issues/02-global-widgets.md; tests=bun test tests/db/migrations/<focused>.test.ts; title=search and notifications

### B038 05-router-and-skills api-contract 3

- Phase: 3
- Status: implemented
- Risk: medium
- Surfaces: api, docs, repos, tui, web
- Depends on: B036, B037
- Blocks: None
- Frozen by active gate: yes
- Write set:
  - src/server/trpc/routers/**
  - src/trpc/**
  - tests/trpc/**
- Issues:
  - 05-router-and-skills/issues/09-web-routing-settings-page.md: ready-for-agent; deps=05-router-and-skills/issues/07-routing-trpc-procedures.md; tests=bun test tests/db/migrations/<focused>.test.ts; title=Web /settings/routing + /projects/<id>/routing pages
  - 05-router-and-skills/issues/10-tui-routing-rules-screen.md: ready-for-agent; deps=05-router-and-skills/issues/07-routing-trpc-procedures.md; tests=bun test tests/db/migrations/<focused>.test.ts; title=TUI routing rules editor screen
  - 05-router-and-skills/issues/11-pglite-listen-hot-reload.md: implemented; deps=05-router-and-skills/issues/03-rules-engine-wrapper.md; tests=bun test tests/db/migrations/<focused>.test.ts; title=Repository hot-reload for routing rules

### B040 05-router-and-skills api-contract 5

- Phase: 3
- Status: ready-for-agent
- Risk: high
- Surfaces: api, cli, docs, web
- Depends on: B039
- Blocks: B041, B042
- Frozen by active gate: yes
- Write set:
  - src/server/trpc/routers/**
  - src/trpc/**
  - tests/trpc/**
- Issues:
  - 05-router-and-skills/issues/15-skills-conflict-resolver.md: ready-for-agent; deps=05-router-and-skills/issues/14-skills-upstream-sync.md; tests=bun test tests/db/migrations/<focused>.test.ts; title=Skills conflict resolver — keep local / keep upstream / open editor
  - 05-router-and-skills/issues/16-skills-trpc-procedures.md: ready-for-agent; deps=05-router-and-skills/issues/15-skills-conflict-resolver.md; tests=bun test tests/db/migrations/<focused>.test.ts; title=tRPC skills.* procedures (list/install/upgrade/uninstall/sync/resolveConflict)
  - 05-router-and-skills/issues/17-skills-cli-commands.md: ready-for-agent; deps=05-router-and-skills/issues/16-skills-trpc-procedures.md; tests=bun test tests/db/migrations/<focused>.test.ts; title=CLI fulcrum skills * commands + daily cron install (gated)

### B048 06-tasks-and-scrum gated-integration

- Phase: 3
- Status: ready-for-agent
- Risk: high
- Surfaces: inference, search, tasks
- Depends on: B044, B047, B050
- Blocks: None
- Frozen by active gate: no
- Write set:
  - inference/**
  - src/cli/inference*
  - src/inference/**
  - src/tasks/**
  - src/web/src/routes/boards/**
  - src/web/src/routes/projects/**
- Issues:
  - 06-tasks-and-scrum/issues/25-connector-linear-gated.md: ready-for-agent; deps=06-tasks-and-scrum/issues/06-connector-framework-schema.md; tests=bun test tests/db/migrations/<focused>.test.ts; title=Gated connector-linear — Linear GraphQL adapter (one-way pull)
  - 06-tasks-and-scrum/issues/27-real-time-collab-gated.md: ready-for-agent; deps=06-tasks-and-scrum/issues/10-tiptap-task-description.md; tests=bun test tests/cli/<focused>.test.ts; title=Gated real-time collab — task description Yjs binding + Hocuspocus
  - 06-tasks-and-scrum/issues/28-embeddings-and-llm-narration-gated.md: ready-for-agent; deps=06-tasks-and-scrum/issues/07-task-crud-baseline.md,06-tasks-and-scrum/issues/22-sprint-retro-doc.md; tests=bun test tests/db/migrations/<focused>.test.ts; title=Gated embeddings task search + LLM sprint summary narration

### B066 08-memory-context-engine api-contract

- Phase: 3
- Status: ready-for-agent
- Risk: high
- Surfaces: api, memory, search
- Depends on: B071, B072
- Blocks: B067, B069, B076, B077
- Frozen by active gate: yes
- Write set:
  - src/server/trpc/routers/**
  - src/trpc/**
  - tests/trpc/**
- Issues:
  - 08-memory-context-engine/issues/07-trpc-memory-crud-and-search.md: ready-for-agent; deps=08-memory-context-engine/issues/06-retriever-bm25-recency-importance.md; tests=src/server/routers/__tests__/memory.test.ts; title=trpc memory crud and search
  - 08-memory-context-engine/issues/14-openapi-rest-memory-gated.md: ready-for-agent; deps=08-memory-context-engine/issues/07-trpc-memory-crud-and-search.md,08-memory-context-engine/issues/08-context-bundle-assembler.md; tests=bun test tests/db/migrations/<focused>.test.ts; title=openapi rest memory gated

### B073 08-memory-context-engine orchestration

- Phase: 3
- Status: ready-for-agent
- Risk: medium
- Surfaces: memory, orchestration
- Depends on: B072
- Blocks: B074
- Frozen by active gate: no
- Write set:
  - docs/symphony-conformance.md
  - src/orchestration/**
  - tests/symphony/**
- Issues:
  - 08-memory-context-engine/issues/09-symphony-before-run-hook-integration.md: ready-for-agent; deps=08-memory-context-engine/issues/08-context-bundle-assembler.md; tests=bun test tests/cli/<focused>.test.ts; title=symphony before run hook integration

### B127 cli-codegen cli-surface 4

- Phase: 3
- Status: implemented
- Risk: medium
- Surfaces: cli, docs, platform
- Depends on: B123, B124, B125, B126
- Blocks: None
- Frozen by active gate: yes
- Write set:
  - src/cli/**
  - tests/cli/**
- Issues:
  - 14-cli-codegen/issues/11-doctor-orchestrator.md: ready-for-agent; deps=14-cli-codegen/issues/05-binary-entrypoint-and-compile.md; tests=bun test tests/db/migrations/<focused>.test.ts; title=doctor orchestrator
  - 14-cli-codegen/issues/12-keybindings-registry.md: implemented; deps=14-cli-codegen/issues/01-codegen-scaffold.md; tests=bun test tests/db/migrations/<focused>.test.ts; title=keybindings registry
  - 14-cli-codegen/issues/13-performance-and-parity-gate.md: ready-for-agent; deps=14-cli-codegen/issues/06-projects-tasks-sprints-commands.md,14-cli-codegen/issues/07-docs-memory-search-commands.md,14-cli-codegen/issues/08-runs-notify-audit-webhooks-commands.md,14-cli-codegen/issues/09-interactive-flows-init-backup.md,14-cli-codegen/issues/10-interactive-flows-routing-skills-imports.md,14-cli-codegen/issues/11-doctor-orchestrator.md,14-cli-codegen/issues/12-keybindings-registry.md; tests=bun test tests/trpc/<focused>.test.ts; title=performance and parity gate

### B153 tui tui-surface 5

- Phase: 3
- Status: ready-for-agent
- Risk: high
- Surfaces: inference, orchestration, platform, tui, web
- Depends on: B150, B152
- Blocks: B148, B154
- Frozen by active gate: yes
- Write set:
  - src/tui/**
  - tests/tui/**
- Issues:
  - 15-tui/issues/13-agents-orchestration-inference.md: ready-for-agent; deps=15-tui/issues/10-runs-and-artifacts.md; tests=bun test tests/trpc/<focused>.test.ts; title=agents orchestration inference
  - 15-tui/issues/14-settings-navigator-and-core-screens.md: ready-for-agent; deps=15-tui/issues/04-dashboard-and-projects.md; tests=bun test tests/auth/<focused>.test.ts; title=settings navigator and core screens
  - 15-tui/issues/15-settings-integrations-secrets-backups.md: ready-for-agent; deps=15-tui/issues/14-settings-navigator-and-core-screens.md; tests=bun test tests/trpc/<focused>.test.ts; title=settings integrations secrets backups

### B041 05-router-and-skills api-contract 6

- Phase: 4
- Status: ready-for-agent
- Risk: medium
- Surfaces: api, memory, tui, web
- Depends on: B037, B039, B040
- Blocks: None
- Frozen by active gate: yes
- Write set:
  - src/server/trpc/routers/**
  - src/trpc/**
  - tests/trpc/**
- Issues:
  - 05-router-and-skills/issues/18-tui-skills-browser-screen.md: ready-for-agent; deps=05-router-and-skills/issues/16-skills-trpc-procedures.md; tests=bun test tests/db/migrations/<focused>.test.ts; title=TUI skills browser screen — table + conflict panel
  - 05-router-and-skills/issues/19-web-skills-settings-page.md: ready-for-agent; deps=05-router-and-skills/issues/16-skills-trpc-procedures.md; tests=bun test tests/db/migrations/<focused>.test.ts; title=Web /settings/skills page — registry + install + conflict resolver
  - 05-router-and-skills/issues/20-action-skill-set-context-assembler.md: ready-for-agent; deps=05-router-and-skills/issues/13-skills-loader-per-agent-install.md,05-router-and-skills/issues/07-routing-trpc-procedures.md; tests=bun test tests/db/migrations/<focused>.test.ts; title=action_skill_set → context assembler integration

### B042 05-router-and-skills api-contract 7

- Phase: 4
- Status: ready-for-agent
- Risk: medium
- Surfaces: api, cli, docs, platform, tui, web
- Depends on: B037, B039, B040, B043
- Blocks: None
- Frozen by active gate: yes
- Write set:
  - src/server/trpc/routers/**
  - src/trpc/**
  - tests/trpc/**
- Issues:
  - 05-router-and-skills/issues/22-marketplace-publisher-keygen.md: ready-for-agent; deps=05-router-and-skills/issues/21-marketplace-schema-and-client.md; tests=bun test tests/db/migrations/<focused>.test.ts; title=Marketplace publisher + org key generation (FULCRUM_FEATURES=skill-marketplace)
  - 05-router-and-skills/issues/23-marketplace-trpc-cli-tui-web.md: ready-for-agent; deps=05-router-and-skills/issues/22-marketplace-publisher-keygen.md; tests=bun test tests/db/migrations/<focused>.test.ts; title=Marketplace tRPC procedures + CLI + TUI panel + Web page (FULCRUM_FEATURES=skill-marketplace)
  - 05-router-and-skills/issues/24-fulcrum-doctor-routing-skills.md: ready-for-agent; deps=05-router-and-skills/issues/07-routing-trpc-procedures.md,05-router-and-skills/issues/16-skills-trpc-procedures.md,05-router-and-skills/issues/12-llm-fallback-tier3-gated.md; tests=bun test tests/db/migrations/<focused>.test.ts; title=fulcrum doctor — routing + skills health checks

### B067 08-memory-context-engine cli-surface

- Phase: 4
- Status: ready-for-agent
- Risk: medium
- Surfaces: cli, memory
- Depends on: B066
- Blocks: B074
- Frozen by active gate: yes
- Write set:
  - src/cli/**
  - tests/cli/**
- Issues:
  - 08-memory-context-engine/issues/10-cli-memory-verbs.md: ready-for-agent; deps=08-memory-context-engine/issues/07-trpc-memory-crud-and-search.md; tests=bun test tests/db/migrations/<focused>.test.ts; title=cli memory verbs

### B069 08-memory-context-engine gated-integration 1

- Phase: 4
- Status: ready-for-agent
- Risk: high
- Surfaces: inference, memory
- Depends on: B066, B068, B071, B075
- Blocks: B070
- Frozen by active gate: no
- Write set:
  - inference/**
  - src/cli/inference*
  - src/context/**
  - src/inference/**
  - src/memory/**
  - tests/memory/**
- Issues:
  - 08-memory-context-engine/issues/15-gated-llm-extraction.md: ready-for-agent; deps=08-memory-context-engine/issues/04-heuristic-extraction-hook-agent-run.md,08-memory-context-engine/issues/05-heuristic-extraction-hook-doc-save.md; tests=bun test tests/cli/<focused>.test.ts; title=gated llm extraction
  - 08-memory-context-engine/issues/16-gated-embeddings-write-pipeline.md: ready-for-agent; deps=08-memory-context-engine/issues/02-schema-migration-gated-embeddings.md,08-memory-context-engine/issues/07-trpc-memory-crud-and-search.md; tests=bun test tests/db/migrations/<focused>.test.ts; title=gated embeddings write pipeline
  - 08-memory-context-engine/issues/17-gated-hybrid-retrieval-scoring.md: ready-for-agent; deps=08-memory-context-engine/issues/16-gated-embeddings-write-pipeline.md,08-memory-context-engine/issues/06-retriever-bm25-recency-importance.md; tests=bun test tests/db/migrations/<focused>.test.ts; title=gated hybrid retrieval scoring

### B076 08-memory-context-engine tui-surface

- Phase: 4
- Status: ready-for-agent
- Risk: medium
- Surfaces: memory, tui, web
- Depends on: B066
- Blocks: B074
- Frozen by active gate: yes
- Write set:
  - src/tui/**
  - tests/tui/**
- Issues:
  - 08-memory-context-engine/issues/13-tui-memory-browser.md: ready-for-agent; deps=08-memory-context-engine/issues/07-trpc-memory-crud-and-search.md; tests=bun test tests/db/migrations/<focused>.test.ts; title=tui memory browser

### B077 08-memory-context-engine web-surface

- Phase: 4
- Status: ready-for-agent
- Risk: low
- Surfaces: memory, web
- Depends on: B066, B072
- Blocks: B074
- Frozen by active gate: yes
- Write set:
  - src/web/src/lib/components/**
  - src/web/src/routes/**
  - src/web/tests/**
- Issues:
  - 08-memory-context-engine/issues/11-web-memory-browser.md: ready-for-agent; deps=08-memory-context-engine/issues/07-trpc-memory-crud-and-search.md; tests=bun test tests/db/migrations/<focused>.test.ts; title=web memory browser
  - 08-memory-context-engine/issues/12-web-context-preview.md: ready-for-agent; deps=08-memory-context-engine/issues/08-context-bundle-assembler.md,08-memory-context-engine/issues/11-web-memory-browser.md; tests=bun test tests/trpc/<focused>.test.ts; title=web context preview

### B148 tui auth-permissions

- Phase: 4
- Status: ready-for-agent
- Risk: high
- Surfaces: permissions, platform, tui, web
- Depends on: B153
- Blocks: B154
- Frozen by active gate: yes
- Write set:
  - src/permissions/**
  - src/trpc/middleware.ts
  - tests/permissions/**
- Issues:
  - 15-tui/issues/17-gated-desktop-experiments-casbin-backups.md: ready-for-agent; deps=15-tui/issues/14-settings-navigator-and-core-screens.md,15-tui/issues/15-settings-integrations-secrets-backups.md; tests=bun test tests/permissions/<focused>.test.ts tests/trpc/<focused>.test.ts; title=gated desktop experiments casbin backups

### B070 08-memory-context-engine gated-integration 2

- Phase: 5
- Status: ready-for-agent
- Risk: high
- Surfaces: inference, memory, repos
- Depends on: B069
- Blocks: None
- Frozen by active gate: no
- Write set:
  - inference/**
  - src/cli/inference*
  - src/inference/**
- Issues:
  - 08-memory-context-engine/issues/18-gated-report-llm-narration.md: ready-for-agent; deps=08-memory-context-engine/issues/15-gated-llm-extraction.md; tests=bun test tests/db/migrations/<focused>.test.ts; title=gated report llm narration

### B074 08-memory-context-engine quality-gate

- Phase: 5
- Status: ready-for-agent
- Risk: medium
- Surfaces: docs, memory, platform
- Depends on: B067, B073, B076, B077
- Blocks: None
- Frozen by active gate: no
- Write set:
  - src/docs/**
  - src/web/src/lib/components/markdown/**
  - src/web/src/routes/docs/**
- Issues:
  - 08-memory-context-engine/issues/19-doctor-checks-and-parity-verification.md: ready-for-agent; deps=08-memory-context-engine/issues/10-cli-memory-verbs.md,08-memory-context-engine/issues/11-web-memory-browser.md,08-memory-context-engine/issues/12-web-context-preview.md,08-memory-context-engine/issues/13-tui-memory-browser.md,08-memory-context-engine/issues/09-symphony-before-run-hook-integration.md; tests=bun test tests/db/migrations/<focused>.test.ts; title=doctor checks and parity verification

### B154 tui tui-surface 6

- Phase: 5
- Status: ready-for-agent
- Risk: high
- Surfaces: docs, inference, platform, tui, web
- Depends on: B148, B149, B150, B151, B152, B153
- Blocks: None
- Frozen by active gate: yes
- Write set:
  - src/tui/**
  - tests/tui/**
- Issues:
  - 15-tui/issues/16-gated-i18n-embeddings.md: ready-for-agent; deps=15-tui/issues/14-settings-navigator-and-core-screens.md,15-tui/issues/12-search-and-notifications.md; tests=bun test tests/cli/<focused>.test.ts; title=gated i18n embeddings
  - 15-tui/issues/18-doctor-integration-and-opentui-gate.md: ready-for-agent; deps=15-tui/issues/01-tui-foundation-launcher.md,15-tui/issues/02-global-widgets.md,15-tui/issues/03-theme-engine.md; tests=bun test tests/db/migrations/<focused>.test.ts; title=doctor integration and opentui gate
  - 15-tui/issues/19-performance-and-parity-gate.md: ready-for-agent; deps=15-tui/issues/06-task-detail-and-forms.md,15-tui/issues/07-sprints-and-reports.md,15-tui/issues/08-docs-tree-reader-editor.md,15-tui/issues/09-memory-and-context-preview.md,15-tui/issues/10-runs-and-artifacts.md,15-tui/issues/11-repos-browser.md,15-tui/issues/12-search-and-notifications.md,15-tui/issues/13-agents-orchestration-inference.md,15-tui/issues/15-settings-integrations-secrets-backups.md,15-tui/issues/16-gated-i18n-embeddings.md,15-tui/issues/17-gated-desktop-experiments-casbin-backups.md,15-tui/issues/18-doctor-integration-and-opentui-gate.md; tests=bun test tests/db/migrations/<focused>.test.ts; title=performance and parity gate

### B001 01-foundation-reset auth-permissions 1

- Phase: 999
- Status: integration-review
- Risk: high
- Surfaces: api, auth, memory, permissions, web
- Depends on: B008
- Blocks: B002, B004, B005, B008, B089
- Frozen by active gate: yes
- Write set:
  - src/auth/**
  - src/permissions/**
  - src/trpc/middleware.ts
  - src/web/src/routes/auth/**
  - tests/auth/**
  - tests/permissions/**
- Issues:
  - 01-foundation-reset/issues/05-better-auth-integration.md: integration-review; deps=01-foundation-reset/issues/04-local-org-seed-and-init.md; tests=tests/auth/better-auth-integration.test.ts ; tests/auth/login.spec.ts; title=Better-Auth v1 integration — MikroORM-backed adapter, org plugin, passkey plugin, SvelteKit handler
  - 01-foundation-reset/issues/06-trpc-core-router-and-permission-middleware.md: completed; deps=01-foundation-reset/issues/05-better-auth-integration.md; tests=tests/trpc/middleware.test.ts ; tests/trpc/context.test.ts; title=tRPC v11 core router + context + assertPermission middleware
  - 01-foundation-reset/issues/09-auth-trpc-procedures-and-org-management.md: completed; deps=01-foundation-reset/issues/07-feature-flag-registry.md; tests=tests/trpc/auth.test.ts ; tests/trpc/orgs.test.ts; title=Auth + org tRPC procedures — whoami, invite, acceptInvite, org member management

### B002 01-foundation-reset auth-permissions 2

- Phase: 999
- Status: integration-review
- Risk: high
- Surfaces: auth, cli, web
- Depends on: B001, B005
- Blocks: B003, B087
- Frozen by active gate: yes
- Write set:
  - src/auth/**
  - src/web/src/routes/auth/**
  - tests/auth/**
- Issues:
  - 01-foundation-reset/issues/10-cli-auth-and-flags-verbs.md: integration-review; deps=01-foundation-reset/issues/09-auth-trpc-procedures-and-org-management.md,01-foundation-reset/issues/08-binary-entrypoint-scaffold.md; tests=tests/cli/auth.test.ts ; tests/cli/flags.test.ts ; tests/cli/auth-invite.test.ts; title=CLI auth + flags verbs — `fulcrum auth *` and `fulcrum flags *`
  - 01-foundation-reset/issues/11-web-login-signup-logout-pages.md: integration-review; deps=01-foundation-reset/issues/09-auth-trpc-procedures-and-org-management.md; tests=tests/auth/login.spec.ts ; src/web/tests/e2e/auth-login.spec.ts; title=Web login, signup, and logout pages
  - 01-foundation-reset/issues/12-web-invitation-accept-and-user-management-ui.md: integration-review; deps=01-foundation-reset/issues/11-web-login-signup-logout-pages.md; tests=tests/trpc/auth.test.ts ; tests/auth/invite.spec.ts ; tests/auth/user-management.spec.ts; title=Web invitation-accept page + admin user-management UI

### B003 01-foundation-reset auth-permissions 3

- Phase: 999
- Status: integration-review
- Risk: high
- Surfaces: auth, inference, notifications, tui, web
- Depends on: B002, B008
- Blocks: B006, B087
- Frozen by active gate: yes
- Write set:
  - src/auth/**
  - src/web/src/routes/auth/**
  - tests/auth/**
- Issues:
  - 01-foundation-reset/issues/13-passkey-enrollment-and-login-flow.md: completed; deps=01-foundation-reset/issues/11-web-login-signup-logout-pages.md; tests=tests/auth/passkey.spec.ts ; tests/auth/passkey-unit.test.ts; title=Passkey enrollment + passkey login flow (WebAuthn via Better-Auth passkey plugin)
  - 01-foundation-reset/issues/14-saas-auth-gated-oauth-and-email-otp.md: integration-review; deps=01-foundation-reset/issues/13-passkey-enrollment-and-login-flow.md; tests=tests/auth/saas-auth.test.ts; title=`saas-auth` flag — OAuth providers, magic-link, email OTP (shipped + gated)
  - 01-foundation-reset/issues/15-tui-base-shell-and-auth-flags-screens.md: integration-review; deps=01-foundation-reset/issues/10-cli-auth-and-flags-verbs.md,01-foundation-reset/issues/07-feature-flag-registry.md; tests=tests/tui/smoke.test.ts ; src/tui/testing/fake-tty.ts; title=OpenTUI base shell + auth screen + feature-flags screen

### B004 01-foundation-reset auth-permissions 4

- Phase: 999
- Status: integration-review
- Risk: high
- Surfaces: permissions
- Depends on: B001, B007
- Blocks: B006
- Frozen by active gate: yes
- Write set:
  - src/permissions/**
  - src/trpc/middleware.ts
  - tests/permissions/**
- Issues:
  - 01-foundation-reset/issues/16-casbin-policies-gated-flag.md: integration-review; deps=01-foundation-reset/issues/09-auth-trpc-procedures-and-org-management.md,01-foundation-reset/issues/03-composite-indexes-and-flag-stub-tables.md; tests=tests/permissions/casbin-enforcer.test.ts ; tests/permissions/casbin-adapter.test.ts; title=`casbin-policies` flag — node-casbin in-process ABAC integration via FulcrumCasbinAdapter (shipped + gated)

### B005 01-foundation-reset cli-surface

- Phase: 999
- Status: completed
- Risk: medium
- Surfaces: cli, orchestration
- Depends on: B001
- Blocks: B002
- Frozen by active gate: yes
- Write set:
  - src/cli/**
  - tests/cli/**
- Issues:
  - 01-foundation-reset/issues/08-binary-entrypoint-scaffold.md: completed; deps=01-foundation-reset/issues/06-trpc-core-router-and-permission-middleware.md; tests=tests/cli/entrypoint.test.ts ; tests/cli/build.test.ts; title=`fulcrum` single-binary entrypoint scaffold with subcommand dispatcher

### B006 01-foundation-reset quality-gate

- Phase: 999
- Status: integration-review
- Risk: low
- Surfaces: general
- Depends on: B003, B004, B008
- Blocks: B094, B104
- Frozen by active gate: no
- Write set:
  - 01-foundation-reset/**
- Issues:
  - 01-foundation-reset/issues/18-test-infrastructure-baseline-and-ci.md: integration-review; deps=01-foundation-reset/issues/15-tui-base-shell-and-auth-flags-screens.md,01-foundation-reset/issues/14-saas-auth-gated-oauth-and-email-otp.md,01-foundation-reset/issues/16-casbin-policies-gated-flag.md,01-foundation-reset/issues/17-zod-schemas-and-trpc-domain-stubs.md; tests=src/server/trpc/**/*.test.ts ; src/flags/**/*.test.ts ; src/auth/**/*.test.ts ; src/db/entities/**/*.test.ts ; tests/db/**/*.test.ts ; tests/trpc/**/*.test.ts ; tests/flags/**/*.test.ts ; tests/init/**/*.test.ts ; tests/auth/*.spec.ts ; tests/helpers/ ; src/test-utils/; title=Test infrastructure baseline — Vitest + Bun test + Playwright + `bun run ci` gate

### B008 01-foundation-reset schema-contract 2

- Phase: 999
- Status: integration-review
- Risk: high
- Surfaces: api, schema, web
- Depends on: B001, B007
- Blocks: B001, B003, B006, B099
- Frozen by active gate: yes
- Write set:
  - src/db/entities/**
  - src/db/migrations/**
  - tests/db/migrations/**
- Issues:
  - 01-foundation-reset/issues/04-local-org-seed-and-init.md: integration-review; deps=01-foundation-reset/issues/01-schema-auth-migration.md; tests=tests/init/seed.test.ts ; tests/cli/init.test.ts; title=Synthetic local-org seed + `fulcrum init` bootstrap
  - 01-foundation-reset/issues/07-feature-flag-registry.md: integration-review; deps=01-foundation-reset/issues/06-trpc-core-router-and-permission-middleware.md; tests=tests/flags/registry.test.ts ; tests/trpc/flags.test.ts ; tests/cli/flags.test.ts; title=Feature-flag registry — env-var + entity-backed override + tRPC procedures
  - 01-foundation-reset/issues/17-zod-schemas-and-trpc-domain-stubs.md: integration-review; deps=01-foundation-reset/issues/06-trpc-core-router-and-permission-middleware.md; tests=tests/trpc/stubs.test.ts ; tests/types/trpc-compile.test.ts; title=Zod schema folder + tRPC domain stub routers for all subsequent pillars

### B010 02-inference-sidecar api-contract 1

- Phase: 999
- Status: mixed
- Risk: medium
- Surfaces: api, cli, inference, tui, web
- Depends on: B012, B013
- Blocks: B012, B013, B016
- Frozen by active gate: yes
- Write set:
  - src/server/trpc/routers/**
  - src/trpc/**
  - tests/trpc/**
- Issues:
  - 02-inference-sidecar/issues/04-trpc-procedures-and-health-surface.md: completed; deps=02-inference-sidecar/issues/02-ts-client-and-lifecycle.md; tests=bun test tests/trpc/<focused>.test.ts; title=tRPC `inference.*` procedures + `health()` three-surface parity
  - 02-inference-sidecar/issues/09-classify-and-tokenize.md: ready-for-agent; deps=02-inference-sidecar/issues/05-embed-operation.md; tests=bun test tests/trpc/<focused>.test.ts; title=`classify()` + `tokenize()` operations — CLI + tRPC + web debug panel
  - 02-inference-sidecar/issues/11-per-feature-backend-routing-config.md: ready-for-agent; deps=02-inference-sidecar/issues/10-ts-backend-abstraction.md; tests=bun test tests/db/migrations/<focused>.test.ts; title=Per-feature backend routing config — web settings + CLI + tRPC

### B011 02-inference-sidecar api-contract 2

- Phase: 999
- Status: ready-for-agent
- Risk: high
- Surfaces: api, inference
- Depends on: B013
- Blocks: B016
- Frozen by active gate: yes
- Write set:
  - src/server/trpc/routers/**
  - src/trpc/**
  - tests/trpc/**
- Issues:
  - 02-inference-sidecar/issues/12-external-llm-provider-flag.md: ready-for-agent; deps=02-inference-sidecar/issues/10-ts-backend-abstraction.md; tests=bun test tests/auth/<focused>.test.ts; title=`external-llm-provider` flag — URL + API key wire-up gated

### B012 02-inference-sidecar cli-surface

- Phase: 999
- Status: implemented
- Risk: medium
- Surfaces: cli, inference, orchestration, tui, web
- Depends on: B010, B013, B014, B015
- Blocks: B010, B015, B096
- Frozen by active gate: yes
- Write set:
  - src/cli/**
  - tests/cli/**
- Issues:
  - 02-inference-sidecar/issues/02-ts-client-and-lifecycle.md: completed; deps=02-inference-sidecar/issues/01-cargo-workspace-scaffold.md; tests=bun test tests/db/migrations/<focused>.test.ts; title=TS client + auto-spawn lifecycle + `fulcrum inference start|status|stop`
  - 02-inference-sidecar/issues/05-embed-operation.md: implemented; deps=02-inference-sidecar/issues/03-inference-cache-schema.md,02-inference-sidecar/issues/04-trpc-procedures-and-health-surface.md; tests=bun test tests/db/migrations/<focused>.test.ts; title=`embed()` operation — fastembed-rs crate + cache + CLI + web test page
  - 02-inference-sidecar/issues/07-generate-operation.md: ready-for-agent; deps=02-inference-sidecar/issues/06-models-registry-pull-list-rm.md; tests=bun test tests/db/migrations/<focused>.test.ts; title=`generate()` operation — candle crate + gen cache + CLI + web debug panel

### B013 02-inference-sidecar inference

- Phase: 999
- Status: implemented
- Risk: medium
- Surfaces: inference
- Depends on: B010, B015
- Blocks: B010, B011, B012
- Frozen by active gate: no
- Write set:
  - inference/**
  - src/cli/inference*
  - src/inference/**
- Issues:
  - 02-inference-sidecar/issues/06-models-registry-pull-list-rm.md: implemented; deps=02-inference-sidecar/issues/03-inference-cache-schema.md,02-inference-sidecar/issues/04-trpc-procedures-and-health-surface.md; tests=bun test tests/db/migrations/<focused>.test.ts; title=Models registry — `fulcrum inference models pull|list|rm` + auto-download on first use
  - 02-inference-sidecar/issues/10-ts-backend-abstraction.md: ready-for-agent; deps=02-inference-sidecar/issues/04-trpc-procedures-and-health-surface.md; tests=bun test tests/db/migrations/<focused>.test.ts; title=TS backend abstraction — embedded / ollama / lm-studio / openai-compatible

### B015 02-inference-sidecar schema-contract

- Phase: 999
- Status: mixed
- Risk: high
- Surfaces: inference, schema
- Depends on: B012, B014
- Blocks: B012, B013
- Frozen by active gate: yes
- Write set:
  - src/db/entities/**
  - src/db/migrations/**
  - tests/db/migrations/**
- Issues:
  - 02-inference-sidecar/issues/03-inference-cache-schema.md: completed; deps=02-inference-sidecar/issues/01-cargo-workspace-scaffold.md; tests=bun test tests/db/migrations/<focused>.test.ts; title=Inference cache entities + migration class + PGlite embedding properties
  - 02-inference-sidecar/issues/08-structured-output.md: ready-for-agent; deps=02-inference-sidecar/issues/07-generate-operation.md; tests=bun test tests/db/migrations/<focused>.test.ts; title=Structured output — grammar-constrained generation via JSON Schema

### B016 02-inference-sidecar tui-surface

- Phase: 999
- Status: ready-for-agent
- Risk: medium
- Surfaces: inference, tui, web
- Depends on: B010, B011
- Blocks: B093
- Frozen by active gate: yes
- Write set:
  - src/tui/**
  - tests/tui/**
- Issues:
  - 02-inference-sidecar/issues/13-web-inference-settings-page.md: ready-for-agent; deps=02-inference-sidecar/issues/09-classify-and-tokenize.md,02-inference-sidecar/issues/11-per-feature-backend-routing-config.md,02-inference-sidecar/issues/12-external-llm-provider-flag.md; tests=bun test tests/trpc/<focused>.test.ts; title=Web inference settings page — full `+page.svelte` with all panels
  - 02-inference-sidecar/issues/14-tui-inference-dashboard.md: ready-for-agent; deps=02-inference-sidecar/issues/13-web-inference-settings-page.md; tests=bun test tests/trpc/<focused>.test.ts; title=TUI inference dashboard — backend status, model list, in-flight ops, throughput

### B017 03-symphony-orchestration api-contract

- Phase: 999
- Status: ready-for-agent
- Risk: high
- Surfaces: api, notifications, orchestration
- Depends on: B022, B026
- Blocks: B018, B025, B026
- Frozen by active gate: yes
- Write set:
  - src/server/trpc/routers/**
  - src/trpc/**
  - tests/trpc/**
- Issues:
  - 03-symphony-orchestration/issues/17-api-trpc-procedures.md: ready-for-agent; deps=03-symphony-orchestration/issues/11-dispatch-loop-happy-path.md,03-symphony-orchestration/issues/13-graphile-worker-poll-registration.md; tests=bun test tests/db/migrations/<focused>.test.ts; title=API: tRPC orchestration.* procedures + OpenAPI gating
  - 03-symphony-orchestration/issues/22-gated-sse-ssh-http-extensions.md: ready-for-agent; deps=03-symphony-orchestration/issues/17-api-trpc-procedures.md,03-symphony-orchestration/issues/18-web-runs-board.md; tests=bun test tests/db/migrations/<focused>.test.ts; title=Gated: SSE real-time push + SSH remote workspace + HTTP status API extensions

### B018 03-symphony-orchestration cli-surface

- Phase: 999
- Status: ready-for-agent
- Risk: medium
- Surfaces: cli, orchestration
- Depends on: B017
- Blocks: None
- Frozen by active gate: yes
- Write set:
  - src/cli/**
  - tests/cli/**
- Issues:
  - 03-symphony-orchestration/issues/19-cli-surface-parity.md: ready-for-agent; deps=03-symphony-orchestration/issues/17-api-trpc-procedures.md; tests=bun test tests/db/migrations/<focused>.test.ts; title=CLI: fulcrum symphony * — full command surface with --json parity

### B019 03-symphony-orchestration orchestration

- Phase: 999
- Status: mixed
- Risk: high
- Surfaces: orchestration, platform
- Depends on: B022, B024
- Blocks: B021, B022, B023, B026
- Frozen by active gate: no
- Write set:
  - docs/symphony-conformance.md
  - src/orchestration/**
  - tests/symphony/**
- Issues:
  - 03-symphony-orchestration/issues/04-tracker-fetch-candidate-issues.md: completed; deps=03-symphony-orchestration/issues/02-schema-workflow-definitions.md,03-symphony-orchestration/issues/03-schema-agent-runs-symphony-columns.md; tests=bun test tests/db/migrations/<focused>.test.ts; title=Tracker adapter: fetchCandidateIssues
  - 03-symphony-orchestration/issues/05-tracker-fetch-by-states.md: completed; deps=03-symphony-orchestration/issues/03-schema-agent-runs-symphony-columns.md; tests=bun test tests/db/migrations/<focused>.test.ts; title=Tracker adapter: fetchIssuesByStates + fetchIssueStatesByIds
  - 03-symphony-orchestration/issues/12-otel-telemetry.md: ready-for-agent; deps=03-symphony-orchestration/issues/11-dispatch-loop-happy-path.md; tests=bun test tests/db/migrations/<focused>.test.ts; title=OTel spans on every state transition + no-op when exporter unset

### B020 03-symphony-orchestration quality-gate

- Phase: 999
- Status: mixed
- Risk: medium
- Surfaces: docs, orchestration, repos
- Depends on: B026
- Blocks: B023
- Frozen by active gate: no
- Write set:
  - docs/symphony-conformance.md
  - src/orchestration/**
  - tests/symphony/**
- Issues:
  - 03-symphony-orchestration/issues/01-submodule-spec-pin.md: completed; deps=None; tests=bun test tests/db/migrations/<focused>.test.ts; title=Vendor openai/symphony as git submodule + conformance doc skeleton
  - 03-symphony-orchestration/issues/15-conformance-trace-doc-hash-gate.md: ready-for-agent; deps=03-symphony-orchestration/issues/14-conformance-test-suite.md; tests=bun test tests/db/migrations/<focused>.test.ts; title=Conformance trace doc + hash gate: gen-conformance-trace.ts + pre-commit hook

### B021 03-symphony-orchestration runtime-loop 1

- Phase: 999
- Status: implemented
- Risk: medium
- Surfaces: orchestration
- Depends on: B019, B024, B026
- Blocks: B022
- Frozen by active gate: no
- Write set:
  - docs/symphony-conformance.md
  - src/orchestration/**
  - tests/symphony/**
- Issues:
  - 03-symphony-orchestration/issues/06-state-machine-claim-lock.md: implemented; deps=03-symphony-orchestration/issues/03-schema-agent-runs-symphony-columns.md,03-symphony-orchestration/issues/04-tracker-fetch-candidate-issues.md; tests=bun test tests/db/migrations/<focused>.test.ts; title=State machine: Unclaimed → Claimed with optimistic lock + events row
  - 03-symphony-orchestration/issues/07-workspace-management.md: completed; deps=03-symphony-orchestration/issues/03-schema-agent-runs-symphony-columns.md; tests=bun test tests/db/migrations/<focused>.test.ts; title=Workspace management: create-on-claim, sanitize key, destroy-on-release
  - 03-symphony-orchestration/issues/09-lifecycle-hooks.md: implemented; deps=03-symphony-orchestration/issues/07-workspace-management.md,03-symphony-orchestration/issues/08-prompt-template-renderer.md; tests=bun test tests/db/migrations/<focused>.test.ts; title=Lifecycle hooks: before_run / after_run / on_failure / on_cancel with per-hook timeout

### B022 03-symphony-orchestration runtime-loop 2

- Phase: 999
- Status: in-progress
- Risk: medium
- Surfaces: orchestration
- Depends on: B019, B021, B024, B026
- Blocks: B017, B019, B026
- Frozen by active gate: no
- Write set:
  - docs/symphony-conformance.md
  - src/orchestration/**
  - tests/symphony/**
- Issues:
  - 03-symphony-orchestration/issues/10-retry-backoff-stall-detection.md: in-progress; deps=03-symphony-orchestration/issues/03-schema-agent-runs-symphony-columns.md; tests=bun test tests/db/migrations/<focused>.test.ts; title=Retry/backoff formula + stall detection engine
  - 03-symphony-orchestration/issues/11-dispatch-loop-happy-path.md: ready-for-agent; deps=03-symphony-orchestration/issues/04-tracker-fetch-candidate-issues.md,03-symphony-orchestration/issues/05-tracker-fetch-by-states.md,03-symphony-orchestration/issues/06-state-machine-claim-lock.md,03-symphony-orchestration/issues/07-workspace-management.md,03-symphony-orchestration/issues/08-prompt-template-renderer.md,03-symphony-orchestration/issues/09-lifecycle-hooks.md,03-symphony-orchestration/issues/10-retry-backoff-stall-detection.md; tests=bun test tests/db/migrations/<focused>.test.ts; title=Dispatch loop: Unclaimed → Running → Released happy-path + OTel spans
  - 03-symphony-orchestration/issues/13-graphile-worker-poll-registration.md: ready-for-agent; deps=03-symphony-orchestration/issues/11-dispatch-loop-happy-path.md; tests=bun test tests/db/migrations/<focused>.test.ts; title=graphile-worker poll loop registration + stall scanner wiring

### B023 03-symphony-orchestration runtime-loop 3

- Phase: 999
- Status: ready-for-agent
- Risk: high
- Surfaces: orchestration, repos
- Depends on: B019, B020
- Blocks: None
- Frozen by active gate: no
- Write set:
  - docs/symphony-conformance.md
  - src/orchestration/**
  - tests/symphony/**
- Issues:
  - 03-symphony-orchestration/issues/16-daily-sync-job.md: ready-for-agent; deps=03-symphony-orchestration/issues/01-submodule-spec-pin.md,03-symphony-orchestration/issues/15-conformance-trace-doc-hash-gate.md; tests=bun test tests/db/migrations/<focused>.test.ts; title=fulcrum symphony sync --daily: submodule update + drift report + conformance run
  - 03-symphony-orchestration/issues/21-gated-linear-connector.md: ready-for-agent; deps=03-symphony-orchestration/issues/04-tracker-fetch-candidate-issues.md,03-symphony-orchestration/issues/05-tracker-fetch-by-states.md; tests=bun test tests/db/migrations/<focused>.test.ts; title=Gated: Linear connector — bidirectional PGlite ↔ Linear sync (connector-linear flag)

### B025 03-symphony-orchestration tui-surface

- Phase: 999
- Status: ready-for-agent
- Risk: medium
- Surfaces: orchestration, tui, web
- Depends on: B017
- Blocks: None
- Frozen by active gate: yes
- Write set:
  - src/tui/**
  - tests/tui/**
- Issues:
  - 03-symphony-orchestration/issues/20-tui-orchestration-pane.md: ready-for-agent; deps=03-symphony-orchestration/issues/17-api-trpc-procedures.md; tests=bun test tests/db/migrations/<focused>.test.ts; title=TUI: Orchestration pane — live runs table, state filter tabs, detail overlay

### B026 03-symphony-orchestration web-surface

- Phase: 999
- Status: mixed
- Risk: medium
- Surfaces: docs, orchestration, web
- Depends on: B017, B019, B022, B024
- Blocks: B017, B020, B021, B022, B093
- Frozen by active gate: yes
- Write set:
  - src/web/src/lib/components/**
  - src/web/src/routes/**
  - src/web/tests/**
- Issues:
  - 03-symphony-orchestration/issues/08-prompt-template-renderer.md: completed; deps=03-symphony-orchestration/issues/02-schema-workflow-definitions.md; tests=bun test tests/db/migrations/<focused>.test.ts; title=Prompt template renderer: liquidjs strict mode + WORKFLOW.md loader
  - 03-symphony-orchestration/issues/14-conformance-test-suite.md: ready-for-agent; deps=03-symphony-orchestration/issues/11-dispatch-loop-happy-path.md,03-symphony-orchestration/issues/12-otel-telemetry.md; tests=src/orchestration/__tests__/symphony-conformance.test.ts; title=Conformance test suite: one test per REQUIRED SPEC.md item, zero todo
  - 03-symphony-orchestration/issues/18-web-runs-board.md: ready-for-agent; deps=03-symphony-orchestration/issues/17-api-trpc-procedures.md; tests=bun test tests/db/migrations/<focused>.test.ts; title=Web: /orchestration dashboard + /projects/[id]/runs board + workflow editor

### B027 04-sandcastle-wrapper api-contract

- Phase: 999
- Status: ready-for-agent
- Risk: medium
- Surfaces: api, runtime, web
- Depends on: B028
- Blocks: B035
- Frozen by active gate: yes
- Write set:
  - src/server/trpc/routers/**
  - src/trpc/**
  - tests/trpc/**
- Issues:
  - 04-sandcastle-wrapper/issues/16-web-api-surfaces.md: ready-for-agent; deps=04-sandcastle-wrapper/issues/15-fulcrum-agents-runs-cli-doctor.md; tests=bun test tests/db/migrations/<focused>.test.ts; title=Web + API surfaces: agents registry page + run detail tabs

### B028 04-sandcastle-wrapper cli-surface

- Phase: 999
- Status: ready-for-agent
- Risk: medium
- Surfaces: cli, docs, orchestration, platform, runtime
- Depends on: B032, B033
- Blocks: B027
- Frozen by active gate: yes
- Write set:
  - src/cli/**
  - tests/cli/**
- Issues:
  - 04-sandcastle-wrapper/issues/08-remaining-four-profiles.md: ready-for-agent; deps=04-sandcastle-wrapper/issues/05-agent-profile-type-registry.md; tests=bun test tests/db/migrations/<focused>.test.ts; title=pi, copilot, opencode, gemini-cli agent profiles
  - 04-sandcastle-wrapper/issues/15-fulcrum-agents-runs-cli-doctor.md: ready-for-agent; deps=04-sandcastle-wrapper/issues/12-artifact-harvest.md; tests=bun test tests/auth/<focused>.test.ts; title=fulcrum agents CLI + fulcrum runs CLI + doctor orchestration checks

### B029 04-sandcastle-wrapper gated-integration

- Phase: 999
- Status: ready-for-agent
- Risk: high
- Surfaces: docs, runtime
- Depends on: B033
- Blocks: None
- Frozen by active gate: no
- Write set:
  - src/artifacts/**
  - src/sandcastle/**
  - tests/orchestration/**
- Issues:
  - 04-sandcastle-wrapper/issues/13-gated-sandbox-providers.md: ready-for-agent; deps=04-sandcastle-wrapper/issues/09-sandbox-runner-nosandbox-happy-path.md; tests=bun test tests/db/migrations/<focused>.test.ts; title=Gated sandbox providers: Docker, Podman, Vercel, Daytona, Modal, E2B

### B030 04-sandcastle-wrapper orchestration

- Phase: 999
- Status: ready-for-agent
- Risk: medium
- Surfaces: orchestration, runtime
- Depends on: B032
- Blocks: B033
- Frozen by active gate: no
- Write set:
  - docs/symphony-conformance.md
  - src/orchestration/**
  - tests/symphony/**
- Issues:
  - 04-sandcastle-wrapper/issues/11-transcript-diff-capture.md: ready-for-agent; deps=04-sandcastle-wrapper/issues/10-iteration-loop-hard-cap.md; tests=bun test tests/db/migrations/<focused>.test.ts; title=Transcript JSONL capture + workspace diff capture

### B031 04-sandcastle-wrapper quality-gate

- Phase: 999
- Status: ready-for-agent
- Risk: medium
- Surfaces: runtime
- Depends on: B032
- Blocks: None
- Frozen by active gate: no
- Write set:
  - src/artifacts/**
  - src/sandcastle/**
  - tests/orchestration/**
- Issues:
  - 04-sandcastle-wrapper/issues/06-claude-code-profile.md: ready-for-agent; deps=04-sandcastle-wrapper/issues/05-agent-profile-type-registry.md; tests=bun test tests/db/migrations/<focused>.test.ts; title=claude-code agent profile + fulcrum agents test claude-code
  - 04-sandcastle-wrapper/issues/07-codex-profile.md: ready-for-agent; deps=04-sandcastle-wrapper/issues/05-agent-profile-type-registry.md; tests=bun test tests/auth/<focused>.test.ts; title=codex agent profile + fulcrum agents test codex

### B032 04-sandcastle-wrapper runtime

- Phase: 999
- Status: mixed
- Risk: medium
- Surfaces: platform, runtime
- Depends on: B033, B034
- Blocks: B028, B030, B031, B033, B034
- Frozen by active gate: no
- Write set:
  - src/artifacts/**
  - src/sandcastle/**
  - tests/orchestration/**
- Issues:
  - 04-sandcastle-wrapper/issues/01-sandcastle-dep-effect-singleton.md: completed; deps=None; tests=bun test tests/trpc/<focused>.test.ts; title=Sandcastle dep install + Effect singleton enforcement
  - 04-sandcastle-wrapper/issues/05-agent-profile-type-registry.md: ready-for-agent; deps=04-sandcastle-wrapper/issues/04-agent-profiles-migration.md; tests=bun test tests/db/migrations/<focused>.test.ts; title=AgentProfile type + registry with UnknownAgentError
  - 04-sandcastle-wrapper/issues/10-iteration-loop-hard-cap.md: ready-for-agent; deps=04-sandcastle-wrapper/issues/09-sandbox-runner-nosandbox-happy-path.md; tests=bun test tests/cli/<focused>.test.ts; title=Iteration loop + hard cap enforcement

### B033 04-sandcastle-wrapper runtime-loop

- Phase: 999
- Status: ready-for-agent
- Risk: high
- Surfaces: orchestration, runtime
- Depends on: B030, B032
- Blocks: B028, B029, B032
- Frozen by active gate: no
- Write set:
  - docs/symphony-conformance.md
  - src/artifacts/**
  - src/orchestration/**
  - src/sandcastle/**
  - tests/orchestration/**
  - tests/symphony/**
- Issues:
  - 04-sandcastle-wrapper/issues/09-sandbox-runner-nosandbox-happy-path.md: ready-for-agent; deps=04-sandcastle-wrapper/issues/05-agent-profile-type-registry.md; tests=bun test tests/cli/<focused>.test.ts; title=sandbox-runner.ts noSandbox happy path + worktree lifecycle
  - 04-sandcastle-wrapper/issues/12-artifact-harvest.md: ready-for-agent; deps=04-sandcastle-wrapper/issues/11-transcript-diff-capture.md; tests=bun test tests/db/migrations/<focused>.test.ts; title=Artifact harvest via copyFileOut + edges row
  - 04-sandcastle-wrapper/issues/14-token-budget-session-resume.md: ready-for-agent; deps=04-sandcastle-wrapper/issues/10-iteration-loop-hard-cap.md; tests=bun test tests/auth/<focused>.test.ts; title=Token budget tracking (gated) + session resumption on retry (gated)

### B034 04-sandcastle-wrapper schema-contract

- Phase: 999
- Status: mixed
- Risk: high
- Surfaces: runtime, schema
- Depends on: B032
- Blocks: B032, B092
- Frozen by active gate: yes
- Write set:
  - src/db/entities/**
  - src/db/migrations/**
  - tests/db/migrations/**
- Issues:
  - 04-sandcastle-wrapper/issues/02-agent-runs-schema-migration.md: completed; deps=04-sandcastle-wrapper/issues/01-sandcastle-dep-effect-singleton.md; tests=bun test tests/db/migrations/<focused>.test.ts; title=agent_runs schema migration — Sandcastle columns
  - 04-sandcastle-wrapper/issues/03-artifacts-edges-migration.md: completed; deps=04-sandcastle-wrapper/issues/02-agent-runs-schema-migration.md; tests=bun test tests/db/migrations/<focused>.test.ts; title=artifacts + edges tables migration
  - 04-sandcastle-wrapper/issues/04-agent-profiles-migration.md: ready-for-agent; deps=04-sandcastle-wrapper/issues/03-artifacts-edges-migration.md; tests=bun test tests/db/migrations/<focused>.test.ts; title=agent_profiles table migration + test-result persistence

### B035 04-sandcastle-wrapper tui-surface

- Phase: 999
- Status: ready-for-agent
- Risk: medium
- Surfaces: runtime, tui, web
- Depends on: B027
- Blocks: None
- Frozen by active gate: yes
- Write set:
  - src/tui/**
  - tests/tui/**
- Issues:
  - 04-sandcastle-wrapper/issues/17-tui-agents-runs-panels.md: ready-for-agent; deps=04-sandcastle-wrapper/issues/16-web-api-surfaces.md; tests=bun test tests/auth/<focused>.test.ts; title=TUI agents pane + runs detail overlay

### B045 06-tasks-and-scrum api-contract 2

- Phase: 999
- Status: ready-for-agent
- Risk: high
- Surfaces: api, repos, tasks
- Depends on: B044, B050, B052
- Blocks: None
- Frozen by active gate: yes
- Write set:
  - src/server/trpc/routers/**
  - src/trpc/**
  - tests/trpc/**
- Issues:
  - 06-tasks-and-scrum/issues/23-public-api-gated.md: ready-for-agent; deps=06-tasks-and-scrum/issues/07-task-crud-baseline.md,06-tasks-and-scrum/issues/17-sprints-trpc-crud.md,06-tasks-and-scrum/issues/21-velocity-and-cycle-time-reports.md; tests=bun test tests/db/migrations/<focused>.test.ts; title=Gated public REST/OpenAPI for tasks + sprints + reports
  - 06-tasks-and-scrum/issues/24-connector-jira-gated.md: ready-for-agent; deps=06-tasks-and-scrum/issues/06-connector-framework-schema.md; tests=bun test tests/db/migrations/<focused>.test.ts; title=Gated connector-jira — Jira REST adapter (one-way pull)
  - 06-tasks-and-scrum/issues/26-connector-github-issues-gated.md: ready-for-agent; deps=06-tasks-and-scrum/issues/06-connector-framework-schema.md; tests=bun test tests/db/migrations/<focused>.test.ts; title=Gated connector-github-issues — GitHub REST adapter (one-way pull)

### B051 06-tasks-and-scrum tasks 1

- Phase: 999
- Status: ready-for-agent
- Risk: low
- Surfaces: tasks
- Depends on: B044, B050, B053
- Blocks: B052, B053
- Frozen by active gate: no
- Write set:
  - src/tasks/**
  - src/web/src/routes/boards/**
  - src/web/src/routes/projects/**
- Issues:
  - 06-tasks-and-scrum/issues/08-subtasks-and-dependencies.md: ready-for-agent; deps=06-tasks-and-scrum/issues/07-task-crud-baseline.md; tests=bun test tests/db/migrations/<focused>.test.ts; title=Subtasks + parent tree + dependencies (blocks/blocked-by)
  - 06-tasks-and-scrum/issues/12-table-list-views.md: ready-for-agent; deps=06-tasks-and-scrum/issues/07-task-crud-baseline.md,06-tasks-and-scrum/issues/04-saved-views-schema.md; tests=bun test tests/db/migrations/<focused>.test.ts; title=Table view (TanStack Table) + List view (TanStack Virtual)
  - 06-tasks-and-scrum/issues/13-calendar-view.md: ready-for-agent; deps=06-tasks-and-scrum/issues/07-task-crud-baseline.md,06-tasks-and-scrum/issues/04-saved-views-schema.md; tests=bun test tests/db/migrations/<focused>.test.ts; title=Calendar view — due-date grid + drag-to-reschedule
  - 06-tasks-and-scrum/issues/18-sprint-planning-board.md: ready-for-agent; deps=06-tasks-and-scrum/issues/17-sprints-trpc-crud.md,06-tasks-and-scrum/issues/11-kanban-board-view.md; tests=bun test tests/trpc/<focused>.test.ts; title=Sprint planning board — drag from backlog, capacity preview
  - 06-tasks-and-scrum/issues/20-burndown-chart.md: ready-for-agent; deps=06-tasks-and-scrum/issues/05-metrics-cache-schema.md,06-tasks-and-scrum/issues/17-sprints-trpc-crud.md; tests=bun test tests/db/migrations/<focused>.test.ts; title=Burndown chart — LayerChart, ideal line vs actual, metrics_cache

### B052 06-tasks-and-scrum tasks 2

- Phase: 999
- Status: ready-for-agent
- Risk: low
- Surfaces: repos, tasks
- Depends on: B050, B051
- Blocks: B045
- Frozen by active gate: no
- Write set:
  - src/tasks/**
  - src/web/src/routes/boards/**
  - src/web/src/routes/projects/**
- Issues:
  - 06-tasks-and-scrum/issues/21-velocity-and-cycle-time-reports.md: ready-for-agent; deps=06-tasks-and-scrum/issues/05-metrics-cache-schema.md,06-tasks-and-scrum/issues/20-burndown-chart.md; tests=bun test tests/db/migrations/<focused>.test.ts; title=Velocity + cycle-time + throughput + WIP + CFD reports

### B053 06-tasks-and-scrum web-surface

- Phase: 999
- Status: ready-for-agent
- Risk: low
- Surfaces: tasks, web
- Depends on: B044, B050, B051
- Blocks: B051
- Frozen by active gate: yes
- Write set:
  - src/web/src/lib/components/**
  - src/web/src/routes/**
  - src/web/tests/**
- Issues:
  - 06-tasks-and-scrum/issues/11-kanban-board-view.md: ready-for-agent; deps=06-tasks-and-scrum/issues/07-task-crud-baseline.md,06-tasks-and-scrum/issues/04-saved-views-schema.md; tests=bun test tests/db/migrations/<focused>.test.ts; title=Kanban board view — DnD, swimlanes, optimistic UI
  - 06-tasks-and-scrum/issues/14-gantt-timeline-view.md: ready-for-agent; deps=06-tasks-and-scrum/issues/07-task-crud-baseline.md,06-tasks-and-scrum/issues/08-subtasks-and-dependencies.md; tests=bun test tests/db/migrations/<focused>.test.ts; title=Gantt / Timeline view — svelte-gantt, dependency arrows, drag reschedule
  - 06-tasks-and-scrum/issues/16-saved-views-crud-ui.md: ready-for-agent; deps=06-tasks-and-scrum/issues/04-saved-views-schema.md,06-tasks-and-scrum/issues/07-task-crud-baseline.md; tests=bun test tests/db/migrations/<focused>.test.ts; title=Saved views CRUD + filter form + share scope
  - 06-tasks-and-scrum/issues/19-active-sprint-board.md: ready-for-agent; deps=06-tasks-and-scrum/issues/17-sprints-trpc-crud.md,06-tasks-and-scrum/issues/11-kanban-board-view.md; tests=bun test tests/trpc/<focused>.test.ts; title=Active sprint board — scoped Kanban, header stats, quick-add

### B054 07-docs-editor-collab api-contract 1

- Phase: 999
- Status: ready-for-agent
- Risk: high
- Surfaces: api, docs, platform, tui
- Depends on: B061, B062, B064
- Blocks: B055, B063, B065
- Frozen by active gate: yes
- Write set:
  - src/server/trpc/routers/**
  - src/trpc/**
  - tests/trpc/**
- Issues:
  - 07-docs-editor-collab/issues/07-wikilink-node-backlinks.md: ready-for-agent; deps=07-docs-editor-collab/issues/02-tiptap-svelte-binding-spike.md,07-docs-editor-collab/issues/05-doc-crud-trpc.md; tests=bun test tests/trpc/<focused>.test.ts; title=Wikilink TipTap NodeView + backlink computation + doc_links tRPC
  - 07-docs-editor-collab/issues/09-comments-threads.md: ready-for-agent; deps=07-docs-editor-collab/issues/02-tiptap-svelte-binding-spike.md,07-docs-editor-collab/issues/05-doc-crud-trpc.md; tests=bun test tests/auth/<focused>.test.ts; title=Comments + selection-anchored threads — doc_comments tRPC + CommentsPanel
  - 07-docs-editor-collab/issues/12-version-history-engine.md: ready-for-agent; deps=07-docs-editor-collab/issues/01-docs-schema-foundation.md,07-docs-editor-collab/issues/05-doc-crud-trpc.md; tests=bun test tests/db/migrations/<focused>.test.ts; title=Version snapshot+delta engine — version-writer, version-reconstructor, diff + restore tRPC

### B055 07-docs-editor-collab api-contract 2

- Phase: 999
- Status: ready-for-agent
- Risk: high
- Surfaces: api, cli, docs, platform, web
- Depends on: B054, B061, B062
- Blocks: B056
- Frozen by active gate: yes
- Write set:
  - src/server/trpc/routers/**
  - src/trpc/**
  - tests/trpc/**
- Issues:
  - 07-docs-editor-collab/issues/15-doc-templates-trpc-ui.md: ready-for-agent; deps=07-docs-editor-collab/issues/01-docs-schema-foundation.md,07-docs-editor-collab/issues/04-doc-template-seeds.md,07-docs-editor-collab/issues/05-doc-crud-trpc.md; tests=bun test tests/db/migrations/<focused>.test.ts; title=Doc templates CRUD — tRPC + Settings UI + New-doc wizard integration
  - 07-docs-editor-collab/issues/19-cli-docs-commands.md: ready-for-agent; deps=07-docs-editor-collab/issues/05-doc-crud-trpc.md,07-docs-editor-collab/issues/12-version-history-engine.md,07-docs-editor-collab/issues/07-wikilink-node-backlinks.md,07-docs-editor-collab/issues/15-doc-templates-trpc-ui.md; tests=bun test tests/db/migrations/<focused>.test.ts; title=CLI docs commands — create / list / tree / show / edit / move / rename / delete / archive / history / restore / backlinks + template + comments
  - 07-docs-editor-collab/issues/24-gated-connector-confluence.md: ready-for-agent; deps=07-docs-editor-collab/issues/01-docs-schema-foundation.md,07-docs-editor-collab/issues/05-doc-crud-trpc.md,07-docs-editor-collab/issues/04-doc-template-seeds.md; tests=bun test tests/db/migrations/<focused>.test.ts; title=Gated: connector-confluence — one-way import from Confluence Cloud REST → docs rows

### B056 07-docs-editor-collab api-contract 3

- Phase: 999
- Status: ready-for-agent
- Risk: high
- Surfaces: api, docs, platform
- Depends on: B055, B061, B062
- Blocks: None
- Frozen by active gate: yes
- Write set:
  - src/server/trpc/routers/**
  - src/trpc/**
  - tests/trpc/**
- Issues:
  - 07-docs-editor-collab/issues/25-gated-connector-notion.md: ready-for-agent; deps=07-docs-editor-collab/issues/01-docs-schema-foundation.md,07-docs-editor-collab/issues/05-doc-crud-trpc.md,07-docs-editor-collab/issues/24-gated-connector-confluence.md; tests=bun test tests/db/migrations/<focused>.test.ts; title=Gated: connector-notion — one-way import from Notion REST API → docs rows

### B057 07-docs-editor-collab docs 1

- Phase: 999
- Status: ready-for-agent
- Risk: high
- Surfaces: docs, notifications, tasks
- Depends on: B062, B064
- Blocks: B059, B062, B065
- Frozen by active gate: no
- Write set:
  - src/docs/**
  - src/web/src/lib/components/markdown/**
  - src/web/src/routes/docs/**
- Issues:
  - 07-docs-editor-collab/issues/06-slash-menu-core-marks-blocks.md: ready-for-agent; deps=07-docs-editor-collab/issues/02-tiptap-svelte-binding-spike.md; tests=bun test tests/trpc/<focused>.test.ts; title=Slash menu + StarterKit core marks/blocks — heading/list/link/code/table/blockquote
  - 07-docs-editor-collab/issues/08-mention-nodes.md: ready-for-agent; deps=07-docs-editor-collab/issues/02-tiptap-svelte-binding-spike.md,07-docs-editor-collab/issues/05-doc-crud-trpc.md; tests=bun test tests/trpc/<focused>.test.ts; title=Mention NodeView — @user / @agent / @task / @run chips + notification event emit
  - 07-docs-editor-collab/issues/11-image-file-attachment.md: ready-for-agent; deps=07-docs-editor-collab/issues/02-tiptap-svelte-binding-spike.md,07-docs-editor-collab/issues/05-doc-crud-trpc.md; tests=bun test tests/trpc/<focused>.test.ts; title=Inline image paste/drag-drop + FileAttachment NodeView — Bun FS upload

### B058 07-docs-editor-collab docs 2

- Phase: 999
- Status: ready-for-agent
- Risk: high
- Surfaces: docs
- Depends on: B062
- Blocks: None
- Frozen by active gate: no
- Write set:
  - src/docs/**
  - src/web/src/lib/components/markdown/**
  - src/web/src/routes/docs/**
- Issues:
  - 07-docs-editor-collab/issues/18-sanitization-pipeline.md: ready-for-agent; deps=07-docs-editor-collab/issues/05-doc-crud-trpc.md; tests=bun test tests/trpc/<focused>.test.ts; title=Sanitization pipeline — safe-by-default HTML render + XSS prevention

### B059 07-docs-editor-collab gated-integration

- Phase: 999
- Status: ready-for-agent
- Risk: high
- Surfaces: docs, inference, repos
- Depends on: B057, B062
- Blocks: None
- Frozen by active gate: no
- Write set:
  - inference/**
  - src/cli/inference*
  - src/inference/**
- Issues:
  - 07-docs-editor-collab/issues/22-gated-embeddings.md: ready-for-agent; deps=07-docs-editor-collab/issues/05-doc-crud-trpc.md,07-docs-editor-collab/issues/16-search-index-hook.md; tests=bun test tests/db/migrations/<focused>.test.ts; title=Gated: embeddings — on-save doc embedding via inference sidecar → docs.embedding vector(384)
  - 07-docs-editor-collab/issues/23-gated-llm-narration.md: ready-for-agent; deps=07-docs-editor-collab/issues/05-doc-crud-trpc.md,07-docs-editor-collab/issues/06-slash-menu-core-marks-blocks.md; tests=bun test tests/trpc/<focused>.test.ts; title=Gated: report-llm-narration — auto exec-summary block on ADR / postmortem / RFC save

### B060 07-docs-editor-collab inference

- Phase: 999
- Status: ready-for-agent
- Risk: high
- Surfaces: docs, inference, runtime
- Depends on: B064
- Blocks: None
- Frozen by active gate: no
- Write set:
  - inference/**
  - src/cli/inference*
  - src/inference/**
- Issues:
  - 07-docs-editor-collab/issues/10-math-mermaid-excalidraw-embeds.md: ready-for-agent; deps=07-docs-editor-collab/issues/02-tiptap-svelte-binding-spike.md; tests=bun test tests/db/migrations/<focused>.test.ts; title=Math (KaTeX) + Mermaid (sandboxed iframe) + Excalidraw (React island) NodeViews

### B062 07-docs-editor-collab schema-contract 2

- Phase: 999
- Status: ready-for-agent
- Risk: high
- Surfaces: api, docs, schema, search
- Depends on: B057, B061, B064
- Blocks: B054, B055, B056, B057, B058, B059, B063, B064, B065
- Frozen by active gate: yes
- Write set:
  - src/db/entities/**
  - src/db/migrations/**
  - tests/db/migrations/**
- Issues:
  - 07-docs-editor-collab/issues/05-doc-crud-trpc.md: ready-for-agent; deps=07-docs-editor-collab/issues/01-docs-schema-foundation.md,07-docs-editor-collab/issues/03-frontmatter-schemas.md; tests=bun test tests/db/migrations/<focused>.test.ts; title=Doc CRUD tRPC procedures — create / read / update / archive / move + search-index upsert
  - 07-docs-editor-collab/issues/16-search-index-hook.md: ready-for-agent; deps=07-docs-editor-collab/issues/01-docs-schema-foundation.md,07-docs-editor-collab/issues/05-doc-crud-trpc.md; tests=bun test tests/db/migrations/<focused>.test.ts; title=Search indexer hook — search_documents upsert on every doc save
  - 07-docs-editor-collab/issues/21-gated-realtime-collab.md: ready-for-agent; deps=07-docs-editor-collab/issues/02-tiptap-svelte-binding-spike.md,07-docs-editor-collab/issues/06-slash-menu-core-marks-blocks.md; tests=bun test tests/db/migrations/<focused>.test.ts; title=Gated: real-time-collab-server — Yjs + Hocuspocus v4 (Bun) + y-indexeddb offline fallback

### B063 07-docs-editor-collab tui-surface

- Phase: 999
- Status: ready-for-agent
- Risk: high
- Surfaces: docs, tui, web
- Depends on: B054, B062
- Blocks: None
- Frozen by active gate: yes
- Write set:
  - src/tui/**
  - tests/tui/**
- Issues:
  - 07-docs-editor-collab/issues/20-tui-doc-reader-editor.md: ready-for-agent; deps=07-docs-editor-collab/issues/05-doc-crud-trpc.md,07-docs-editor-collab/issues/12-version-history-engine.md,07-docs-editor-collab/issues/07-wikilink-node-backlinks.md; tests=bun test tests/auth/<focused>.test.ts; title=TUI docs panel — tree + reader + edit mode + backlinks + history + scope toggle

### B064 07-docs-editor-collab web-surface 1

- Phase: 999
- Status: mixed
- Risk: high
- Surfaces: docs, web
- Depends on: B061, B062
- Blocks: B054, B057, B060, B062, B065
- Frozen by active gate: yes
- Write set:
  - src/web/src/lib/components/**
  - src/web/src/routes/**
  - src/web/tests/**
- Issues:
  - 07-docs-editor-collab/issues/02-tiptap-svelte-binding-spike.md: completed; deps=None; tests=bun test tests/db/migrations/<focused>.test.ts; title=TipTap v2 + svelte-tiptap baseline spike — Svelte 5 runes compat gate
  - 07-docs-editor-collab/issues/13-frontmatter-form-yaml-ui.md: ready-for-agent; deps=07-docs-editor-collab/issues/02-tiptap-svelte-binding-spike.md,07-docs-editor-collab/issues/03-frontmatter-schemas.md,07-docs-editor-collab/issues/05-doc-crud-trpc.md; tests=bun test tests/db/migrations/<focused>.test.ts; title=Frontmatter form UI + raw YAML toggle — Zod-driven per doc_type
  - 07-docs-editor-collab/issues/14-doc-tree-crud-ui.md: ready-for-agent; deps=07-docs-editor-collab/issues/05-doc-crud-trpc.md; tests=bun test tests/db/migrations/<focused>.test.ts; title=Doc tree CRUD — DocTree.svelte + DnD reorder + breadcrumbs + scope toggle (per-project/global)

### B065 07-docs-editor-collab web-surface 2

- Phase: 999
- Status: ready-for-agent
- Risk: high
- Surfaces: docs, web
- Depends on: B054, B057, B062, B064
- Blocks: None
- Frozen by active gate: yes
- Write set:
  - src/web/src/lib/components/**
  - src/web/src/routes/**
  - src/web/tests/**
- Issues:
  - 07-docs-editor-collab/issues/17-web-routes-read-edit-history.md: ready-for-agent; deps=07-docs-editor-collab/issues/05-doc-crud-trpc.md,07-docs-editor-collab/issues/06-slash-menu-core-marks-blocks.md,07-docs-editor-collab/issues/07-wikilink-node-backlinks.md,07-docs-editor-collab/issues/09-comments-threads.md,07-docs-editor-collab/issues/12-version-history-engine.md,07-docs-editor-collab/issues/13-frontmatter-form-yaml-ui.md,07-docs-editor-collab/issues/14-doc-tree-crud-ui.md; tests=bun test tests/trpc/<focused>.test.ts; title=Web routes assembly — /docs hub, /docs/<slug> read, /docs/<slug>/edit, /docs/<slug>/history, /projects/<id>/docs

### B078 09-repos-git-supervision api-contract

- Phase: 999
- Status: ready-for-agent
- Risk: medium
- Surfaces: api, repos
- Depends on: B082
- Blocks: B079, B080, B082, B085, B086
- Frozen by active gate: yes
- Write set:
  - src/server/trpc/routers/**
  - src/trpc/**
  - tests/trpc/**
- Issues:
  - 09-repos-git-supervision/issues/07-trpc-procedures.md: ready-for-agent; deps=09-repos-git-supervision/issues/02-repo-repository-crud.md,09-repos-git-supervision/issues/03-simple-git-wrapper.md; tests=bun test tests/permissions/<focused>.test.ts tests/trpc/<focused>.test.ts; title=trpc procedures

### B079 09-repos-git-supervision cli-surface

- Phase: 999
- Status: ready-for-agent
- Risk: medium
- Surfaces: cli, repos
- Depends on: B078
- Blocks: B081, B082, B085
- Frozen by active gate: yes
- Write set:
  - src/cli/**
  - tests/cli/**
- Issues:
  - 09-repos-git-supervision/issues/08-cli-verbs.md: ready-for-agent; deps=09-repos-git-supervision/issues/07-trpc-procedures.md; tests=bun test tests/db/migrations/<focused>.test.ts; title=cli verbs

### B080 09-repos-git-supervision gated-integration

- Phase: 999
- Status: ready-for-agent
- Risk: high
- Surfaces: repos
- Depends on: B078, B084
- Blocks: None
- Frozen by active gate: no
- Write set:
  - src/repos/**
  - tests/repos/**
- Issues:
  - 09-repos-git-supervision/issues/14-connector-github.md: ready-for-agent; deps=09-repos-git-supervision/issues/07-trpc-procedures.md,09-repos-git-supervision/issues/01-schema-migration.md; tests=bun test tests/db/migrations/<focused>.test.ts; title=connector github
  - 09-repos-git-supervision/issues/15-connector-gitlab.md: ready-for-agent; deps=09-repos-git-supervision/issues/14-connector-github.md; tests=bun test tests/db/migrations/<focused>.test.ts; title=connector gitlab
  - 09-repos-git-supervision/issues/16-connector-bitbucket.md: ready-for-agent; deps=09-repos-git-supervision/issues/14-connector-github.md; tests=bun test tests/db/migrations/<focused>.test.ts; title=connector bitbucket

### B081 09-repos-git-supervision quality-gate

- Phase: 999
- Status: ready-for-agent
- Risk: medium
- Surfaces: docs, platform, repos
- Depends on: B079, B083, B085, B086
- Blocks: None
- Frozen by active gate: no
- Write set:
  - src/docs/**
  - src/web/src/lib/components/markdown/**
  - src/web/src/routes/docs/**
- Issues:
  - 09-repos-git-supervision/issues/18-doctor-and-e2e-tests.md: ready-for-agent; deps=09-repos-git-supervision/issues/04-local-repo-registration-and-watcher.md,09-repos-git-supervision/issues/05-sync-worker-local.md,09-repos-git-supervision/issues/06-remote-repo-registration-and-sync.md,09-repos-git-supervision/issues/08-cli-verbs.md,09-repos-git-supervision/issues/09-web-repo-list-and-dashboard.md,09-repos-git-supervision/issues/10-web-branches-and-commits.md,09-repos-git-supervision/issues/11-web-file-tree-content-blame.md,09-repos-git-supervision/issues/12-web-project-repos-scoped-view.md,09-repos-git-supervision/issues/13-tui-repos-browser-pane.md; tests=bun test tests/cli/<focused>.test.ts; title=doctor and e2e tests

### B082 09-repos-git-supervision repos

- Phase: 999
- Status: mixed
- Risk: low
- Surfaces: repos
- Depends on: B078, B079, B084, B085, B086
- Blocks: B078, B083
- Frozen by active gate: no
- Write set:
  - src/repos/**
  - tests/repos/**
- Issues:
  - 09-repos-git-supervision/issues/02-repo-repository-crud.md: ready-for-agent; deps=09-repos-git-supervision/issues/01-schema-migration.md; tests=bun test tests/db/migrations/<focused>.test.ts; title=repo repository crud
  - 09-repos-git-supervision/issues/03-simple-git-wrapper.md: completed; deps=None; tests=bun test tests/db/migrations/<focused>.test.ts; title=simple git wrapper
  - 09-repos-git-supervision/issues/17-repo-write-ops-gate.md: ready-for-agent; deps=09-repos-git-supervision/issues/07-trpc-procedures.md,09-repos-git-supervision/issues/08-cli-verbs.md,09-repos-git-supervision/issues/09-web-repo-list-and-dashboard.md,09-repos-git-supervision/issues/13-tui-repos-browser-pane.md; tests=bun test tests/trpc/<focused>.test.ts; title=repo write ops gate

### B083 09-repos-git-supervision runtime-loop

- Phase: 999
- Status: ready-for-agent
- Risk: low
- Surfaces: repos
- Depends on: B082, B084
- Blocks: B081
- Frozen by active gate: no
- Write set:
  - src/repos/**
  - tests/repos/**
- Issues:
  - 09-repos-git-supervision/issues/04-local-repo-registration-and-watcher.md: ready-for-agent; deps=09-repos-git-supervision/issues/01-schema-migration.md,09-repos-git-supervision/issues/02-repo-repository-crud.md,09-repos-git-supervision/issues/03-simple-git-wrapper.md; tests=bun test tests/db/migrations/<focused>.test.ts; title=local repo registration and watcher
  - 09-repos-git-supervision/issues/05-sync-worker-local.md: ready-for-agent; deps=09-repos-git-supervision/issues/02-repo-repository-crud.md,09-repos-git-supervision/issues/03-simple-git-wrapper.md; tests=bun test tests/db/migrations/<focused>.test.ts; title=sync worker local
  - 09-repos-git-supervision/issues/06-remote-repo-registration-and-sync.md: ready-for-agent; deps=09-repos-git-supervision/issues/02-repo-repository-crud.md,09-repos-git-supervision/issues/03-simple-git-wrapper.md,09-repos-git-supervision/issues/05-sync-worker-local.md; tests=bun test tests/trpc/<focused>.test.ts; title=remote repo registration and sync

### B085 09-repos-git-supervision tui-surface

- Phase: 999
- Status: ready-for-agent
- Risk: medium
- Surfaces: repos, tui, web
- Depends on: B078, B079
- Blocks: B081, B082
- Frozen by active gate: yes
- Write set:
  - src/tui/**
  - tests/tui/**
- Issues:
  - 09-repos-git-supervision/issues/13-tui-repos-browser-pane.md: ready-for-agent; deps=09-repos-git-supervision/issues/07-trpc-procedures.md,09-repos-git-supervision/issues/08-cli-verbs.md; tests=bun test tests/auth/<focused>.test.ts; title=tui repos browser pane

### B086 09-repos-git-supervision web-surface

- Phase: 999
- Status: ready-for-agent
- Risk: low
- Surfaces: repos, web
- Depends on: B078
- Blocks: B081, B082
- Frozen by active gate: yes
- Write set:
  - src/web/src/lib/components/**
  - src/web/src/routes/**
  - src/web/tests/**
- Issues:
  - 09-repos-git-supervision/issues/09-web-repo-list-and-dashboard.md: ready-for-agent; deps=09-repos-git-supervision/issues/07-trpc-procedures.md; tests=bun test tests/auth/<focused>.test.ts; title=web repo list and dashboard
  - 09-repos-git-supervision/issues/10-web-branches-and-commits.md: ready-for-agent; deps=09-repos-git-supervision/issues/09-web-repo-list-and-dashboard.md; tests=bun test tests/auth/<focused>.test.ts; title=web branches and commits
  - 09-repos-git-supervision/issues/11-web-file-tree-content-blame.md: ready-for-agent; deps=09-repos-git-supervision/issues/09-web-repo-list-and-dashboard.md; tests=bun test tests/db/migrations/<focused>.test.ts; title=web file tree content blame
  - 09-repos-git-supervision/issues/12-web-project-repos-scoped-view.md: ready-for-agent; deps=09-repos-git-supervision/issues/09-web-repo-list-and-dashboard.md; tests=bun test src/web/src/routes/<focused>.test.ts src/web/tests/a11y/<focused>.test.ts; title=web project repos scoped view

### B087 16-web-shell-rebuild auth-permissions

- Phase: 999
- Status: ready-for-agent
- Risk: high
- Surfaces: api, auth, web
- Depends on: B002, B003
- Blocks: None
- Frozen by active gate: yes
- Write set:
  - src/auth/**
  - src/web/src/routes/auth/**
  - tests/auth/**
- Issues:
  - 16-web-shell-rebuild/issues/04-auth-routes.md: ready-for-agent; deps=01-foundation-reset/issues/11-web-login-signup-logout-pages.md,01-foundation-reset/issues/13-passkey-enrollment-and-login-flow.md; tests=bun test tests/auth/<focused>.test.ts; title=Auth routes — /auth/login, /auth/signup, /auth/invite/[token], /auth/logout
  - 16-web-shell-rebuild/issues/25-gated-saas-auth-and-public-api.md: ready-for-agent; deps=16-web-shell-rebuild/issues/04-auth-routes.md,01-foundation-reset/issues/14-saas-auth-gated-oauth-and-email-otp.md; tests=bun test tests/auth/<focused>.test.ts; title=GATED: saas-auth (OAuth, signup, magic-link) + public-api (OpenAPI viewer, API settings page)

### B088 16-web-shell-rebuild cli-surface

- Phase: 999
- Status: ready-for-agent
- Risk: medium
- Surfaces: cli, search, web
- Depends on: B089
- Blocks: B093
- Frozen by active gate: yes
- Write set:
  - src/cli/**
  - tests/cli/**
- Issues:
  - 16-web-shell-rebuild/issues/03-cmd-k-palette.md: ready-for-agent; deps=16-web-shell-rebuild/issues/01-v0-teardown-and-sveltekit-scaffold.md; tests=bun test tests/trpc/<focused>.test.ts; title=Cmd+K palette — search mode, command mode, quick-filter tokens

### B089 16-web-shell-rebuild web-surface 1

- Phase: 999
- Status: ready-for-agent
- Risk: medium
- Surfaces: orchestration, platform, web
- Depends on: B001, B098
- Blocks: B088, B090, B091, B092, B093, B094, B095, B096
- Frozen by active gate: yes
- Write set:
  - src/web/src/lib/components/**
  - src/web/src/routes/**
  - src/web/tests/**
- Issues:
  - 16-web-shell-rebuild/issues/01-v0-teardown-and-sveltekit-scaffold.md: ready-for-agent; deps=01-foundation-reset/issues/06-trpc-core-router-and-permission-middleware.md; tests=bun test tests/db/migrations/<focused>.test.ts; title=v0 admin teardown + SvelteKit 2 shell scaffold
  - 16-web-shell-rebuild/issues/02-theme-keybindings-errorbound-featuregate.md: ready-for-agent; deps=16-web-shell-rebuild/issues/01-v0-teardown-and-sveltekit-scaffold.md,17-cross-cutting-platform/issues/04-theme-trpc-and-composable.md; tests=bun test tests/db/migrations/<focused>.test.ts; title=Theme engine, keybindings dispatcher, error boundary, FeatureGate component
  - 16-web-shell-rebuild/issues/05-dashboard-and-projects-list.md: ready-for-agent; deps=16-web-shell-rebuild/issues/01-v0-teardown-and-sveltekit-scaffold.md; tests=bun test tests/db/migrations/<focused>.test.ts; title=Dashboard (/) and Projects list (/projects)

### B090 16-web-shell-rebuild web-surface 2

- Phase: 999
- Status: ready-for-agent
- Risk: low
- Surfaces: repos, tasks, web
- Depends on: B089
- Blocks: B091, B096
- Frozen by active gate: yes
- Write set:
  - src/web/src/lib/components/**
  - src/web/src/routes/**
  - src/web/tests/**
- Issues:
  - 16-web-shell-rebuild/issues/06-project-overview-and-kanban-board.md: ready-for-agent; deps=16-web-shell-rebuild/issues/05-dashboard-and-projects-list.md; tests=bun test tests/trpc/<focused>.test.ts; title=Project overview (/projects/[id]) + Kanban board (/projects/[id]/board)
  - 16-web-shell-rebuild/issues/07-backlog-sprints-and-sprint-board.md: ready-for-agent; deps=16-web-shell-rebuild/issues/06-project-overview-and-kanban-board.md; tests=bun test tests/db/migrations/<focused>.test.ts; title=Backlog (/projects/[id]/backlog), Sprints list (/projects/[id]/sprints), Active Sprint board (/projects/[id]/sprint/[sid])
  - 16-web-shell-rebuild/issues/08-reports-hub.md: ready-for-agent; deps=16-web-shell-rebuild/issues/07-backlog-sprints-and-sprint-board.md; tests=bun test tests/db/migrations/<focused>.test.ts; title=Reports hub (/projects/[id]/reports) — burndown, velocity, cycle-time, CFD

### B091 16-web-shell-rebuild web-surface 3

- Phase: 999
- Status: ready-for-agent
- Risk: high
- Surfaces: docs, tasks, web
- Depends on: B089, B090
- Blocks: B094, B095, B096
- Frozen by active gate: yes
- Write set:
  - src/web/src/lib/components/**
  - src/web/src/routes/**
  - src/web/tests/**
- Issues:
  - 16-web-shell-rebuild/issues/09-task-detail-and-bulk-ops.md: ready-for-agent; deps=16-web-shell-rebuild/issues/06-project-overview-and-kanban-board.md; tests=bun test tests/db/migrations/<focused>.test.ts; title=Task detail (/tasks/[id]) + bulk operations + alternate views (table/calendar/Gantt)
  - 16-web-shell-rebuild/issues/10-project-settings-fields-statuses-views.md: ready-for-agent; deps=16-web-shell-rebuild/issues/09-task-detail-and-bulk-ops.md; tests=bun test tests/trpc/<focused>.test.ts; title=Project settings — /projects/[id]/settings/fields, /statuses, /views, /connectors
  - 16-web-shell-rebuild/issues/11-doc-tree-reader-editor-history.md: ready-for-agent; deps=16-web-shell-rebuild/issues/01-v0-teardown-and-sveltekit-scaffold.md; tests=bun test tests/db/migrations/<focused>.test.ts; title=Doc routes — /docs, /docs/global, /docs/[id] reader, /docs/[id]/edit, /docs/[id]/history

### B092 16-web-shell-rebuild web-surface 4

- Phase: 999
- Status: ready-for-agent
- Risk: medium
- Surfaces: memory, repos, runtime, web
- Depends on: B034, B089
- Blocks: B093
- Frozen by active gate: yes
- Write set:
  - src/web/src/lib/components/**
  - src/web/src/routes/**
  - src/web/tests/**
- Issues:
  - 16-web-shell-rebuild/issues/12-memory-browser-and-context-preview.md: ready-for-agent; deps=16-web-shell-rebuild/issues/01-v0-teardown-and-sveltekit-scaffold.md; tests=bun test tests/trpc/<focused>.test.ts; title=Memory browser (/memory, /memory/[id]) + Context bundle preview (/context/preview)
  - 16-web-shell-rebuild/issues/13-runs-and-artifacts.md: ready-for-agent; deps=16-web-shell-rebuild/issues/01-v0-teardown-and-sveltekit-scaffold.md,04-sandcastle-wrapper/issues/03-artifacts-edges-migration.md; tests=bun test tests/db/migrations/<focused>.test.ts; title=Agent runs (/runs, /runs/[id]) + Artifacts browser (/artifacts, /artifacts/[id])
  - 16-web-shell-rebuild/issues/14-repos-browser.md: ready-for-agent; deps=16-web-shell-rebuild/issues/01-v0-teardown-and-sveltekit-scaffold.md; tests=bun test tests/db/migrations/<focused>.test.ts; title=Repos browser — /repos, /repos/[id], /repos/[id]/files, /repos/[id]/commits

### B093 16-web-shell-rebuild web-surface 5

- Phase: 999
- Status: ready-for-agent
- Risk: medium
- Surfaces: inference, notifications, orchestration, platform, search, web
- Depends on: B016, B026, B088, B089, B092, B098
- Blocks: B094
- Frozen by active gate: yes
- Write set:
  - src/web/src/lib/components/**
  - src/web/src/routes/**
  - src/web/tests/**
- Issues:
  - 16-web-shell-rebuild/issues/15-search-facets-inbox-audit.md: ready-for-agent; deps=16-web-shell-rebuild/issues/03-cmd-k-palette.md; tests=bun test tests/db/migrations/<focused>.test.ts; title=Search (/search), Inbox (/inbox), Audit log (/audit)
  - 16-web-shell-rebuild/issues/16-agents-orchestration-inference-dashboards.md: ready-for-agent; deps=16-web-shell-rebuild/issues/13-runs-and-artifacts.md,03-symphony-orchestration/issues/18-web-runs-board.md,02-inference-sidecar/issues/13-web-inference-settings-page.md; tests=bun test tests/auth/<focused>.test.ts; title=Agents (/agents), Orchestration dashboard (/orchestration), Inference dashboard (/inference)
  - 16-web-shell-rebuild/issues/17-settings-theme-routing-skills-users.md: ready-for-agent; deps=16-web-shell-rebuild/issues/02-theme-keybindings-errorbound-featuregate.md,17-cross-cutting-platform/issues/04-theme-trpc-and-composable.md; tests=bun test tests/auth/<focused>.test.ts; title=Settings — /settings/theme, /settings/routing, /settings/skills, /settings/users

### B094 16-web-shell-rebuild web-surface 6

- Phase: 999
- Status: ready-for-agent
- Risk: high
- Surfaces: docs, notifications, platform, web
- Depends on: B006, B089, B091, B093, B098, B099, B100
- Blocks: B097
- Frozen by active gate: yes
- Write set:
  - src/web/src/lib/components/**
  - src/web/src/routes/**
  - src/web/tests/**
- Issues:
  - 16-web-shell-rebuild/issues/18-settings-secrets-backups-flags-data.md: ready-for-agent; deps=16-web-shell-rebuild/issues/01-v0-teardown-and-sveltekit-scaffold.md,17-cross-cutting-platform/issues/03-backup-restore-trpc.md,17-cross-cutting-platform/issues/07-feature-flag-rollout-trpc.md,17-cross-cutting-platform/issues/09-json-import-export-trpc.md; tests=bun test tests/db/migrations/<focused>.test.ts; title=Settings — /settings/secrets, /settings/backups, /settings/feature-flags, /settings/data, /settings/errors, /settings/telemetry
  - 16-web-shell-rebuild/issues/19-doctor-dashboard.md: ready-for-agent; deps=16-web-shell-rebuild/issues/01-v0-teardown-and-sveltekit-scaffold.md,01-foundation-reset/issues/18-test-infrastructure-baseline-and-ci.md; tests=bun test tests/auth/<focused>.test.ts; title=Doctor dashboard (/doctor)
  - 16-web-shell-rebuild/issues/20-accessibility-audit.md: ready-for-agent; deps=16-web-shell-rebuild/issues/09-task-detail-and-bulk-ops.md,16-web-shell-rebuild/issues/11-doc-tree-reader-editor-history.md,16-web-shell-rebuild/issues/15-search-facets-inbox-audit.md; tests=bun test tests/auth/<focused>.test.ts; title=Accessibility audit — axe-core Playwright scan, keyboard nav, skip links, focus traps

### B095 16-web-shell-rebuild web-surface 7

- Phase: 999
- Status: ready-for-agent
- Risk: high
- Surfaces: docs, runtime, web
- Depends on: B089, B091
- Blocks: None
- Frozen by active gate: yes
- Write set:
  - src/web/src/lib/components/**
  - src/web/src/routes/**
  - src/web/tests/**
- Issues:
  - 16-web-shell-rebuild/issues/21-gated-real-time-collab.md: ready-for-agent; deps=16-web-shell-rebuild/issues/11-doc-tree-reader-editor-history.md; tests=bun test tests/trpc/<focused>.test.ts; title=GATED: real-time-collab-server — Yjs+Hocuspocus in TipTap, collab cursors, presence avatars
  - 16-web-shell-rebuild/issues/22-gated-tauri-desktop-app.md: ready-for-agent; deps=16-web-shell-rebuild/issues/01-v0-teardown-and-sveltekit-scaffold.md; tests=bun test tests/trpc/<focused>.test.ts; title=GATED: desktop-app — Tauri v2 wrapper, native window, drag-drop artifact upload, auto-update
  - 16-web-shell-rebuild/issues/23-gated-pwa-offline.md: ready-for-agent; deps=16-web-shell-rebuild/issues/01-v0-teardown-and-sveltekit-scaffold.md; tests=bun test tests/db/migrations/<focused>.test.ts; title=GATED: pwa-offline — service worker, app-shell cache, background sync, /offline fallback

### B096 16-web-shell-rebuild web-surface 8

- Phase: 999
- Status: ready-for-agent
- Risk: high
- Surfaces: inference, platform, repos, tasks, web
- Depends on: B012, B089, B090, B091, B102
- Blocks: None
- Frozen by active gate: yes
- Write set:
  - src/web/src/lib/components/**
  - src/web/src/routes/**
  - src/web/tests/**
- Issues:
  - 16-web-shell-rebuild/issues/24-gated-i18n.md: ready-for-agent; deps=16-web-shell-rebuild/issues/01-v0-teardown-and-sveltekit-scaffold.md,17-cross-cutting-platform/issues/13-gated-i18n.md; tests=bun test src/web/src/routes/<focused>.test.ts src/web/tests/a11y/<focused>.test.ts; title=GATED: i18n — paraglide-js, locale selector, RTL CSS flips, Intl formatting
  - 16-web-shell-rebuild/issues/26-gated-connectors-and-importers-ui.md: ready-for-agent; deps=16-web-shell-rebuild/issues/10-project-settings-fields-statuses-views.md,17-cross-cutting-platform/issues/15-gated-import-linear-jira-plane.md; tests=bun test tests/auth/<focused>.test.ts; title=GATED: connector UI (Jira, Linear, GitHub Issues) + import/export UI (CSV, Linear, Jira) + skill marketplace
  - 16-web-shell-rebuild/issues/27-gated-report-llm-narration.md: ready-for-agent; deps=16-web-shell-rebuild/issues/08-reports-hub.md,02-inference-sidecar/issues/07-generate-operation.md; tests=bun test tests/trpc/<focused>.test.ts; title=GATED: report-llm-narration — LLM sprint narrative in sprint close modal

### B097 16-web-shell-rebuild web-surface 9

- Phase: 999
- Status: ready-for-agent
- Risk: medium
- Surfaces: docs, platform, web
- Depends on: B094
- Blocks: None
- Frozen by active gate: yes
- Write set:
  - src/web/src/lib/components/**
  - src/web/src/routes/**
  - src/web/tests/**
- Issues:
  - 16-web-shell-rebuild/issues/28-performance-budgets-and-ci-gate.md: ready-for-agent; deps=16-web-shell-rebuild/issues/20-accessibility-audit.md; tests=bun test tests/db/migrations/<focused>.test.ts; title=Performance budgets, Lighthouse CI gate, doctor web subsystem checks

### B098 17-cross-cutting-platform api-contract 1

- Phase: 999
- Status: in-progress
- Risk: high
- Surfaces: api, cli, platform, runtime, tui, web
- Depends on: B007, B106
- Blocks: B089, B093, B094, B101, B102, B103, B104, B105, B106, B107
- Frozen by active gate: yes
- Write set:
  - src/server/trpc/routers/**
  - src/trpc/**
  - tests/trpc/**
- Issues:
  - 17-cross-cutting-platform/issues/02-secrets-keyring-and-vault.md: in-progress; deps=17-cross-cutting-platform/issues/01-schema-migration-credentials-telemetry-errors-experiments.md; tests=bun test tests/db/migrations/<focused>.test.ts; title=Secret management — keyring.ts OS abstraction + vault.ts nacl.secretbox + credentials.* tRPC
  - 17-cross-cutting-platform/issues/03-backup-restore-trpc.md: ready-for-agent; deps=17-cross-cutting-platform/issues/02-secrets-keyring-and-vault.md; tests=bun test tests/db/migrations/<focused>.test.ts; title=Local backup + restore — runner.ts, tRPC procedures, CLI integration
  - 17-cross-cutting-platform/issues/04-theme-trpc-and-composable.md: ready-for-agent; deps=17-cross-cutting-platform/issues/01-schema-migration-credentials-telemetry-errors-experiments.md,01-foundation-reset/issues/03-composite-indexes-and-flag-stub-tables.md; tests=bun test tests/db/migrations/<focused>.test.ts; title=Theme engine — generator.ts, useTheme() composable, theme.* tRPC, CLI + TUI integration

### B099 17-cross-cutting-platform api-contract 2

- Phase: 999
- Status: ready-for-agent
- Risk: medium
- Surfaces: api, cli, platform, tui, web
- Depends on: B008, B106
- Blocks: B094, B101, B104, B105, B106, B107, B108
- Frozen by active gate: yes
- Write set:
  - src/server/trpc/routers/**
  - src/trpc/**
  - tests/trpc/**
- Issues:
  - 17-cross-cutting-platform/issues/05-error-crashlog-trpc-and-surfaces.md: ready-for-agent; deps=17-cross-cutting-platform/issues/01-schema-migration-credentials-telemetry-errors-experiments.md; tests=bun test tests/db/migrations/<focused>.test.ts; title=Local error crashlog — crashlog.ts global handler, error_logs tRPC, CLI + Web + TUI surfaces
  - 17-cross-cutting-platform/issues/06-telemetry-collector-trpc-and-surfaces.md: ready-for-agent; deps=17-cross-cutting-platform/issues/01-schema-migration-credentials-telemetry-errors-experiments.md; tests=bun test tests/db/migrations/<focused>.test.ts; title=Local telemetry collection — collector.ts, opt-in prompt, telemetry.* tRPC, CLI + Web + TUI surfaces
  - 17-cross-cutting-platform/issues/07-feature-flag-rollout-trpc.md: ready-for-agent; deps=17-cross-cutting-platform/issues/01-schema-migration-credentials-telemetry-errors-experiments.md,01-foundation-reset/issues/07-feature-flag-registry.md; tests=bun test tests/db/migrations/<focused>.test.ts; title=Feature-flag rollout + cohorts + experiments — rollout.ts, FeatureFlagRollout, ExperimentAssignment, flags.* tRPC, CLI + Web + TUI

### B100 17-cross-cutting-platform api-contract 3

- Phase: 999
- Status: ready-for-agent
- Risk: high
- Surfaces: api, cli, platform
- Depends on: B106
- Blocks: B094, B101, B102, B106
- Frozen by active gate: yes
- Write set:
  - src/server/trpc/routers/**
  - src/trpc/**
  - tests/trpc/**
- Issues:
  - 17-cross-cutting-platform/issues/09-json-import-export-trpc.md: ready-for-agent; deps=17-cross-cutting-platform/issues/01-schema-migration-credentials-telemetry-errors-experiments.md; tests=bun test tests/db/migrations/<focused>.test.ts; title=Native JSON import/export — export.ts, import.ts, dataExport.*/dataImport.* tRPC, CLI surfaces

### B101 17-cross-cutting-platform cli-surface

- Phase: 999
- Status: ready-for-agent
- Risk: high
- Surfaces: cli, platform, web
- Depends on: B098, B099, B100
- Blocks: None
- Frozen by active gate: yes
- Write set:
  - src/cli/**
  - tests/cli/**
- Issues:
  - 17-cross-cutting-platform/issues/10-cli-surfaces-theme-secrets-errors-backup-telemetry-flags-data.md: ready-for-agent; deps=17-cross-cutting-platform/issues/04-theme-trpc-and-composable.md,17-cross-cutting-platform/issues/02-secrets-keyring-and-vault.md,17-cross-cutting-platform/issues/05-error-crashlog-trpc-and-surfaces.md,17-cross-cutting-platform/issues/03-backup-restore-trpc.md,17-cross-cutting-platform/issues/06-telemetry-collector-trpc-and-surfaces.md,17-cross-cutting-platform/issues/07-feature-flag-rollout-trpc.md,17-cross-cutting-platform/issues/09-json-import-export-trpc.md; tests=bun test tests/db/migrations/<focused>.test.ts; title=CLI surfaces — fulcrum theme/secrets/errors/backup/telemetry/flags/export/import commands
  - 17-cross-cutting-platform/issues/14-gated-import-csv-and-export-csv.md: ready-for-agent; deps=17-cross-cutting-platform/issues/09-json-import-export-trpc.md; tests=bun test tests/db/migrations/<focused>.test.ts; title=GATED: import-csv + export-csv — column mapper, import pipeline, CLI + Web surfaces

### B102 17-cross-cutting-platform gated-integration 1

- Phase: 999
- Status: ready-for-agent
- Risk: high
- Surfaces: platform, tasks
- Depends on: B098, B100, B106
- Blocks: B096
- Frozen by active gate: no
- Write set:
  - src/platform/**
  - src/tasks/**
  - src/web/src/routes/boards/**
  - src/web/src/routes/projects/**
  - tests/platform/**
- Issues:
  - 17-cross-cutting-platform/issues/13-gated-i18n.md: ready-for-agent; deps=17-cross-cutting-platform/issues/01-schema-migration-credentials-telemetry-errors-experiments.md; tests=bun test tests/db/migrations/<focused>.test.ts; title=GATED: i18n — paraglide-js bootstrap, locale picker, RTL CSS, CI extraction gate
  - 17-cross-cutting-platform/issues/15-gated-import-linear-jira-plane.md: ready-for-agent; deps=17-cross-cutting-platform/issues/02-secrets-keyring-and-vault.md,17-cross-cutting-platform/issues/09-json-import-export-trpc.md; tests=bun test tests/trpc/<focused>.test.ts; title=GATED: import-linear, import-jira, import-plane — connector stubs + task mapper
  - 17-cross-cutting-platform/issues/18-gated-vault-integration.md: ready-for-agent; deps=17-cross-cutting-platform/issues/02-secrets-keyring-and-vault.md; tests=bun test tests/auth/<focused>.test.ts; title=GATED: vault-integration — HashiCorp Vault KV v2 + AWS Secrets Manager adapters

### B103 17-cross-cutting-platform gated-integration 2

- Phase: 999
- Status: ready-for-agent
- Risk: high
- Surfaces: docs, platform
- Depends on: B098
- Blocks: None
- Frozen by active gate: no
- Write set:
  - src/docs/**
  - src/web/src/lib/components/markdown/**
  - src/web/src/routes/docs/**
- Issues:
  - 17-cross-cutting-platform/issues/21-gated-keyring-platform-adapters.md: ready-for-agent; deps=17-cross-cutting-platform/issues/02-secrets-keyring-and-vault.md; tests=bun test tests/permissions/<focused>.test.ts tests/trpc/<focused>.test.ts; title=GATED: keyring-macos, keyring-linux, keyring-windows — platform keyring activation + doctor integration

### B104 17-cross-cutting-platform quality-gate

- Phase: 999
- Status: mixed
- Risk: medium
- Surfaces: docs, notifications, platform
- Depends on: B006, B098, B099
- Blocks: None
- Frozen by active gate: no
- Write set:
  - src/audit/**
  - src/docs/**
  - src/notifications/**
  - src/platform/**
  - src/web/src/lib/components/markdown/**
  - src/web/src/routes/docs/**
  - tests/notifications/**
  - tests/platform/**
- Issues:
  - 17-cross-cutting-platform/issues/11-doctor-checks.md: ready-for-agent; deps=17-cross-cutting-platform/issues/02-secrets-keyring-and-vault.md,17-cross-cutting-platform/issues/05-error-crashlog-trpc-and-surfaces.md,17-cross-cutting-platform/issues/06-telemetry-collector-trpc-and-surfaces.md,17-cross-cutting-platform/issues/07-feature-flag-rollout-trpc.md,01-foundation-reset/issues/18-test-infrastructure-baseline-and-ci.md; tests=bun test tests/db/migrations/<focused>.test.ts; title=Doctor checks — all 11 platform.* checks implemented
  - 17-cross-cutting-platform/issues/12-governance-files.md: ready-for-agent; deps=None; tests=bun test tests/auth/<focused>.test.ts; title=Governance files — GOVERNANCE.md, SECURITY.md, CODE_OF_CONDUCT.md, VERSIONING.md
  - 17-cross-cutting-platform/issues/23-license-deps-audit.md: completed; deps=None; tests=bun test tests/cli/<focused>.test.ts; title=License-deps audit + CI gate

### B105 17-cross-cutting-platform runtime-loop

- Phase: 999
- Status: ready-for-agent
- Risk: high
- Surfaces: orchestration, platform
- Depends on: B098, B099
- Blocks: None
- Frozen by active gate: no
- Write set:
  - docs/symphony-conformance.md
  - src/orchestration/**
  - src/platform/**
  - tests/platform/**
  - tests/symphony/**
- Issues:
  - 17-cross-cutting-platform/issues/16-gated-telemetry-remote.md: ready-for-agent; deps=17-cross-cutting-platform/issues/06-telemetry-collector-trpc-and-surfaces.md; tests=bun test tests/db/migrations/<focused>.test.ts; title=GATED: telemetry-remote — HMAC batch POST, retry queue, telemetry_outbox
  - 17-cross-cutting-platform/issues/19-gated-scheduled-backups.md: ready-for-agent; deps=17-cross-cutting-platform/issues/03-backup-restore-trpc.md; tests=bun test tests/trpc/<focused>.test.ts; title=GATED: scheduled-backups — cron graphile-worker job, S3/R2/B2/GCS/Azure remote upload adapters

### B106 17-cross-cutting-platform schema-contract

- Phase: 999
- Status: mixed
- Risk: high
- Surfaces: api, notifications, platform, repos, schema
- Depends on: B007, B098, B099, B100
- Blocks: B098, B099, B100, B102
- Frozen by active gate: yes
- Write set:
  - src/db/entities/**
  - src/db/migrations/**
  - tests/db/migrations/**
- Issues:
  - 17-cross-cutting-platform/issues/01-schema-migration-credentials-telemetry-errors-experiments.md: completed; deps=01-foundation-reset/issues/01-schema-auth-migration.md; tests=tests/db/migrations/Migration<timestamp>.test.ts; title=Migration class — Credential, TelemetryEvent, ErrorLog, ExperimentAssignment, FeatureFlagRollout
  - 17-cross-cutting-platform/issues/17-gated-error-reporting-remote.md: ready-for-agent; deps=17-cross-cutting-platform/issues/05-error-crashlog-trpc-and-surfaces.md; tests=bun test tests/db/migrations/<focused>.test.ts; title=GATED: error-reporting-remote — crash POST on new ErrorLog entity, path scrubbing, HMAC
  - 17-cross-cutting-platform/issues/22-observability-events-and-performance-budgets.md: ready-for-agent; deps=17-cross-cutting-platform/issues/06-telemetry-collector-trpc-and-surfaces.md,17-cross-cutting-platform/issues/02-secrets-keyring-and-vault.md,17-cross-cutting-platform/issues/03-backup-restore-trpc.md,17-cross-cutting-platform/issues/07-feature-flag-rollout-trpc.md,17-cross-cutting-platform/issues/09-json-import-export-trpc.md; tests=bun test tests/db/migrations/<focused>.test.ts; title=Observability — events emit from all tRPC procedures, performance budgets, audit event schemas

### B107 17-cross-cutting-platform tui-surface

- Phase: 999
- Status: ready-for-agent
- Risk: high
- Surfaces: platform, tui, web
- Depends on: B098, B099
- Blocks: None
- Frozen by active gate: yes
- Write set:
  - src/tui/**
  - tests/tui/**
- Issues:
  - 17-cross-cutting-platform/issues/08-tui-settings-screens.md: ready-for-agent; deps=17-cross-cutting-platform/issues/04-theme-trpc-and-composable.md,17-cross-cutting-platform/issues/02-secrets-keyring-and-vault.md,17-cross-cutting-platform/issues/03-backup-restore-trpc.md,17-cross-cutting-platform/issues/06-telemetry-collector-trpc-and-surfaces.md,17-cross-cutting-platform/issues/07-feature-flag-rollout-trpc.md; tests=bun test tests/db/migrations/<focused>.test.ts; title=TUI Settings screens — Theme, Secrets, Errors, Backup, Telemetry, Feature Flags, Data

### B108 17-cross-cutting-platform web-surface

- Phase: 999
- Status: ready-for-agent
- Risk: high
- Surfaces: platform, web
- Depends on: B099
- Blocks: None
- Frozen by active gate: yes
- Write set:
  - src/web/src/lib/components/**
  - src/web/src/routes/**
  - src/web/tests/**
- Issues:
  - 17-cross-cutting-platform/issues/20-gated-experiments-admin-ui.md: ready-for-agent; deps=17-cross-cutting-platform/issues/07-feature-flag-rollout-trpc.md; tests=bun test tests/db/migrations/<focused>.test.ts; title=GATED: experiments — full A/B experiment admin UI, variant list, assignment counts, conversion metrics

### B109 api-and-webhooks api-contract 1

- Phase: 999
- Status: implemented
- Risk: high
- Surfaces: api, web
- Depends on: B114
- Blocks: B110, B111, B113, B114
- Frozen by active gate: yes
- Write set:
  - src/server/trpc/routers/**
  - src/trpc/**
  - tests/trpc/**
- Issues:
  - 13-api-and-webhooks/issues/01-trpc-router-scaffold.md: implemented; deps=None; tests=bun test tests/db/migrations/<focused>.test.ts; title=trpc router scaffold
  - 13-api-and-webhooks/issues/02-websocket-subscriptions.md: ready-for-agent; deps=13-api-and-webhooks/issues/01-trpc-router-scaffold.md; tests=bun test tests/trpc/<focused>.test.ts; title=websocket subscriptions
  - 13-api-and-webhooks/issues/04-public-api-hono-setup.md: ready-for-agent; deps=13-api-and-webhooks/issues/01-trpc-router-scaffold.md,13-api-and-webhooks/issues/03-zod-schema-registry.md; tests=bun test tests/db/migrations/<focused>.test.ts; title=public api hono setup

### B110 api-and-webhooks api-contract 2

- Phase: 999
- Status: ready-for-agent
- Risk: high
- Surfaces: api, docs, notifications, orchestration, search, tasks, web
- Depends on: B109, B114
- Blocks: B113
- Frozen by active gate: yes
- Write set:
  - src/server/trpc/routers/**
  - src/trpc/**
  - tests/trpc/**
- Issues:
  - 13-api-and-webhooks/issues/05-rest-parity-tasks-docs.md: ready-for-agent; deps=13-api-and-webhooks/issues/04-public-api-hono-setup.md; tests=bun test tests/db/migrations/<focused>.test.ts; title=rest parity tasks docs
  - 13-api-and-webhooks/issues/06-rest-parity-search-notify-audit-runs.md: ready-for-agent; deps=13-api-and-webhooks/issues/04-public-api-hono-setup.md; tests=bun test tests/db/migrations/<focused>.test.ts; title=rest parity search notify audit runs
  - 13-api-and-webhooks/issues/08-webhook-dispatcher-hmac-retry.md: ready-for-agent; deps=13-api-and-webhooks/issues/07-webhook-schema-and-trpc.md; tests=bun test tests/db/migrations/<focused>.test.ts; title=webhook dispatcher hmac retry

### B111 api-and-webhooks api-contract 3

- Phase: 999
- Status: ready-for-agent
- Risk: high
- Surfaces: api, repos, web
- Depends on: B109, B114
- Blocks: B112, B113
- Frozen by active gate: yes
- Write set:
  - src/server/trpc/routers/**
  - src/trpc/**
  - tests/trpc/**
- Issues:
  - 13-api-and-webhooks/issues/09-connector-framework-interface.md: ready-for-agent; deps=13-api-and-webhooks/issues/01-trpc-router-scaffold.md,13-api-and-webhooks/issues/03-zod-schema-registry.md; tests=bun test tests/db/migrations/<focused>.test.ts; title=connector framework interface
  - 13-api-and-webhooks/issues/10-jira-linear-adapters.md: ready-for-agent; deps=13-api-and-webhooks/issues/09-connector-framework-interface.md; tests=bun test tests/auth/<focused>.test.ts; title=jira linear adapters
  - 13-api-and-webhooks/issues/11-github-issues-adapter.md: ready-for-agent; deps=13-api-and-webhooks/issues/09-connector-framework-interface.md; tests=bun test tests/auth/<focused>.test.ts; title=github issues adapter

### B112 api-and-webhooks api-contract 4

- Phase: 999
- Status: ready-for-agent
- Risk: high
- Surfaces: api, platform, repos, web
- Depends on: B111
- Blocks: B113
- Frozen by active gate: yes
- Write set:
  - src/server/trpc/routers/**
  - src/trpc/**
  - tests/trpc/**
- Issues:
  - 13-api-and-webhooks/issues/12-confluence-notion-adapters.md: ready-for-agent; deps=13-api-and-webhooks/issues/09-connector-framework-interface.md; tests=bun test tests/auth/<focused>.test.ts; title=confluence notion adapters
  - 13-api-and-webhooks/issues/13-repo-supervision-connectors.md: ready-for-agent; deps=13-api-and-webhooks/issues/09-connector-framework-interface.md; tests=bun test tests/db/migrations/<focused>.test.ts; title=repo supervision connectors
  - 13-api-and-webhooks/issues/14-csv-import-export.md: ready-for-agent; deps=13-api-and-webhooks/issues/09-connector-framework-interface.md; tests=bun test tests/db/migrations/<focused>.test.ts; title=csv import export

### B113 api-and-webhooks api-contract 5

- Phase: 999
- Status: ready-for-agent
- Risk: high
- Surfaces: api, docs, platform, web
- Depends on: B109, B110, B111, B112
- Blocks: None
- Frozen by active gate: yes
- Write set:
  - src/server/trpc/routers/**
  - src/trpc/**
  - tests/trpc/**
- Issues:
  - 13-api-and-webhooks/issues/15-historical-imports-linear-jira-plane.md: ready-for-agent; deps=13-api-and-webhooks/issues/09-connector-framework-interface.md; tests=bun test tests/db/migrations/<focused>.test.ts; title=historical imports linear jira plane
  - 13-api-and-webhooks/issues/16-doctor-integration.md: ready-for-agent; deps=13-api-and-webhooks/issues/04-public-api-hono-setup.md,13-api-and-webhooks/issues/08-webhook-dispatcher-hmac-retry.md,13-api-and-webhooks/issues/09-connector-framework-interface.md; tests=bun test tests/db/migrations/<focused>.test.ts; title=doctor integration
  - 13-api-and-webhooks/issues/17-three-surfaces-parity-matrix.md: ready-for-agent; deps=13-api-and-webhooks/issues/06-rest-parity-search-notify-audit-runs.md,13-api-and-webhooks/issues/08-webhook-dispatcher-hmac-retry.md,13-api-and-webhooks/issues/12-confluence-notion-adapters.md,13-api-and-webhooks/issues/13-repo-supervision-connectors.md,13-api-and-webhooks/issues/14-csv-import-export.md,13-api-and-webhooks/issues/15-historical-imports-linear-jira-plane.md,13-api-and-webhooks/issues/16-doctor-integration.md; tests=bun test tests/trpc/<focused>.test.ts; title=three surfaces parity matrix

### B114 api-and-webhooks schema-contract

- Phase: 999
- Status: ready-for-agent
- Risk: high
- Surfaces: api, schema, web
- Depends on: B109
- Blocks: B109, B110, B111
- Frozen by active gate: yes
- Write set:
  - src/db/entities/**
  - src/db/migrations/**
  - tests/db/migrations/**
- Issues:
  - 13-api-and-webhooks/issues/03-zod-schema-registry.md: ready-for-agent; deps=13-api-and-webhooks/issues/01-trpc-router-scaffold.md; tests=bun test tests/db/migrations/<focused>.test.ts; title=zod schema registry
  - 13-api-and-webhooks/issues/07-webhook-schema-and-trpc.md: ready-for-agent; deps=13-api-and-webhooks/issues/01-trpc-router-scaffold.md,13-api-and-webhooks/issues/03-zod-schema-registry.md; tests=bun test tests/db/migrations/<focused>.test.ts; title=webhook schema and trpc

### B115 artifacts api-contract

- Phase: 999
- Status: ready-for-agent
- Risk: medium
- Surfaces: api, runtime
- Depends on: B118, B120
- Blocks: B116, B117, B120, B121, B122
- Frozen by active gate: yes
- Write set:
  - src/server/trpc/routers/**
  - src/trpc/**
  - tests/trpc/**
- Issues:
  - 10-artifacts/issues/06-trpc-procedures.md: ready-for-agent; deps=10-artifacts/issues/03-harvest-pipeline.md,10-artifacts/issues/05-retention-pruner.md; tests=bun test tests/db/migrations/<focused>.test.ts; title=tRPC artifacts.* procedures: full CRUD + attach/detach + prune + harvest (all verbs, Zod-validated)

### B116 artifacts cli-surface

- Phase: 999
- Status: ready-for-agent
- Risk: medium
- Surfaces: cli, runtime, tui, web
- Depends on: B115, B122
- Blocks: B122
- Frozen by active gate: yes
- Write set:
  - src/cli/**
  - tests/cli/**
- Issues:
  - 10-artifacts/issues/07-manual-upload.md: ready-for-agent; deps=10-artifacts/issues/06-trpc-procedures.md; tests=bun test tests/db/migrations/<focused>.test.ts; title=Manual upload: SvelteKit multipart action + edges attached_to + Web drag-drop widget + CLI upload + TUI hotkey
  - 10-artifacts/issues/08-preview-and-download.md: ready-for-agent; deps=10-artifacts/issues/06-trpc-procedures.md,10-artifacts/issues/07-manual-upload.md; tests=bun test tests/db/migrations/<focused>.test.ts; title=Artifact preview + download: text/image/binary surfaces across Web, CLI, TUI
  - 10-artifacts/issues/15-archive-delete-bulk-ops.md: ready-for-agent; deps=10-artifacts/issues/06-trpc-procedures.md,10-artifacts/issues/09-web-list-and-scoped-routes.md; tests=bun test tests/db/migrations/<focused>.test.ts; title=Archive/unarchive/delete + bulk operations: Web bulk action bar + CLI flags + TUI confirm prompts

### B117 artifacts gated-integration

- Phase: 999
- Status: ready-for-agent
- Risk: high
- Surfaces: runtime
- Depends on: B115, B119
- Blocks: None
- Frozen by active gate: no
- Write set:
  - src/artifacts/**
  - src/sandcastle/**
  - tests/orchestration/**
- Issues:
  - 10-artifacts/issues/13-s3-backend.md: ready-for-agent; deps=10-artifacts/issues/02-storage-backend.md,10-artifacts/issues/06-trpc-procedures.md; tests=bun test tests/db/migrations/<focused>.test.ts; title=Gated: S3Backend (external-storage-s3) + AzureBackend + GcsBackend + flag routing in StorageBackend factory

### B118 artifacts quality-gate

- Phase: 999
- Status: ready-for-agent
- Risk: medium
- Surfaces: docs, platform, runtime, tasks
- Depends on: B119, B121, B122
- Blocks: B115
- Frozen by active gate: no
- Write set:
  - src/artifacts/**
  - src/sandcastle/**
  - tests/orchestration/**
- Issues:
  - 10-artifacts/issues/05-retention-pruner.md: ready-for-agent; deps=10-artifacts/issues/01-schema-migration.md,10-artifacts/issues/02-storage-backend.md; tests=bun test tests/db/migrations/<focused>.test.ts; title=Retention pruner: artifact.prune cron, soft-delete, hard-delete, dry-run, doctor integration
  - 10-artifacts/issues/12-e2e-tests.md: ready-for-agent; deps=10-artifacts/issues/09-web-list-and-scoped-routes.md,10-artifacts/issues/10-cli-commands.md,10-artifacts/issues/11-tui-pane.md; tests=bun test tests/db/migrations/<focused>.test.ts; title=Playwright e2e + three-surface parity tests: upload, download, attach to task, prune dry-run, cross-surface consistency

### B119 artifacts runtime

- Phase: 999
- Status: ready-for-agent
- Risk: medium
- Surfaces: runtime
- Depends on: B121
- Blocks: B117, B118, B120
- Frozen by active gate: no
- Write set:
  - src/artifacts/**
  - src/sandcastle/**
  - tests/orchestration/**
- Issues:
  - 10-artifacts/issues/02-storage-backend.md: ready-for-agent; deps=10-artifacts/issues/01-schema-migration.md; tests=bun test tests/db/migrations/<focused>.test.ts; title=StorageBackend interface + LocalFsBackend: put/get/delete/exists + store root resolution

### B120 artifacts runtime-loop

- Phase: 999
- Status: ready-for-agent
- Risk: high
- Surfaces: docs, inference, orchestration, repos, runtime, search, tasks
- Depends on: B115, B119, B121
- Blocks: B115
- Frozen by active gate: no
- Write set:
  - docs/symphony-conformance.md
  - inference/**
  - src/artifacts/**
  - src/cli/inference*
  - src/inference/**
  - src/orchestration/**
  - src/sandcastle/**
  - tests/orchestration/**
  - tests/symphony/**
- Issues:
  - 10-artifacts/issues/03-harvest-pipeline.md: ready-for-agent; deps=10-artifacts/issues/01-schema-migration.md,10-artifacts/issues/02-storage-backend.md; tests=bun test tests/db/migrations/<focused>.test.ts; title=Harvest pipeline: SHA-256, MIME sniff, store copy, DB row, edges rows, search_documents upsert
  - 10-artifacts/issues/04-worker-job.md: ready-for-agent; deps=10-artifacts/issues/03-harvest-pipeline.md; tests=bun test tests/db/migrations/<focused>.test.ts; title=graphile-worker job: artifact.harvest task + enqueue shim from Symphony after_run hook
  - 10-artifacts/issues/14-llm-narration.md: ready-for-agent; deps=10-artifacts/issues/03-harvest-pipeline.md,10-artifacts/issues/06-trpc-procedures.md; tests=bun test tests/db/migrations/<focused>.test.ts; title=Gated: report-llm-narration — post-harvest inference sidecar call + metadata_json.narration write

### B121 artifacts schema-contract

- Phase: 999
- Status: ready-for-agent
- Risk: high
- Surfaces: api, cli, inference, runtime, schema
- Depends on: B115
- Blocks: B118, B119, B120
- Frozen by active gate: yes
- Write set:
  - src/db/entities/**
  - src/db/migrations/**
  - tests/db/migrations/**
- Issues:
  - 10-artifacts/issues/01-schema-migration.md: ready-for-agent; deps=None; tests=bun test tests/db/migrations/<focused>.test.ts; title=Artifact entity migration class: indexes, retention properties, projects amendment
  - 10-artifacts/issues/10-cli-commands.md: ready-for-agent; deps=10-artifacts/issues/06-trpc-procedures.md; tests=bun test tests/db/migrations/<focused>.test.ts; title=CLI artifacts commands: all verbs, --json everywhere, auto-generated from tRPC schema

### B122 artifacts tui-surface

- Phase: 999
- Status: ready-for-agent
- Risk: medium
- Surfaces: runtime, tasks, tui, web
- Depends on: B115, B116
- Blocks: B116, B118
- Frozen by active gate: yes
- Write set:
  - src/tui/**
  - tests/tui/**
- Issues:
  - 10-artifacts/issues/09-web-list-and-scoped-routes.md: ready-for-agent; deps=10-artifacts/issues/06-trpc-procedures.md,10-artifacts/issues/08-preview-and-download.md; tests=bun test tests/db/migrations/<focused>.test.ts; title=Web artifact routes: /artifacts list + filter panel + /runs/<id>/artifacts + /tasks/<id>/artifacts + /projects/<id>/artifacts disk usage
  - 10-artifacts/issues/11-tui-pane.md: ready-for-agent; deps=10-artifacts/issues/06-trpc-procedures.md,10-artifacts/issues/08-preview-and-download.md; tests=bun test tests/db/migrations/<focused>.test.ts; title=TUI artifacts pane: list + preview + keyboard ops (u/d/a/D/f/Enter)

### B128 notifications-activity-audit api-contract 1

- Phase: 999
- Status: ready-for-agent
- Risk: high
- Surfaces: api, notifications, orchestration, web
- Depends on: B134, B137
- Blocks: B129, B131, B135, B136, B137, B138
- Frozen by active gate: yes
- Write set:
  - src/server/trpc/routers/**
  - src/trpc/**
  - tests/trpc/**
- Issues:
  - 12-notifications-activity-audit/issues/05-trpc-notify-procedures.md: ready-for-agent; deps=12-notifications-activity-audit/issues/04-fanout-worker.md; tests=bun test tests/db/migrations/<focused>.test.ts; title=tRPC notify.* procedures: list, unreadCount, markRead, markAllRead, mute, unmute, rules CRUD, channels, quietHours
  - 12-notifications-activity-audit/issues/17-webhook-channel.md: ready-for-agent; deps=12-notifications-activity-audit/issues/04-fanout-worker.md,12-notifications-activity-audit/issues/07-quiet-hours.md; tests=bun test tests/db/migrations/<focused>.test.ts; title=Gated: notify-webhook — HTTP POST + HMAC X-Fulcrum-Signature-256 + exponential backoff + max retry
  - 12-notifications-activity-audit/issues/19-vapid-push-channel.md: ready-for-agent; deps=12-notifications-activity-audit/issues/04-fanout-worker.md,12-notifications-activity-audit/issues/07-quiet-hours.md; tests=bun test tests/db/migrations/<focused>.test.ts; title=Gated: notify-push VAPID Web Push — web-push npm + service worker + push_subscriptions + 410 cleanup

### B129 notifications-activity-audit api-contract 2

- Phase: 999
- Status: ready-for-agent
- Risk: high
- Surfaces: api, notifications
- Depends on: B128, B130
- Blocks: None
- Frozen by active gate: yes
- Write set:
  - src/server/trpc/routers/**
  - src/trpc/**
  - tests/trpc/**
- Issues:
  - 12-notifications-activity-audit/issues/21-public-api-notify-audit.md: ready-for-agent; deps=12-notifications-activity-audit/issues/05-trpc-notify-procedures.md,12-notifications-activity-audit/issues/06-trpc-audit-procedures.md; tests=bun test tests/db/migrations/<focused>.test.ts; title=Gated: public-api REST — GET|POST|PATCH|DELETE /api/v1/notifications/* + GET /api/v1/audit

### B130 notifications-activity-audit auth-permissions

- Phase: 999
- Status: ready-for-agent
- Risk: high
- Surfaces: api, notifications, permissions, platform, web
- Depends on: B135
- Blocks: B129, B131, B133, B136
- Frozen by active gate: yes
- Write set:
  - src/permissions/**
  - src/trpc/middleware.ts
  - tests/permissions/**
- Issues:
  - 12-notifications-activity-audit/issues/06-trpc-audit-procedures.md: ready-for-agent; deps=12-notifications-activity-audit/issues/01-schema-migration.md; tests=bun test tests/db/migrations/<focused>.test.ts; title=tRPC audit.* procedures: query + export + retentionPolicy CRUD (A4 scope)
  - 12-notifications-activity-audit/issues/08-audit-retention-cron.md: ready-for-agent; deps=12-notifications-activity-audit/issues/06-trpc-audit-procedures.md; tests=bun test tests/db/migrations/<focused>.test.ts; title=Audit log retention cron: daily prune of events past retain_days, per-org policy, audit of prune action
  - 12-notifications-activity-audit/issues/12-web-audit-viewer.md: ready-for-agent; deps=12-notifications-activity-audit/issues/06-trpc-audit-procedures.md,12-notifications-activity-audit/issues/08-audit-retention-cron.md; tests=bun test tests/db/migrations/<focused>.test.ts; title=Web /audit: filter toolbar + paginated table + CSV/JSON export + retention policy settings

### B131 notifications-activity-audit cli-surface

- Phase: 999
- Status: ready-for-agent
- Risk: high
- Surfaces: cli, notifications, platform
- Depends on: B128, B130
- Blocks: B133
- Frozen by active gate: yes
- Write set:
  - src/cli/**
  - tests/cli/**
- Issues:
  - 12-notifications-activity-audit/issues/13-cli-notify-commands.md: ready-for-agent; deps=12-notifications-activity-audit/issues/05-trpc-notify-procedures.md; tests=bun test tests/db/migrations/<focused>.test.ts; title=CLI notify commands: list/read/mark-read/mute/unmute + rules * + channels * — --json everywhere
  - 12-notifications-activity-audit/issues/14-cli-audit-commands.md: ready-for-agent; deps=12-notifications-activity-audit/issues/06-trpc-audit-procedures.md; tests=bun test tests/db/migrations/<focused>.test.ts; title=CLI audit commands: fulcrum audit query + export --format csv|json --output

### B132 notifications-activity-audit gated-integration

- Phase: 999
- Status: ready-for-agent
- Risk: high
- Surfaces: docs, notifications
- Depends on: B134, B137
- Blocks: None
- Frozen by active gate: no
- Write set:
  - src/docs/**
  - src/web/src/lib/components/markdown/**
  - src/web/src/routes/docs/**
- Issues:
  - 12-notifications-activity-audit/issues/16-email-smtp-channel.md: ready-for-agent; deps=12-notifications-activity-audit/issues/04-fanout-worker.md,12-notifications-activity-audit/issues/07-quiet-hours.md; tests=bun test tests/db/migrations/<focused>.test.ts; title=Gated: notify-email SMTP channel — nodemailer + Eta template + delivery row + rate limiter + email verify

### B133 notifications-activity-audit quality-gate

- Phase: 999
- Status: ready-for-agent
- Risk: low
- Surfaces: notifications
- Depends on: B130, B131, B135, B136, B138
- Blocks: None
- Frozen by active gate: no
- Write set:
  - src/audit/**
  - src/notifications/**
  - tests/notifications/**
- Issues:
  - 12-notifications-activity-audit/issues/22-e2e-acceptance-tests.md: ready-for-agent; deps=12-notifications-activity-audit/issues/10-web-inbox-and-activity.md,12-notifications-activity-audit/issues/11-web-notification-settings.md,12-notifications-activity-audit/issues/12-web-audit-viewer.md,12-notifications-activity-audit/issues/13-cli-notify-commands.md,12-notifications-activity-audit/issues/14-cli-audit-commands.md,12-notifications-activity-audit/issues/15-tui-inbox-and-audit.md; tests=bun test tests/db/migrations/<focused>.test.ts; title=Playwright e2e + three-surface parity + performance acceptance tests

### B134 notifications-activity-audit runtime-loop

- Phase: 999
- Status: ready-for-agent
- Risk: low
- Surfaces: notifications
- Depends on: B135, B137
- Blocks: B128, B132, B137, B138
- Frozen by active gate: no
- Write set:
  - src/audit/**
  - src/notifications/**
  - tests/notifications/**
- Issues:
  - 12-notifications-activity-audit/issues/04-fanout-worker.md: ready-for-agent; deps=12-notifications-activity-audit/issues/02-rule-engine.md,12-notifications-activity-audit/issues/03-default-rules-seeding.md; tests=bun test tests/db/migrations/<focused>.test.ts; title=graphile-worker notify-fan-out: event → evaluate rules → write user_notifications + dedup

### B135 notifications-activity-audit schema-contract

- Phase: 999
- Status: ready-for-agent
- Risk: high
- Surfaces: api, notifications, permissions, schema, web
- Depends on: B128, B137
- Blocks: B130, B133, B134, B137
- Frozen by active gate: yes
- Write set:
  - src/db/entities/**
  - src/db/migrations/**
  - tests/db/migrations/**
- Issues:
  - 12-notifications-activity-audit/issues/01-schema-migration.md: ready-for-agent; deps=None; tests=bun test tests/db/migrations/<focused>.test.ts; title=Migration class: NotificationRule, Notification, NotificationDelivery, NotificationMute, NotificationQuietHours, EventRetentionPolicy, WebhookRuleConfig, PushSubscription
  - 12-notifications-activity-audit/issues/03-default-rules-seeding.md: ready-for-agent; deps=12-notifications-activity-audit/issues/01-schema-migration.md; tests=bun test tests/db/migrations/<focused>.test.ts; title=Default notification rules seeding: 4 defaults on user create, idempotent
  - 12-notifications-activity-audit/issues/10-web-inbox-and-activity.md: ready-for-agent; deps=12-notifications-activity-audit/issues/05-trpc-notify-procedures.md,12-notifications-activity-audit/issues/09-bell-counter-poll.md; tests=bun test tests/db/migrations/<focused>.test.ts; title=Web /inbox + /projects/<id>/activity: tabs, TanStack Virtual scroll, filter toolbar, per-entity activity

### B136 notifications-activity-audit tui-surface

- Phase: 999
- Status: ready-for-agent
- Risk: high
- Surfaces: docs, notifications, platform, tui, web
- Depends on: B128, B130
- Blocks: B133
- Frozen by active gate: yes
- Write set:
  - src/tui/**
  - tests/tui/**
- Issues:
  - 12-notifications-activity-audit/issues/15-tui-inbox-and-audit.md: ready-for-agent; deps=12-notifications-activity-audit/issues/05-trpc-notify-procedures.md,12-notifications-activity-audit/issues/06-trpc-audit-procedures.md; tests=bun test tests/db/migrations/<focused>.test.ts; title=TUI: Inbox screen (R/M/Enter) + Activity feed (filter chips) + Audit panel (scroll/E export) + Rules editor

### B137 notifications-activity-audit web-surface 1

- Phase: 999
- Status: ready-for-agent
- Risk: high
- Surfaces: notifications, orchestration, web
- Depends on: B128, B134, B135
- Blocks: B128, B132, B134, B135, B138
- Frozen by active gate: yes
- Write set:
  - src/web/src/lib/components/**
  - src/web/src/routes/**
  - src/web/tests/**
- Issues:
  - 12-notifications-activity-audit/issues/02-rule-engine.md: ready-for-agent; deps=12-notifications-activity-audit/issues/01-schema-migration.md; tests=bun test tests/db/migrations/<focused>.test.ts; title=Rule engine: src/notifications/rule-engine.ts — pattern matching, $me resolution, mute short-circuit, disabled rule skip
  - 12-notifications-activity-audit/issues/07-quiet-hours.md: ready-for-agent; deps=12-notifications-activity-audit/issues/01-schema-migration.md,12-notifications-activity-audit/issues/04-fanout-worker.md; tests=bun test tests/db/migrations/<focused>.test.ts; title=Quiet hours: src/notifications/quiet-hours.ts — window check, retry-after-quiet job, tz support
  - 12-notifications-activity-audit/issues/09-bell-counter-poll.md: ready-for-agent; deps=12-notifications-activity-audit/issues/05-trpc-notify-procedures.md; tests=bun test tests/db/migrations/<focused>.test.ts; title=Bell-icon counter: 60s poll (always-on) + WebSocket update (real-time-collab-server gated) + badge clear

### B138 notifications-activity-audit web-surface 2

- Phase: 999
- Status: ready-for-agent
- Risk: high
- Surfaces: inference, notifications, orchestration, web
- Depends on: B128, B134, B137
- Blocks: B133
- Frozen by active gate: yes
- Write set:
  - src/web/src/lib/components/**
  - src/web/src/routes/**
  - src/web/tests/**
- Issues:
  - 12-notifications-activity-audit/issues/11-web-notification-settings.md: ready-for-agent; deps=12-notifications-activity-audit/issues/05-trpc-notify-procedures.md,12-notifications-activity-audit/issues/07-quiet-hours.md; tests=bun test tests/db/migrations/<focused>.test.ts; title=Web /settings/notifications: rules CRUD + channel toggles + quiet-hours + mute list + channels config
  - 12-notifications-activity-audit/issues/18-slack-discord-channels.md: ready-for-agent; deps=12-notifications-activity-audit/issues/04-fanout-worker.md,12-notifications-activity-audit/issues/07-quiet-hours.md; tests=bun test tests/db/migrations/<focused>.test.ts; title=Gated: notify-slack (Block Kit) + notify-discord (embed POST) — fetch + quiet-hours + rate-limit backoff
  - 12-notifications-activity-audit/issues/20-realtime-bell-websocket.md: ready-for-agent; deps=12-notifications-activity-audit/issues/09-bell-counter-poll.md; tests=bun test tests/db/migrations/<focused>.test.ts; title=Gated: real-time-collab-server — Hocuspocus WebSocket bell badge updates <2s

### B139 search-and-discovery api-contract

- Phase: 999
- Status: ready-for-agent
- Risk: high
- Surfaces: api, memory, search
- Depends on: B144, B145, B147
- Blocks: B140, B141, B142, B146, B147
- Frozen by active gate: yes
- Write set:
  - src/server/trpc/routers/**
  - src/trpc/**
  - tests/trpc/**
- Issues:
  - 11-search-and-discovery/issues/05-fts-query-ranking.md: ready-for-agent; deps=11-search-and-discovery/issues/03-indexers-task-doc-memory.md,11-search-and-discovery/issues/04-indexers-run-artifact-repo-sprint.md; tests=bun test tests/db/migrations/<focused>.test.ts; title=tRPC search.query: FTS + BM25+recency+kind_boost ranking + facets + pagination
  - 11-search-and-discovery/issues/07-saved-searches.md: ready-for-agent; deps=11-search-and-discovery/issues/05-fts-query-ranking.md; tests=bun test tests/db/migrations/<focused>.test.ts; title=Saved searches: tRPC search.saved* CRUD + view_type='search' + scope checks
  - 11-search-and-discovery/issues/17-public-api-search-endpoints.md: ready-for-agent; deps=11-search-and-discovery/issues/05-fts-query-ranking.md,11-search-and-discovery/issues/06-suggest-and-quick-filter.md,11-search-and-discovery/issues/07-saved-searches.md; tests=bun test tests/db/migrations/<focused>.test.ts; title=Gated: public-api search REST endpoints — GET /api/v1/search + /suggest + /search/saved

### B140 search-and-discovery cli-surface 1

- Phase: 999
- Status: ready-for-agent
- Risk: medium
- Surfaces: cli, search, tui, web
- Depends on: B139, B147
- Blocks: B143
- Frozen by active gate: yes
- Write set:
  - src/cli/**
  - tests/cli/**
- Issues:
  - 11-search-and-discovery/issues/08-client-cache.md: ready-for-agent; deps=11-search-and-discovery/issues/05-fts-query-ranking.md; tests=bun test tests/db/migrations/<focused>.test.ts; title=Client-side search cache: 50-query LRU, 60s TTL, mutation invalidation (Web + TUI/CLI in-process)
  - 11-search-and-discovery/issues/10-cmdk-palette-web.md: ready-for-agent; deps=11-search-and-discovery/issues/05-fts-query-ranking.md,11-search-and-discovery/issues/06-suggest-and-quick-filter.md,11-search-and-discovery/issues/08-client-cache.md; tests=bun test tests/db/migrations/<focused>.test.ts; title=Web Cmd+K palette: search mode + command mode (>) + quick-filter + keyboard nav
  - 11-search-and-discovery/issues/12-cli-commands.md: ready-for-agent; deps=11-search-and-discovery/issues/05-fts-query-ranking.md,11-search-and-discovery/issues/06-suggest-and-quick-filter.md,11-search-and-discovery/issues/07-saved-searches.md; tests=bun test tests/db/migrations/<focused>.test.ts; title=CLI search commands: fulcrum search + suggest + saved + cmdk --json everywhere

### B141 search-and-discovery cli-surface 2

- Phase: 999
- Status: ready-for-agent
- Risk: high
- Surfaces: cli, inference, platform, repos, search
- Depends on: B139, B147
- Blocks: None
- Frozen by active gate: yes
- Write set:
  - src/cli/**
  - tests/cli/**
- Issues:
  - 11-search-and-discovery/issues/16-nl-filter-and-telemetry.md: ready-for-agent; deps=11-search-and-discovery/issues/05-fts-query-ranking.md,11-search-and-discovery/issues/06-suggest-and-quick-filter.md; tests=bun test tests/db/migrations/<focused>.test.ts; title=Gated: NL→filter translation (report-llm-narration flag) + search-click-telemetry writes

### B142 search-and-discovery gated-integration

- Phase: 999
- Status: ready-for-agent
- Risk: high
- Surfaces: inference, search
- Depends on: B139, B144, B145
- Blocks: None
- Frozen by active gate: no
- Write set:
  - inference/**
  - src/cli/inference*
  - src/inference/**
  - src/search/**
  - src/web/src/routes/search/**
  - tests/search/**
- Issues:
  - 11-search-and-discovery/issues/14-embeddings-hybrid-search.md: ready-for-agent; deps=11-search-and-discovery/issues/03-indexers-task-doc-memory.md,11-search-and-discovery/issues/04-indexers-run-artifact-repo-sprint.md,11-search-and-discovery/issues/05-fts-query-ranking.md; tests=bun test tests/db/migrations/<focused>.test.ts; title=Gated: embeddings hybrid search (FULCRUM_FEATURES=embeddings) — pgvector IVFFlat + hybrid scoring
  - 11-search-and-discovery/issues/15-meilisearch-backend.md: ready-for-agent; deps=11-search-and-discovery/issues/03-indexers-task-doc-memory.md,11-search-and-discovery/issues/04-indexers-run-artifact-repo-sprint.md,11-search-and-discovery/issues/05-fts-query-ranking.md; tests=bun test tests/db/migrations/<focused>.test.ts; title=Gated: external-search-meilisearch — dual-write + query backend switch + PGlite fallback

### B143 search-and-discovery quality-gate

- Phase: 999
- Status: ready-for-agent
- Risk: low
- Surfaces: search
- Depends on: B140, B146
- Blocks: None
- Frozen by active gate: no
- Write set:
  - src/search/**
  - src/web/src/routes/search/**
  - tests/search/**
- Issues:
  - 11-search-and-discovery/issues/18-performance-and-e2e-tests.md: ready-for-agent; deps=11-search-and-discovery/issues/09-web-search-page.md,11-search-and-discovery/issues/10-cmdk-palette-web.md,11-search-and-discovery/issues/12-cli-commands.md,11-search-and-discovery/issues/13-tui-search-and-palette.md; tests=bun test tests/db/migrations/<focused>.test.ts; title=Performance benchmarks + Playwright e2e + three-surface parity acceptance tests

### B146 search-and-discovery tui-surface

- Phase: 999
- Status: ready-for-agent
- Risk: medium
- Surfaces: search, tui, web
- Depends on: B139, B147
- Blocks: B143
- Frozen by active gate: yes
- Write set:
  - src/tui/**
  - tests/tui/**
- Issues:
  - 11-search-and-discovery/issues/09-web-search-page.md: ready-for-agent; deps=11-search-and-discovery/issues/05-fts-query-ranking.md,11-search-and-discovery/issues/06-suggest-and-quick-filter.md,11-search-and-discovery/issues/07-saved-searches.md; tests=bun test tests/db/migrations/<focused>.test.ts; title=Web /search route: SSR + URL params + left-rail facets panel + kind-grouped result list
  - 11-search-and-discovery/issues/13-tui-search-and-palette.md: ready-for-agent; deps=11-search-and-discovery/issues/05-fts-query-ranking.md,11-search-and-discovery/issues/06-suggest-and-quick-filter.md,11-search-and-discovery/issues/07-saved-searches.md; tests=bun test tests/db/migrations/<focused>.test.ts; title=TUI: Cmd+K overlay + full-screen search + in-panel bars

### B147 search-and-discovery web-surface

- Phase: 999
- Status: ready-for-agent
- Risk: medium
- Surfaces: docs, memory, repos, runtime, search, tasks, web
- Depends on: B139
- Blocks: B139, B140, B141, B146
- Frozen by active gate: yes
- Write set:
  - src/web/src/lib/components/**
  - src/web/src/routes/**
  - src/web/tests/**
- Issues:
  - 11-search-and-discovery/issues/06-suggest-and-quick-filter.md: ready-for-agent; deps=11-search-and-discovery/issues/05-fts-query-ranking.md; tests=bun test tests/db/migrations/<focused>.test.ts; title=search.suggest + quick-filter parser: prefix autocomplete + inline kind:/project:/assignee:/status:/tag: tokens
  - 11-search-and-discovery/issues/11-in-context-search-bars.md: ready-for-agent; deps=11-search-and-discovery/issues/05-fts-query-ranking.md,11-search-and-discovery/issues/06-suggest-and-quick-filter.md; tests=bun test tests/db/migrations/<focused>.test.ts; title=In-context search bars: scoped search on task/doc/run/artifact/repo list views (Web)

