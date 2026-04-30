# 12 — Docs update

Status: done
Risk tier: low
Dependencies: component-lifecycle-management/10
File ownership:
- `docs/user-guide.md`
- `docs/developer-guide.md`
- `HANDOVER.md`

Acceptance criteria:
- User guide documents the shipped `fulcrum component` CLI commands and `--purge` semantics.
- Developer guide documents the catalog/planner/ledger/executor/adapters split.
- HANDOVER reflects the lifecycle as shipped.
- No `fulcrum pkg` references; references to "component lifecycle" point to `fulcrum component`.

## Comments
- Shipped in `e64288a docs(component): plan lifecycle implementation` and the surrounding handover updates.
