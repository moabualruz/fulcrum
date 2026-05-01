---
Status: ready-for-agent
Triage: AFK
Pillar: 05-router-and-skills
Blocked-by: 07-routing-trpc-procedures
---

# CLI fulcrum routing rules * commands

## Parent: PRD `prds/05-router-and-skills.md`

## What to build

Implement all `fulcrum routing rules` CLI commands via tRPC procedure bindings: `list`, `create`, `update`, `delete`, `test`, `dry-run`. Each command has `--json` output mode; `list` defaults to a human-readable table; `create`/`update` accept `--conditions` as a JSON string or `@file.json` path reference; non-zero exit on error.

## Acceptance criteria

- [ ] Schema / module: `src/cli/commands/routing.ts` (or codegen output) implements all six subcommands
- [ ] Logic: `routing rules list --json` output parses as valid `RoutingRule[]` matching tRPC response schema
- [ ] Logic: `routing rules create --name <n> --agent <a> --conditions <json>` round-trips via tRPC; prints created rule ID on success
- [ ] Logic: `routing rules test <task-id>` prints `agent: <name>` + `source: <source>` to stdout; exits 0
- [ ] Logic: `routing rules dry-run --task-json <j>` prints routing decision; writes zero events rows
- [ ] Logic: `routing rules delete <id>` prints confirmation; subsequent `list` omits the rule
- [ ] Logic: invalid `--conditions` JSON → error message + exit 1 before tRPC call
- [ ] Surfaces parity: `--json` output on every command is identical (same fields/types) to tRPC response
- [ ] Tests: CLI integration tests calling tRPC via in-process client
- [ ] Tests: `--json` flag test: output parses against `RoutingRule` Zod schema

## Blocked by

- `07-routing-trpc-procedures`

## Notes

Per Q-cli-shape decision: codegen from tRPC schema is preferred. Hand-roll only if codegen doesn't cover `--conditions @file.json` path syntax. `--project <id>` flag routes to project-scoped rules on `list` and `create`.
