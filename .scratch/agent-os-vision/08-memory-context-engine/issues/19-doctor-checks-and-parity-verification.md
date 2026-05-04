---
Status: completed
ImplRuntime: claude
Pillar: 08-memory-context-engine
Blocked-by: [10-cli-memory-verbs.md, 11-web-memory-browser.md, 12-web-context-preview.md, 13-tui-memory-browser.md, 09-symphony-before-run-hook-integration.md]
PRD: .scratch/agent-os-vision/prds/08-memory-context-engine.md
Requirements: .scratch/agent-os-vision/REQUIREMENTS.md (Pillar 8 section)
Decisions: [C4, C1]
Vision: .scratch/agent-os-vision/VISION-GAPS.md (Memory + Context rows)
Docs: PRD §Acceptance criteria — all 10 acceptance criteria; REQUIREMENTS Pillar 8 Done criteria
---

## What to build

`fulcrum doctor --json` subsystem checks for Pillar 8 + the cross-surface parity verification test suite. This is the capstone slice that confirms the pillar is done.

**Doctor checks** (each returns `ok | warning | error` + message):
- `memories_schema` — `em.getMetadata()` exposes `Memory`, `MemoryLink`, `ContextSnapshot` properties + indexes (from slice 01)
- `embeddings_schema` — `em.getMetadata()` exposes `MemoryEmbedding`, `DocEmbedding`, `VectorType` length 384; flag state reported (from slice 02)
- `heuristic_extractor` — extractor module loads; fixture transcript produces ≥4 kinds
- `retriever` — FTS retrieval returns top-20 on fixture corpus; determinism confirmed
- `context_assembly` — `assemble()` returns 5 slices under budget for fixture task
- `embeddings` — flag state; repository row count; HNSW decorator metadata present if flag on (from slice 16)
- `llm_extraction` — flag state; sidecar reachable if flag on
- `report_narration` — flag state; cron registered if flag on

**Parity verification** (`memory.crud-parity.test.ts`) — `list`, `search`, `show`, `remember`, `promote`, `archive`, `restore`, `edit`, `forget` functionally identical results via Web tRPC call, CLI `--json`, and TUI in-process tRPC for the same fixture data.

## Acceptance criteria

- [ ] `fulcrum doctor --json` includes all 8 Pillar 8 subsystem checks
- [ ] All subsystem checks return `ok` on a clean install with fixture data
- [ ] Gated subsystems return `disabled` (not `error`) when flags are off
- [ ] `memory.crud-parity.test.ts`: all 9 verbs produce functionally identical results across Web, CLI, TUI surfaces
- [ ] `retriever.determinism.test.ts`: 100 sequential calls → identical top-20 list
- [ ] `assembler.replay.test.ts`: re-hydrate from `ContextSnapshot` → byte-identical JSON
- [ ] `feature-flags.test.ts`: no gated feature active when `FULCRUM_FEATURES` unset
- [ ] `retriever.isolation.test.ts`: org A memories absent from org B results
- [ ] `bun run ci` passes with all Pillar 8 tests green
- [ ] Pillar 8 "Done criteria" in REQUIREMENTS.md: "all three surfaces reach feature parity before pillar marked done" — verified by parity test

## Blocked by

- `10-cli-memory-verbs.md`
- `11-web-memory-browser.md`
- `12-web-context-preview.md`
- `13-tui-memory-browser.md`
- `09-symphony-before-run-hook-integration.md`
