---
Status: implemented
Triage: AFK
Pillar: cli-codegen
Blocked-by: [14/issues/01-codegen-scaffold.md, 14/issues/02-json-flag-and-watch-generation.md, 14/issues/03-completion-scripts.md]
PRD: .scratch/agent-os-vision/prds/14-cli-codegen.md
Requirements: .scratch/agent-os-vision/REQUIREMENTS.md (Pillar 14 section)
Decisions: [Q-cli-shape, A1]
Vision: .scratch/agent-os-vision/VISION-GAPS.md ("Three surfaces, all shipped" row)
Docs: []
---

## Parent

Pillar 14 — CLI (Auto-Codegen from tRPC)

## What to build

CI snapshot gate for the codegen pipeline. `bun run ci` includes `ci:codegen` stage: runs `bun run scripts/cli/codegen.ts`, then compares output against committed `src/cli/generated/` snapshots via `vitest toMatchSnapshot`. If generated files diverge from snapshots → CI exits non-zero. Fix path: `bun run codegen && git add src/cli/generated/ && git commit`. Stage also validates: no `z.any()` on public procedures (schema registry check), completion scripts non-empty. Stage completes in <8s (p95).

- **Web**: not applicable.
- **CLI**: `bun run ci` runs codegen gate; developers run `bun run codegen` to update snapshots.
- **TUI**: not applicable.

## Acceptance criteria

- [ ] `bun run ci` includes `ci:codegen` stage before `ci:build`.
- [ ] Diverged generated file → CI fail with message "AppRouter changed without regenerating snapshots; run: bun run codegen".
- [ ] Matching snapshots → CI pass.
- [ ] Stage runs in <8s on clean codegen (CI measurement).
- [ ] Snapshot test: `vitest --run cli:codegen:snapshot` passes green on committed baseline.
- [ ] Gate also asserts no `z.any()` on public procedure schemas (reuses schema registry check from Pillar 13).

## Blocked by

- 14/issues/01-codegen-scaffold.md
- 14/issues/02-json-flag-and-watch-generation.md
- 14/issues/03-completion-scripts.md

## Notes

P14.06–P14.07 maps to this slice.
