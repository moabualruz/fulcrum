---
Status: implemented
Triage: AFK
Pillar: artifacts
Blocked-by: [01-schema-migration.md]
PRD: .scratch/agent-os-vision/prds/10-artifacts.md
Requirements: .scratch/agent-os-vision/REQUIREMENTS.md (Pillar 10 section)
Decisions: [Q25, Q32, D5]
Vision: .scratch/agent-os-vision/VISION-GAPS.md (Artifacts row)
Docs: []
---

# StorageBackend interface + LocalFsBackend: put/get/delete/exists + store root resolution

## Parent
PRD: `.scratch/agent-os-vision/prds/10-artifacts.md` (Always-on: Artifact store layout; issues 10-03)

## What to build
Define the `StorageBackend` interface (`put`, `get`, `delete`, `exists`) in `src/artifacts/storage.ts` and implement `LocalFsBackend` using `node:fs/promises` streaming writes. Resolve the store root from `FULCRUM_ARTIFACT_STORE` env var (default `~/.fulcrum/artifacts/`). Deterministic path layout: `<root>/<org_slug>/<project_slug_or_global>/<run_id_or_manual>/<filename>`. Collision: append `_<ulid_suffix>` before extension when filename exists. This slice delivers the storage abstraction that all other artifact slices build on.

## Acceptance criteria
- [ ] Schema migration: N/A — no DB changes in this slice.
- [ ] tRPC procedure / module: `src/artifacts/storage.ts` exports `StorageBackend` interface + `LocalFsBackend` class; `createStorageBackend(flag)` factory returns correct impl.
- [ ] Web surface: N/A.
- [ ] CLI command: `fulcrum artifacts upload <file>` calls `LocalFsBackend.put` and file appears under `~/.fulcrum/artifacts/`.
- [ ] TUI screen: N/A (tested via CLI integration test).
- [ ] Tests: unit — `put` writes file, `get` streams bytes, `delete` removes, `exists` returns false after delete; `ENOSPC` simulated → emits `artifact.harvest.failed` and no partial file remains; path collision appends ULID suffix; RED→GREEN.

## Blocked by
- `01-schema-migration.md` — DB types needed for module compilation; store root env var test fixture.

## Notes / Tech-stack hints
- `node:fs/promises` only — no extra dep.
- `FULCRUM_ARTIFACT_STORE` env resolution should call `path.resolve(os.homedir(), '.fulcrum/artifacts')` as default.
- `put` must stream large files; do not buffer entire file in memory.
- On `ENOSPC`, clean partial file with `fs.unlink` before rethrowing.
- Failure gate: if `node:fs/promises` streaming breaks on PGlite-in-browser future path, swap to `@isomorphic-git/lightning-fs` adapter behind the same interface.
