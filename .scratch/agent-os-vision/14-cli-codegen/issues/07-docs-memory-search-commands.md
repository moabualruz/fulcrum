---
Status: completed
ImplCommit: 2c43f0fc
ImplRuntime: claude
Triage: AFK
Pillar: cli-codegen
Blocked-by: [14/issues/05-binary-entrypoint-and-compile.md]
PRD: .scratch/agent-os-vision/prds/14-cli-codegen.md
Requirements: .scratch/agent-os-vision/REQUIREMENTS.md (Pillar 14 section)
Decisions: [Q-cli-shape, C4]
Vision: .scratch/agent-os-vision/VISION-GAPS.md ("Three surfaces, all shipped" row)
Docs: []
---

## Parent

Pillar 14 — CLI (Auto-Codegen from tRPC)

## What to build

Integration tests for docs, memory, context, and search domain commands. Covers: `fulcrum docs create --title D --type note --project P --json`, `fulcrum docs list --project P --json`, `fulcrum docs update <id> --title T2 --json`, `fulcrum doc-versions list <doc-id> --json`, `fulcrum memories list --project P --json`, `fulcrum memories create --content "..." --project P --json`, `fulcrum memories promote <id> --json` (flip `global=true`), `fulcrum context assemble --task T --json`, `fulcrum search "query" --kind task --json`, `fulcrum search "query" --semantic --json` (embeddings flag gate).

- **Web**: docs created via CLI visible in web doc tree; memories visible in memory browser.
- **CLI**: primary surface.
- **TUI**: docs/memories created via CLI visible in TUI browsers.

## Acceptance criteria

- [ ] `fulcrum docs create --title D --type note --project P --json` → doc created with `doc_type='note'`.
- [ ] `fulcrum docs list --project P --json` → `Doc[]` with `parent_id`, `doc_type`, `scope` fields.
- [ ] `fulcrum memories promote <id> --json` → `memories.global=true`; reflected in `fulcrum memories list --json`.
- [ ] `fulcrum context assemble --task T --json` → context bundle with `memories`, `docs`, `transcripts`, `repoState` slices; token count present.
- [ ] `fulcrum search "query" --kind task --json` → `SearchResult[]`; `--kind` filter applied.
- [ ] `fulcrum search "query" --semantic --json` with `embeddings` flag OFF → `FeatureDisabledError` (exit 1, JSON error).
- [ ] After CLI `docs create`, web tree shows new doc; TUI doc browser shows it.

## Blocked by

- 14/issues/05-binary-entrypoint-and-compile.md

## Notes

P14.15 + P14.17–P14.18 maps to this slice.
