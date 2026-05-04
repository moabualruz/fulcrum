---
Status: completed
Owner: codex-orchestrator
Triage: AFK
Pillar: api-and-webhooks
Blocked-by: []
PRD: .scratch/agent-os-vision/prds/13-api-and-webhooks.md
Requirements: .scratch/agent-os-vision/REQUIREMENTS.md (Pillar 13 section)
Decisions: [Q28, A6, C4, D5]
Vision: .scratch/agent-os-vision/VISION-GAPS.md ("API / webhooks / integrations" row)
Docs: [https://trpc.io/docs/v11]
---

## Parent

Pillar 13 — API Surface + Webhooks + Connector Framework

## What to build

Scaffold the consolidated tRPC v11 `appRouter` in `src/server/trpc/router.ts` that merges all domain sub-routers (projects, tasks, sprints, custom_fields, saved_views, docs, doc_versions, doc_comments, doc_links, memories, context, agent_runs, artifacts, repos, repo_branches, repo_commits, search, notify, audit, routing, fulcrum_skills, orchestration, inference, webhooks, connectors, doctor, invitations, auth, orgs, flags). Wire OTel span middleware (`src/server/trpc/middleware/otel.ts`) and request-ID middleware (`src/server/trpc/middleware/requestId.ts`) onto every procedure. `assertPermission()` enforced on every mutation via lint rule. Context carries `{ orgId, userId, session, requestId }` from Pillar 1 auth. Every procedure has a Zod input + output schema — no `z.any()` on public procedures.

- **Web**: SvelteKit server-actions consume tRPC via `createTRPCProxyClient` + `@trpc/server/adapters/fetch`.
- **CLI**: `AppRouter` type exported; codegen (Pillar 14) reads it.
- **TUI**: in-process `createCaller(ctx)` uses same `appRouter`.

## Acceptance criteria

- [x] `appRouter` compiles; `bun run type-check` exits 0 with all 28 sub-router stubs merged.
- [x] OTel middleware emits span `fulcrum.trpc.<domain>.<procedure>` with `org.id`, `user.id`, `request.id` attributes; no-op when exporter unset.
- [x] Request-ID middleware injects UUID in context + `X-Fulcrum-Request-Id` response header; same ID appears in error payload.
- [x] Lint rule `assertPermission-required` fails CI when any mutation lacks `assertPermission()` call.
- [x] No `z.any()` in any public procedure input or output schema (CI enforced by `ci:codegen` stage).
- [x] Unit test: each of the 28 sub-router stubs has at minimum `list`, `get`, `create`, `update`, `delete` procedures (where domain-applicable) returning typed Zod output.

## Blocked by

None - can start immediately (requires Pillar 1 tRPC context + auth context to be stable)

## Notes

P13.01–P13.04 maps to this slice. Sub-routers for Pillars 2–12 domains are initially stubs; their full implementation is owned by those pillars. This slice seals the `AppRouter` type so Pillar 14 codegen can start.
