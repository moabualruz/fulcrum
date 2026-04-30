# 07 — Rules and policy adapters

Status: done
Risk tier: low
Dependencies: component-lifecycle-management/05
File ownership:
- `src/components/adapters/sentinel.ts`
- `src/components/adapters/sentinel.test.ts`
- `src/components/adapters/files.ts`
- `src/components/adapters/files.test.ts`

Acceptance criteria:
- Sentinel adapter installs and removes the `BEGIN/END FULCRUM RULES` block via existing helpers.
- Policy adapter seeds `~/.fulcrum/tool-output-policy.toml` and preserves user-modified content unless `--purge`.
- Both adapters wire into the executor dispatch table.

## Comments
- Shipped in lifecycle foundation series. Verified by `bun test src/components/adapters/sentinel.test.ts src/components/adapters/files.test.ts`.
