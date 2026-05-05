# Phase 4: Inference + Router/Skills - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-05
**Phase:** 4-Inference + Router/Skills
**Areas discussed:** Inference runtime contract, Embedding schema migration, Router learning behavior, LLM routing gate, MCP as virtual skills, Skill sync + lock policy, Three-surface routing UX

---

## Inference Runtime Contract

| Decision Point | Options Considered | User's Choice |
|---|---|---|
| Canonical runtime target | Embedded first; Backend parity; You decide | Backend parity |
| Unavailable configured backend behavior | Typed degraded state; Hard fail; Best effort silent | Typed degraded state |
| Static binary proof | CI-capable smoke; Local-only proof; Full cross-build gate | Full cross-build gate |
| Real model proof | Deterministic local model gate; All backends real-call gate; Mock primary, real optional | Embedded mandatory plus any configured backend mandatory |

**Notes:** User combined options 1 and 2 for real model proof. Interpretation confirmed: embedded fastembed real call is mandatory, any backend configured/enabled for Phase 4 must pass real embed/generate calls, unconfigured optional backends do not block completion.

---

## Embedding Schema Migration

| Decision Point | Options Considered | User's Choice |
|---|---|---|
| Dimension migration scope | Global now; Phase paths only; Schema only | Global now |
| Stored vector type | Postgres `vector(384)` canonical; `real[]` canonical; Dual storage | Postgres vector canonical, refined by model metadata |
| Model dimension change behavior | Fail closed; Auto-reindex; Allow mixed | Fail closed |
| Acceptance proof | Schema + round-trip + search proof; Schema + unit proof; Migration proof only | Schema + round-trip + search proof |

**Notes:** User refined storage decision: dimensions must be configured to match embedding model dimensions. Default fastembed uses 384, but dimension is derived from model metadata. Non-384 models require explicit schema/storage support.

---

## Router Learning Behavior

| Decision Point | Options Considered | User's Choice |
|---|---|---|
| Learned no-match rule state | Draft first; Immediately active; Active only in project scope | Draft first |
| Evidence stored | Full decision evidence; Minimal rule only; Audit event only | Full decision evidence |
| Draft approval flow | Web + CLI promote; Web only; All three mutate | All three mutate |
| Conflict handling | Explicit conflict state; Priority wins; Merge suggestion | Explicit conflict state |

**Notes:** Learned rules should be reviewable and explainable before activation. Conflicts stay disabled.

---

## LLM Routing Gate

| Decision Point | Options Considered | User's Choice |
|---|---|---|
| LLM fallback authority | Recommend + draft; Route only; Route + active learn | Recommend + draft |
| Confidence threshold behavior | Threshold + abstain; Always choose best; Ask user | Threshold + abstain |
| Allowed LLM inputs | Task facts only; Task + recent routing history; Full context bundle | Configurable, full context default |
| Full-context guardrail | Redaction + preview; Trust local mode; Disable in SaaS | Configurable, full context default |

**Notes:** User specified that task-facts-only and task-plus-history modes must be configurable and managed in interfaces, but full context is default in all states. Guardrails are also configurable in all interfaces; preserve existing context assembler secret-handling guarantees.

---

## MCP as Virtual Skills

| Decision Point | Options Considered | User's Choice |
|---|---|---|
| How MCP servers appear | First-class virtual skills; Separate tool source; Agent-specific only | First-class virtual skills |
| Invocation semantics | Discoverable descriptor only; Fulcrum proxy execution; Generated wrapper skills | Discoverable descriptor only |
| Lock/pin behavior | Pin registry descriptor; Pin name only; No pins | Pin registry descriptor |
| Visibility across agents | Capability-aware visibility; Only supported agents; Global visible | Global visible |

**Notes:** User asked why some agents might not support some skills/MCPs. Explanation covered runtime MCP support, config formats, transport, auth, binaries, safety policy, and integration gaps. User still chose global visibility without per-agent support details.

---

## Skill Sync + Lock Policy

| Decision Point | Options Considered | User's Choice |
|---|---|---|
| Lock mismatch behavior | Fail closed; Warn and skip; Warn and continue | Fail closed |
| Upstream sync diffs | Auto-merge safe diffs; Always manual review; Always overwrite | Auto-merge safe diffs |
| Conflict UX | Three-way conflict artifact; Inline conflict markers; Keep local, log upstream | Three-way conflict artifact |
| Override path | Explicit CLI override only; Any interface override; No override | Any interface override |

**Notes:** Overrides across Web/CLI/TUI must create audit records.

---

## Three-Surface Routing UX

| Decision Point | Options Considered | User's Choice |
|---|---|---|
| Routing config parity | Full CRUD parity; Web/CLI mutate, TUI read/test; Web primary | Full CRUD parity |
| Route testing UX | Explainable test result; Simple result; Debug-only detail | Explainable test result |
| Rule authoring model | Structured builder + JSON escape hatch; Raw JSON only; Natural language only | Structured builder + JSON escape hatch |
| Validation before save | Strict validation + dry-run; Save disabled draft; Save anything | Strict validation + dry-run |

**Notes:** Web, CLI, and TUI all need list/test/create/update/delete for routing rules and learned drafts in Phase 4.

## the agent's Discretion

- Exact service/repository boundaries.
- Exact config names, command names, and schema field names.
- Exact cross-platform static build proof mechanism, provided it is automated and repeatable.

## Deferred Ideas

None.
