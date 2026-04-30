# 11 — Remove/purge modified-file safety

Status: done
Risk tier: medium
Dependencies: component-lifecycle-management/07, component-lifecycle-management/10
File ownership:
- `src/components/remove-safety.test.ts`
- `src/components/ledger.ts`
- `src/components/executor.ts`
- `src/components/adapters/files.ts`

Acceptance criteria:
- `remove` preserves a user-modified policy file unless `--purge` is set.
- `--purge` removes the modified policy file.
- Modified-file detection reuses existing policy compare helpers.

## Comments
- Shipped in `e5c7058 test(component): preserve modified managed files`.
