# 19 — Doctor product-kernel verdict

Status: ready-for-agent
Risk tier: medium
Dependencies: —
Source: `.scratch/claude-migration-review/REPORT.md` C9
File ownership:
- `src/cli/doctor.ts`
- `src/cli/doctor.test.ts`

Acceptance criteria:
- A product-kernel error (`buildProductKernelReport` returns `{ engine: "absent", error }` for a corrupted DB) increments the doctor `errors` counter and forces `verdict: "error"`.
- A product-kernel "absent" with no error stays neutral.
- A test seeds a corrupted product DB and asserts the verdict.
