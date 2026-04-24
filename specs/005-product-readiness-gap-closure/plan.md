# Implementation Plan: Fulcrum Product Readiness Gap Closure

**Branch**: `005-product-readiness-gap-closure` | **Date**: 2026-04-24 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `specs/005-product-readiness-gap-closure/spec.md`

## Summary

Close the gap between Product/SRS intent and the current 004 implementation by adding executable compliance tracking, packaged/local install readiness, SQLite canonical state cutover, full doctor matrix, real-agent acceptance, certified adapters, owned cockpit workflows, graph/cache correctness, and a release-readiness evidence workflow.

## Technical Context

**Language/Version**: TypeScript-first, portable across Node.js and Bun unless justified otherwise  
**Primary Dependencies**: Existing pnpm workspace, Commander CLI, Hono server, React/Vite cockpit, Ink TUI, MCP TypeScript SDK, better-sqlite3, execa, Vitest, Playwright  
**Storage**: SQLite canonical local state; JSON/JSONL only as mirror/export/evidence; local filesystem artifacts/logs/backups  
**Testing**: Unit, contract, integration, policy, privacy/no-network, recovery, adapter degradation, real-agent acceptance, Playwright cockpit, quickstart, release evidence  
**Target Platform**: Local developer machine, loopback-only services by default  
**Project Type**: Local CLI agent OS with CLI, local API/server, cockpit, TUI, MCP, adapters, persistence, and release tooling  
**Performance Goals**: Doctor quick under 3s excluding deep probes; common local status under 1s; release validation may be explicit/long-running  
**Constraints**: local-first core, no hidden network, operator approval for dangerous actions, explicit provenance, TypeScript boundary discipline, no Bun-only requirement  
**Scale/Scope**: One operator, many repositories/projects/tasks/agents, local canonical state, optional remote adapters

## Constitution Check

- **Local-first core**: PASS. Stories require no-network setup, doctor, package fallback, local workflows, and degraded remote adapters.
- **Operator control**: PASS. Packaging/global mutations, public bind, external writeback, permanent memory, destructive actions, and remote providers are policy gated.
- **Canonical local state**: PASS. SQLite cutover is explicit P1 story; JSON becomes rebuildable mirror/export.
- **Evidence/provenance**: PASS. Compliance, adapter certification, graph/cache invalidation, release evidence, and cockpit workflows all require source/test/artifact refs.
- **Minimum reinvention/adapters**: PASS. Real tools remain adapters; missing tools degrade; simulated adapters are test-only.
- **Security/privacy/policy**: PASS. Redaction, ignore rules, credentials, telemetry, remote provider, local-only, and no hidden network are acceptance requirements.
- **Incremental delivery/quality gates**: PASS. Each user story has independent tests and release gate integration.
- **TypeScript boundary discipline**: PASS. Work stays in existing apps/packages; Bun is optional target only.

## Project Structure

### Documentation

```text
specs/005-product-readiness-gap-closure/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── compliance-contract.md
│   └── release-readiness-contract.md
├── checklists/
│   └── requirements.md
└── tasks.md
```

### Source Code

```text
apps/
├── cli/
├── server/
├── cockpit/
└── tui/

packages/
├── shared/
├── db/
├── core/
├── mcp/
├── plane/
├── memory/
├── code-tools/
├── agents/
└── policy/

docs/
tests/
```

**Structure Decision**: Extend the existing TypeScript monorepo. Add missing contracts/schemas/services in shared/core/db, wire all surfaces through existing app packages, and place validation in tests plus release evidence scripts/commands.

## Complexity Tracking

No constitution violations. Complexity comes from broad product surface, but this feature exists specifically because partial readiness is unacceptable.
