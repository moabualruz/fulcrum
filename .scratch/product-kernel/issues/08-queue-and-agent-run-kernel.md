# 08 — Queue and agent run kernel

Status: ready-for-agent
Risk tier: medium
Dependencies: product-kernel/05
File ownership:
- `src/product-kernel/jobs.ts`
- `src/product-kernel/jobs.test.ts`

Acceptance criteria:
- `enqueueJob`, `claimJob`, `completeJob`, `failJob`, `cancelJob` are exported.
- `claimJob` on PostgreSQL uses `FOR UPDATE SKIP LOCKED`.
- `claimJob` on PGlite uses a single-process transaction; limitation documented in code.
- Two consecutive `claimJob` calls do not return the same row.
- Failed claims with `attempts >= max_attempts` mark status `failed`.
- RED test fails before implementation; GREEN: `bun test src/product-kernel/jobs.test.ts` passes.
