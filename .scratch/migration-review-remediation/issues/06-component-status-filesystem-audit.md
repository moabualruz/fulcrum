# 06 — Component status inspects real files, not just the ledger

Status: ready-for-agent
Risk tier: medium
Severity: medium
Source findings: C7
Dependencies: —
File ownership:
- `src/cli/component.ts`
- `src/cli/component.test.ts`
- `src/components/ledger.ts`

Acceptance criteria:
- `fulcrum component status [--json]` checks each surface's actual state on disk:
  - `state` is one of `present`, `missing`, `partially-installed`, `unmanaged`.
  - `modified` is computed by comparing the on-disk SHA-256 to the artifact hash recorded in the ledger.
- New tests cover: deleted file → `state: "missing"`; user-modified file → `modified: true`; intact install → `present`/`modified: false`.
- The ledger query path used by `doctor` keeps working; no schema change required.
- `bun run ci` is green.
