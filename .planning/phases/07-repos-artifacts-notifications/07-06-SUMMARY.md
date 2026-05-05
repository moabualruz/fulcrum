---
phase: 07-repos-artifacts-notifications
plan: 06
subsystem: artifacts
tags: [artifacts, search, edges, preview, download, trpc, svelte]

requires:
  - phase: 07-repos-artifacts-notifications
    provides: "07-03 artifact retention policy/pruner"
  - phase: 07-repos-artifacts-notifications
    provides: "07-04 shared tRPC routing patterns"
provides:
  - "Harvested artifacts emit run-artifact edge rows and searchable provenance payloads"
  - "Artifact tRPC schema includes digest, retention, preview, source, producer, and attestation fields"
  - "Web, CLI, and TUI artifact surfaces show run links, preview mode, retention state, and download affordances"
affects: [ART-01, ART-02, ART-05, ART-06, search, run-detail]

tech-stack:
  added: []
  patterns:
    - "Artifact harvest metadata carries attestation-ready provenance fields"
    - "Preview policy is narrow: png/image, text, markdown, code, else download-only"

key-files:
  created:
    - src/artifacts/__tests__/harvest-search.test.ts
  modified:
    - src/orchestration/artifact-harvest-hook.ts
    - src/artifacts/harvest.ts
    - src/search/indexers/artifact.ts
    - src/trpc/schemas/artifacts.ts
    - src/trpc/routers/artifacts.ts
    - src/web/src/routes/artifacts/+page.svelte
    - src/web/src/routes/artifacts/[id]/+page.svelte
    - src/web/src/routes/artifacts/[id]/download/+server.ts
    - src/cli/artifacts.ts
    - src/tui/screens/artifacts.ts

key-decisions:
  - "Run-to-artifact edge kind is the stable string produced, with reverse generated_by retained for artifact-to-run navigation."
  - "Artifact preview policy is exported from harvest code and reused by tests; unsupported binaries are download-only."
  - "Attestation-ready metadata is stored as nullable shape without implementing Sigstore/SLSA signing in this plan."

patterns-established:
  - "Search indexing maps artifact digest, source path/glob, producer/run, retention, and preview metadata into SearchDocument metadata."
  - "Web/CLI/TUI artifact surfaces expose the same operational fields: run, digest, preview, retention, archived/pruned."

requirements-completed: [ART-01, ART-02, ART-05]

duration: 5min
completed: 2026-05-05
---

# Phase 07 Plan 06: Artifact Edge, Search, Preview Summary

**Run-harvested artifacts now carry edge links, searchable provenance, retention state, and consistent preview/download UX.**

## Performance

- **Duration:** 5 min
- **Started:** 2026-05-05T21:01:14Z
- **Completed:** 2026-05-05T21:05:52Z
- **Tasks:** 3
- **Files modified:** 11

## Accomplishments

- Added RED tests proving harvest creates run-artifact edges, produces searchable artifact metadata, and enforces preview policy.
- Extended harvest/search path with stable edge constants, source path/glob, SHA-256 digest, producer/run IDs, preview kind, and nullable attestation shape.
- Updated artifact tRPC, Web, CLI, and TUI surfaces with run links, digest/retention/preview fields, archive/prune tags, and download-only behavior for unsupported MIME.

## Task Commits

1. **Task 1: RED tests for artifact harvest -> edge -> search path** - `14ce0854` (test)
2. **Task 2: Add run-artifact edge creation and index-write path** - `4237e6a8` (feat)
3. **Task 3: Wire artifact list/detail download/preview parity** - `05cfa57d` (feat)

## Files Created/Modified

- `src/artifacts/__tests__/harvest-search.test.ts` - Contract tests for edge linkage, search provenance payload, and preview policy.
- `src/artifacts/harvest.ts` - Provenance metadata, edge constants, preview policy, and search payload fields.
- `src/orchestration/artifact-harvest-hook.ts` - Hook output metadata carrying runId/sourceGlob/edgeKind.
- `src/search/indexers/artifact.ts` - SearchDocument builder with digest, source, producer, retention, and query text fields.
- `src/trpc/schemas/artifacts.ts` - Shared artifact fields for digest, retention status, preview kind, source/provenance, pruned, and attestation.
- `src/trpc/routers/artifacts.ts` - Artifact projection normalization and org-scoped 404/403 behavior preserved.
- `src/web/src/routes/artifacts/+page.svelte` - List run link, preview mode, retention status, download link.
- `src/web/src/routes/artifacts/[id]/+page.svelte` - Detail digest, MIME, source run link, retention, preview gate.
- `src/web/src/routes/artifacts/[id]/download/+server.ts` - Download content-type fallback and filename sanitization.
- `src/cli/artifacts.ts` - List/show/download output includes run, digest, preview, retention.
- `src/tui/screens/artifacts.ts` - List/filter/preview summary includes kind, MIME, project/archive, preview, retention.

## Decisions Made

- Kept artifact search write path on existing `SearchDocument` indexer and repository seam; no separate artifact search store.
- Kept preview scope narrow per plan: PNG/image, text, markdown, code inline; other artifacts use download-only UI.
- Did not add `file-type` dependency because existing MIME path plus `mime-types` fallback covered current preview/download needs.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Updated shared artifact schema outside owned file list**
- **Found during:** Task 3
- **Issue:** Parity fields could not be normalized across tRPC/CLI/TUI without extending `src/trpc/schemas/artifacts.ts`, which was read-first but not in the user-owned file list.
- **Fix:** Added digest, pruned, retentionStatus, previewKind, source/provenance, edgeId, and attestation fields to shared artifact schema.
- **Files modified:** `src/trpc/schemas/artifacts.ts`
- **Verification:** Scoped TypeScript check and artifact/web tests passed.
- **Committed in:** `05cfa57d`

---

**Total deviations:** 1 auto-fixed (Rule 2).
**Impact on plan:** Required for shared API correctness; no unrelated shared files touched.

## Issues Encountered

- Stub scan found only intentional empty collections/default null state in runtime/test code; no UI-blocking stubs.

## User Setup Required

None - no external service configuration required.

## Verification

- `bun test src/artifacts/__tests__/harvest-search.test.ts src/artifacts/harvest.test.ts src/web/src/routes/artifacts/page.svelte.test.ts 'src/web/src/routes/artifacts/[id]/page.svelte.test.ts'` - PASS, 12 tests.
- `bun run --bun tsc --noEmit --skipLibCheck --target ES2022 --module NodeNext --moduleResolution NodeNext --allowImportingTsExtensions --strict --types bun src/trpc/schemas/artifacts.ts src/trpc/routers/artifacts.ts src/cli/artifacts.ts src/tui/screens/artifacts.ts src/artifacts/harvest.ts src/search/indexers/artifact.ts src/orchestration/artifact-harvest-hook.ts src/artifacts/__tests__/harvest-search.test.ts` - PASS.
- `rg -n "runId|digest|preview|retention|download" src/web/src/routes/artifacts src/trpc/routers/artifacts.ts src/cli/artifacts.ts src/tui/screens/artifacts.ts` - PASS.

## Known Stubs

None. Nullable attestation fields are intentional attestation-ready shape for deferred signing.

## Threat Flags

None. Download and artifact retrieval remain org-scoped; unsupported previews are gated to download-only.

## Next Phase Readiness

ART-01, ART-02, and ART-05 are ready for downstream ART-06 parity verification and run-detail artifact listing work.

## Self-Check: PASSED

- Files verified present: `src/artifacts/__tests__/harvest-search.test.ts`, `src/artifacts/harvest.ts`, `src/search/indexers/artifact.ts`, `src/trpc/schemas/artifacts.ts`, `src/trpc/routers/artifacts.ts`, artifact Web/CLI/TUI files, and this summary.
- Commits verified present: `14ce0854`, `4237e6a8`, `05cfa57d`.

---
*Phase: 07-repos-artifacts-notifications*
*Completed: 2026-05-05*
