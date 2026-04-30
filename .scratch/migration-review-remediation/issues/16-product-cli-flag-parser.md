# 16 — Product CLI flag parser

Status: ready-for-agent
Risk tier: medium
Dependencies: —
Source: `.scratch/claude-migration-review/REPORT.md` C6
File ownership:
- `src/cli/product.ts`
- `src/cli/product.test.ts`

Acceptance criteria:
- `fulcrum product search --org-slug default kernel` treats `kernel` as the query and `default` as the org slug.
- Flag values are not consumed as positionals.
- Both flag-before-positional and positional-before-flag orderings work for `--org-slug`, `--limit`, `--task`, `--json`.
- Tests cover both orderings.
