---
Status: implemented
Triage: AFK
Pillar: 08-memory-context-engine
Blocked-by: [07-trpc-memory-crud-and-search.md]
PRD: .scratch/agent-os-vision/prds/08-memory-context-engine.md
Requirements: .scratch/agent-os-vision/REQUIREMENTS.md (Pillar 8 section)
Decisions: [Q-cli-shape, C4]
Vision: .scratch/agent-os-vision/VISION-GAPS.md (Memory + Context rows)
Docs: PRD §Surfaces — CLI; Q-cli-shape: auto-generated from tRPC schema
---

## What to build

Full CLI surface for memory CRUD and context preview. Per Q-cli-shape: auto-generated from tRPC schema; `--json` on every command; hand-rolled only for interactive prompts.

```
fulcrum memory list        [--project <id>] [--global] [--kind <k>] [--tag <t>] [--importance <i>] [--archived] [--json]
fulcrum memory search      "<query>" [--project <id>] [--top <n>] [--json]
fulcrum memory show        <id> [--json]
fulcrum memory remember    "<text>" [--global] [--project <id>] [--tag <t>...] [--importance <i>] [--kind <k>]
fulcrum memory promote     <id> --global
fulcrum memory archive     <id>
fulcrum memory restore     <id>
fulcrum memory edit        <id> [--body "<text>"] [--importance <i>] [--tags <t...>]
fulcrum memory forget      <id>             # prompts for confirmation unless --confirm passed
fulcrum context preview    --task <id> [--budget <n>] [--json]
```

## Acceptance criteria

- [ ] All 10 commands (`list`, `search`, `show`, `remember`, `promote`, `archive`, `restore`, `edit`, `forget`, `context preview`) implemented
- [ ] `--json` on every command returns structured output matching the tRPC procedure return type
- [ ] `fulcrum memory remember "<text>"` → row written; `--json` returns full memory row
- [ ] `fulcrum memory forget <id>` → interactive confirmation prompt unless `--confirm` passed; hard-delete confirmed
- [ ] `fulcrum context preview --task <id>` → 5 slices with per-slice token counts; matches `context.preview` tRPC output
- [ ] `fulcrum memory search "<query>" --json` → results match `memory.search` tRPC for identical input
- [ ] `--project`, `--global`, `--kind`, `--tag`, `--importance`, `--archived` flags all plumbed through to tRPC input
- [ ] Org scoping: CLI reads `org_id` from local session (never from flag)
- [ ] Integration test per command: assert correct tRPC procedure called + response marshalled
- [ ] `fulcrum memory --help` shows all subcommands with flag descriptions

## Blocked by

- `07-trpc-memory-crud-and-search.md`

## Implementation notes

- 2026-05-03 codex: implemented scoped P8#10 CLI verbs from orchestrator task: `list`, `get`, `add`, `delete`, `search`, `promote` in `src/cli/commands/memory.ts`; added TDD coverage in `tests/cli/memory.test.ts`. RED: `bun test tests/cli/memory.test.ts` failed with missing module (6 fail). GREEN: `bun test tests/cli/memory.test.ts` (6 pass); `bun run lint` (pass).
