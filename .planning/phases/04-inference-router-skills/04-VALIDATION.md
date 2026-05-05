---
phase: 04
slug: inference-router-skills
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-05
---

# Phase 04 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | `bun:test`, Rust `cargo test`, Promptfoo evals, local smoke scripts |
| **Config file** | `package.json`, `inference/Cargo.toml`, planned `evals/router-llm-eval.promptfooconfig.yaml` |
| **Quick run command** | `bun test src/inference src/router src/skills src/server/trpc/routers/inference.ts src/server/trpc/routers/routing.ts src/server/trpc/routers/skills.ts` |
| **Full suite command** | `bun run ci` plus Rust inference smoke and Phase 4 eval corpus |
| **Estimated runtime** | ~120-600 seconds, depending on real model downloads/probes |

---

## Sampling Rate

- **After every task commit:** Run `bun test` for the modified subsystem.
- **After every plan wave:** Run `bun test src/inference src/router src/skills src/server/trpc/routers/inference.ts src/server/trpc/routers/routing.ts src/server/trpc/routers/skills.ts`.
- **Before `$gsd-verify-work`:** Full suite, Rust inference smoke, and Phase 4 eval corpus must be green or explicitly blocked by unavailable configured external backends.
- **Max feedback latency:** 10 minutes for core TypeScript/Rust tests; real backend probes may be longer when first downloading models.

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 04-INF-01 | TBD | TBD | INF-01 | T-04-EMBED-DIM | Reject vectors whose length differs from configured model/schema dimension | unit + integration | `bun test src/inference src/docs src/search` | ❌ W0 | ⬜ pending |
| 04-INF-02 | TBD | TBD | INF-02 | — | Static macOS + Linux build proof is repeatable and recorded | build/smoke | `bun run scripts/build-all.ts && inference/scripts/smoke.sh <binary>` | ❌ W0 | ⬜ pending |
| 04-INF-03 | TBD | TBD | INF-03 | — | `start/stop/status` returns typed backend health/degraded state | unit + CLI | `bun test src/cli/inference.test.ts src/inference/lifecycle.test.ts` | ✅ | ⬜ pending |
| 04-INF-04 | TBD | TBD | INF-04 | — | Doctor reports sidecar/backend status with reasons | unit | `bun test src/doctor src/server/trpc/routers/__tests__/inference.test.ts` | ✅ | ⬜ pending |
| 04-INF-05 | TBD | TBD | INF-05 | T-04-BACKEND-HEALTH | Configured backend cannot appear healthy without real embed/generate proof | contract | `bun test src/inference/backends src/server/trpc/routers/__tests__/inference.test.ts` | ✅ | ⬜ pending |
| 04-INF-06 | TBD | TBD | INF-06 | T-04-EMBED-QUALITY | Paraphrase pair cosine is >= 0.9 through write/read/search path | integration | `cargo test --manifest-path inference/Cargo.toml && bun test src/inference/contract.test.ts` | ✅ | ⬜ pending |
| 04-INF-07 | TBD | TBD | INF-07 | — | First flag caller auto-spawns embedded sidecar only; external backends probed only | integration | `bun test src/inference src/server/trpc/routers/__tests__/inference.test.ts` | ✅ | ⬜ pending |
| 04-RTR-01 | TBD | TBD | RTR-01 | — | Deterministic rule match returns expected route before LLM fallback | unit | `bun test src/router/rules-engine.test.ts src/router/auto-assign.test.ts` | ✅ | ⬜ pending |
| 04-RTR-02 | TBD | TBD | RTR-02 | T-04-UNREVIEWED-DRAFT | No-match learning stores disabled draft with evidence, never active rule | unit + repository | `bun test src/router src/server/trpc/routers/routing*` | ✅ | ⬜ pending |
| 04-RTR-03 | TBD | TBD | RTR-03 | T-04-LLM-ROUTE | LLM fallback is off by default; when enabled, low confidence abstains and high confidence creates disabled draft only | unit + eval | `bun test src/router/llm-fallback.test.ts && bunx promptfoo eval --config evals/router-llm-eval.promptfooconfig.yaml` | ❌ W0 | ⬜ pending |
| 04-RTR-04 | TBD | TBD | RTR-04 | T-04-SKILL-SYNC | Safe upstream diffs auto-merge only when local unchanged; conflicts produce structured artifact | unit | `bun test src/skills/upstream-sync* src/skills/lock*` | ✅ | ⬜ pending |
| 04-RTR-05 | TBD | TBD | RTR-05 | T-04-MCP-POISON | MCP virtual skills are descriptors only; no direct invocation path | unit + surface | `bun test src/skills src/cli/mcp-cmd.test.ts` | ✅ | ⬜ pending |
| 04-RTR-06 | TBD | TBD | RTR-06 | — | Web routing editor supports explainable tests, drafts, conflict state, structured builder, raw JSON escape hatch | web unit/integration | `cd src/web && bun run web:test -- routing` | ❌ W0 | ⬜ pending |
| 04-RTR-07 | TBD | TBD | RTR-07 | T-04-SHA | Lock mismatch fails closed and shows expected/actual SHA | unit | `bun test src/skills/loader.test.ts src/skills/lock*` | ✅ | ⬜ pending |
| 04-RTR-08 | TBD | TBD | RTR-08 | — | Web/CLI/TUI expose same routing config CRUD/test semantics | unit + integration | `bun test src/cli src/tui src/server/trpc/routers/routing*` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `evals/router-llm-eval.promptfooconfig.yaml` — Promptfoo eval corpus for LLM fallback explanation/abstention quality.
- [ ] Web routing tests — focused web test file or suite selector for routing editor behavior.
- [ ] Static build proof script/gate — macOS + Linux proof path, with explicit handling when `cross`/Docker/Linux builder unavailable.
- [ ] Embedding dimension inventory test — scan/schema test proving no stale `vector(1536)` storage references remain and model metadata drives expected dimension.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| External configured backend real calls | INF-05 | Ollama, LM Studio, and OpenAI-compatible servers may be unavailable locally | Configure each backend intentionally, run status/doctor and real embed/generate probes, verify unavailable backends show typed degraded states. |
| Linux static proof on non-Linux host | INF-02 | Local `cross`/Docker may be unavailable | Run chosen Linux builder or CI-like script and attach artifact path/version/target output to phase summary. |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies.
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify.
- [ ] Wave 0 covers all MISSING references.
- [ ] No watch-mode flags.
- [ ] Feedback latency < 10 minutes for core local gates.
- [ ] `nyquist_compliant: true` set in frontmatter after Wave 0 evidence exists.

**Approval:** pending
