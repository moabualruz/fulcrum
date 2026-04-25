# Implementation Plan: [FEATURE]

**Branch**: `[###-feature-name]` | **Date**: [DATE] | **Spec**: [link]
**Input**: Feature specification from `/specs/[###-feature-name]/spec.md`

**Note**: This template is filled in by the `/speckit.plan` command. See `.specify/templates/plan-template.md` for the execution workflow.

## Summary

[Extract from feature spec: primary requirement + technical approach from research]

## Technical Context

<!--
  ACTION REQUIRED: Replace the content in this section with the technical details
  for the project. The structure here is presented in advisory capacity to guide
  the iteration process.
-->

**Language/Version**: TypeScript-first, portable across Node.js and Bun unless justified otherwise
**Primary Dependencies**: [e.g., MCP TypeScript SDK, Hono/Fastify, React/Vite, SQLite driver, Drizzle/Kysely/raw SQL, execa/Bun.spawn or NEEDS CLARIFICATION]
**Storage**: SQLite canonical local state plus rebuildable derived indexes/caches where applicable
**Testing**: [e.g., unit, contract, integration, quickstart, doctor, policy, worktree safety, privacy/no-network or NEEDS CLARIFICATION]
**Target Platform**: Local developer machine with loopback-only local services by default
**Project Type**: Local CLI agent OS: CLI + local API/MCP server + cockpit UI + adapter packages
**Performance Goals**: [domain-specific local goals, e.g., responsive cockpit, bounded context build, fast doctor or NEEDS CLARIFICATION]
**Constraints**: local-first core, no hidden network access, operator approval for dangerous actions, explicit provenance, TypeScript boundary discipline
**Scale/Scope**: One operator, many local repositories/projects, many CLI agents, local canonical state

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

- **Local-first core**: Core workflow runs without cloud services, hidden network calls, hosted PM, remote model, or remote telemetry; any network dependency is opt-in with fallback/degraded state.
- **Operator control**: Dangerous, destructive, externally visible, or permanent-memory actions have policy approval paths and visible run/task linkage.
- **Canonical local state**: Plan identifies canonical SQLite/local records, external source-of-truth boundaries, rebuildable derived data, and terminal-state rules.
- **Evidence/provenance**: Context, memory, code search, quality gates, artifacts, and decisions expose source refs, freshness, inclusion reason, and limitations.
- **Minimum reinvention/adapters**: Mature tools are used through replaceable adapters unless custom ownership is justified; each adapter has health, offline, disablement, and rebuild/import/export behavior.
- **Security/privacy/policy**: Secrets, ignored paths, logs, traces, external data sharing, credential storage, loopback binding, redaction, and no-network checks are covered where relevant.
- **Incremental delivery/quality gates**: User-story slices are independently testable and include validation for primary workflow, degraded states, recovery, and quickstart/doctor behavior.
- **TypeScript boundary discipline**: Core services, MCP tools, CLI, cockpit, adapters, shared schemas, and persistence boundaries are explicit; non-TypeScript or Bun-only choices are justified.

## Project Structure

### Documentation (this feature)

```text
specs/[###-feature]/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output (/speckit.plan command)
├── data-model.md        # Phase 1 output (/speckit.plan command)
├── quickstart.md        # Phase 1 output (/speckit.plan command)
├── contracts/           # Phase 1 output (/speckit.plan command)
└── tasks.md             # Phase 2 output (/speckit.tasks command - NOT created by /speckit.plan)
```

### Source Code (repository root)

<!--
  ACTION REQUIRED: Replace the placeholder tree below with the concrete layout
  for this feature. Delete unused options and expand the chosen structure with
  real paths (e.g., apps/admin, packages/something). The delivered plan must
  not include Option labels.
-->

```text
apps/
├── cli/                 # fulcrum CLI entrypoint and command wiring
├── server/              # local API server and MCP server composition
└── cockpit/             # local cockpit UI

packages/
├── core/                # task/run/worktree/context domain services
├── db/                  # SQLite schema, migrations, repositories
├── mcp/                 # MCP tools/resources calling core services
├── plane/               # optional PM adapter
├── memory/              # memory backend adapters
├── code-tools/          # rg/fd/ast-grep/repo-map/repomix wrappers
├── agents/              # CLI agent wrappers
└── shared/              # schemas, event types, IDs, JSON contracts

tests/
├── contract/
├── integration/
├── policy/
├── privacy/
├── recovery/
└── unit/
```

**Structure Decision**: [Document the selected structure and reference the real
directories captured above]

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

| Violation                  | Why Needed         | Simpler Alternative Rejected Because |
| -------------------------- | ------------------ | ------------------------------------ |
| [e.g., 4th project]        | [current need]     | [why 3 projects insufficient]        |
| [e.g., Repository pattern] | [specific problem] | [why direct DB access insufficient]  |
