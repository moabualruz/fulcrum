---
Status: ready-for-agent
Triage: AFK
Pillar: api-and-webhooks
Blocked-by: [13/issues/01-trpc-router-scaffold.md]
PRD: .scratch/agent-os-vision/prds/13-api-and-webhooks.md
Requirements: .scratch/agent-os-vision/REQUIREMENTS.md (Pillar 13 section)
Decisions: [Q28, A6, D5]
Vision: .scratch/agent-os-vision/VISION-GAPS.md ("API / webhooks / integrations" row)
Docs: [https://zod.dev]
---

## Parent

Pillar 13 — API Surface + Webhooks + Connector Framework

## What to build

Establish the Zod schema registry in `src/server/trpc/schemas/`. One schema file per domain (projects, tasks, sprints, docs, memories, runs, artifacts, repos, search, notify, audit, routing, skills, webhooks, connectors, inference, orchestration, flags, auth, orgs). Each file exports: `<Domain>Input`, `<Domain>Output`, and any shared sub-shapes. All schemas pass `z.parse()` round-trips. CI stage `ci:schemas` imports every schema file and asserts no `z.any()` usage on public procedures. Error model shapes: `{ code, message, requestId }` for tRPC errors; `{ error: { code, message, requestId } }` for REST.

- **Web**: SvelteKit form actions use schema imports for client-side validation.
- **CLI**: codegen (Pillar 14) derives flag definitions from these Zod schemas.
- **TUI**: in-process tRPC caller validates responses against these schemas.

## Acceptance criteria

- [ ] `src/server/trpc/schemas/` contains one file per domain (20 files minimum).
- [ ] Every exported schema: `z.object()` at root (no `z.any()` on public fields); description strings on all fields (used for CLI help text + OpenAPI descriptions).
- [ ] `bun run ci` `ci:schemas` stage: imports all schema files; asserts zero `z.any()` on public input/output types; exits non-zero on violation.
- [ ] Round-trip test: `z.parse(z.serialize(value))` identity for every schema with fixture data.
- [ ] Error shape schemas: `TRPCErrorShape` and `RESTErrorShape` exported and used by all middleware.

## Blocked by

- 13/issues/01-trpc-router-scaffold.md

## Notes

P13.04 maps to this slice. Schemas are the contract Pillars 14 and 15 depend on; must be locked before those pillars begin codegen.
