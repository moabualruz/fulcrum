---
Status: ready-for-agent
Triage: AFK
Pillar: 07-docs-editor-collab
Blocked-by: [01-docs-schema-foundation.md, 05-doc-crud-trpc.md]
PRD: .scratch/agent-os-vision/prds/07-docs-editor-collab.md
Requirements: .scratch/agent-os-vision/REQUIREMENTS.md (Pillar 7 section)
Decisions: [Q14, C4]
Vision: .scratch/agent-os-vision/VISION-GAPS.md (Confluence-grade docs row)
Docs: [https://github.com/benjamine/jsondiffpatch]
---

# Version snapshot+delta engine — version-writer, version-reconstructor, diff + restore tRPC

## Parent
PRD: `.scratch/agent-os-vision/prds/07-docs-editor-collab.md` (issues lines P7-13..P7-15, P7-21..P7-22)

## What to build
Four modules + tRPC procedures powering version history:

1. `src/docs/version-writer.ts` — called on every `docs.update`. Computes jsondiffpatch delta vs prior `content_json`. Writes full snapshot every `DOC_SNAPSHOT_EVERY` saves (default 10) or once per calendar day; delta on all other saves. `body_md_snapshot` always written on every row.
2. `src/docs/version-reconstructor.ts` — given a `version_num`, finds nearest prior snapshot, applies forward deltas byte-stably. Used by restore and diff.
3. tRPC: `docs.versions.list` (DESC, snapshot/delta flagged), `docs.versions.get` (single row), `docs.versions.diff` (reconstructed `content_json` for two versions), `docs.versions.restore` (creates new version row, `restore_of` FK, `version_num = max+1`, non-destructive).

## Acceptance criteria
- [ ] `version-writer.ts`: every `docs.update` writes a `doc_versions` row; `version_num` auto-increments per doc
- [ ] `version-writer.ts`: rows 1 and every Nth (default 10) + first save of each calendar day → `snapshot` populated; all other rows → `delta` populated; `body_md_snapshot` always populated
- [ ] `version-reconstructor.ts`: reconstruction of any version = nearest prior snapshot + sequential delta application; result matches original `content_json` byte-stably
- [ ] `docs.versions.list`: returns rows DESC with `{id, version_num, is_snapshot, author_id, created_at}`; org-scoped
- [ ] `docs.versions.diff`: accepts `from_version_num` + `to_version_num`; returns jsondiffpatch HTML visual diff string
- [ ] `docs.versions.restore`: creates new `doc_versions` row with reconstructed content; sets `restore_of` FK; does NOT overwrite existing rows; `docs.update` called with restored `content_json`+`body_md`
- [ ] Performance: version restore (50 versions, 5 snapshots) < 150 ms on PGlite
- [ ] Tests: 12 saves → 12 rows; rows 1 and 10 have snapshot; rows 2-9, 11-12 have delta only
- [ ] Tests: restore v5 → new row with `restore_of=v5`; reconstructed `content_json` + `body_md` byte-equal to original v5
- [ ] Tests: jsondiffpatch failure gate — docs > 500 kB: if delta > 200 ms, writer falls back to full snapshot mode (no delta computed)
- [ ] Web: `/docs/<slug>/history` lists versions with snapshot badge; diff view shows block-level changes; restore button creates new version
- [ ] CLI: `fulcrum docs history <slug> --json` returns version list; `fulcrum docs restore <slug> --version 5 --json` returns restored doc
- [ ] TUI: `h` key opens history list; `r` on selected version restores; ANSI diff visible

## Blocked by
`01-docs-schema-foundation.md`, `05-doc-crud-trpc.md`

## Notes / Tech-stack hints
- jsondiffpatch failure gate: if diff > 200 ms on docs > 500 kB → `version-writer` skips delta, stores full snapshot; log warning; track `slow_delta_count` metric
- `body_md_snapshot` written on every row (even delta rows) for CLI/TUI restore without requiring full content_json chain
- `DOC_SNAPSHOT_EVERY` env var — defaults to 10; allow override per org via `tenant_settings`
