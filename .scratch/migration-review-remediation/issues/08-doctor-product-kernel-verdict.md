# 08 — Doctor surfaces product-kernel DB errors in the verdict

Status: ready-for-agent
Risk tier: low
Severity: medium
Source findings: C9
Dependencies: —
File ownership:
- `src/cli/doctor.ts`
- `src/cli/doctor.test.ts`

Acceptance criteria:
- When `buildProductKernelReport()` records a non-empty `error`, doctor increments `warnings` (or `errors` for fatal cases such as a corrupt DB) so the final verdict reflects product-kernel health.
- Add a doctor test that seeds a corrupt PGlite directory and asserts `verdict !== "ok"` and that the human output mentions the failure.
- `bun run ci` is green.
