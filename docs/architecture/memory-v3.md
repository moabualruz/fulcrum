# Memory v3 — Architecture

_Status: shipped. PR 9.5 retired the `FULCRUM_MEMORY_V3` opt-out flag; v3 is now the only memory path. Legacy v2a writeMemory is still the lifecycle-memory writer (runs/cos-parser), but the hook-side fallback is gone._

Fulcrum's memory subsystem stores what agents and users have seen, learned, and decided. v3 rebuilds the store around three explicit tiers — verbatim raw dumps, LLM-curated pages, and a vector index over the curated layer — so every recall carries a full audit trail back to the raw source.

This document is the operator reference. For the implementation plan, see [`docs/plans/2026-04-18-002-memory-tiered-architecture-plan.md`](../plans/2026-04-18-002-memory-tiered-architecture-plan.md).

---

## 1. The three tiers

### L0 — Raw dumps (verbatim, immutable)

- **Path:** `${globalDataDir()}/vault/raw/<source_type>/YYYY/MM/DD/<ULID>.md`
- **Filename:** ULID per file. IDs follow the `l0src_<26-char Crockford base32>` convention.
- **Writer:** `ingestRawSource({source_type, body, meta})` — the single entry point.
- **Readers:** anyone; body is guaranteed verbatim.
- **Source types:** `bash_trace`, `tool_trace`, `file_patch`, `session_transcript`, `prompt_attachment`, `web_capture`, `edit_diff`, `correction`.
- **Guarantees:** no truncation, no normalization, no in-place sanitization. The body on disk is whatever the caller passed. Sanitization runs, but the output goes to the WAL audit row only.
- **Index:** one `l0_sources` row per file — `{source_id, source_type, workspace_id, vault_path, content_hash, size_bytes, created_at}`.

### L1 — Curated wiki pages (LLM-maintained, template-gated)

- **Path:** `${globalDataDir()}/vault/curated/{entities|concepts|pages|synthesis}/<ULID>.md`.
- **Writer:** the curator — a pluggable LLM backend invoked via `fulcrum memory curate <l0_id>` or the auto-trigger watcher (PR 8.1).
- **Readers:** recall, inspect, trace.
- **Frontmatter:** `id`, `schema: fulcrum.memory/v3`, `type`, `confidence`, `retention_tier`, `first_seen`, `last_confirmed`, `sources[]` (L0 ULIDs), `supersedes[]`, `superseded_by`, `entities[]`, `access_count`.
- **Body:** LLM-synthesized prose with inline `[[raw/...]]` wikilinks pointing back to L0 sources.
- **Template-gated:** every page passes through `validateL1Page` before it hits disk. Four templates live at `packages/memory/src/l1/templates/{entity,concept,page,synthesis}.template.md`.
- **Index:** the existing `memories` table carries the canonical row; a read-only `l1_pages` view filters to `schema_version >= 3`.

### L2 — Vector index

- **Tables:** `vec_memories` (embeds L1 page bodies), `vec_chunks` (embeds code_chunks; unchanged from v2a).
- **Writer:** `recordL1Embedding(page_id)` fires after every curator apply. Hash-based change detection avoids re-embedding unchanged bodies.
- **Retrieval:** hybrid — FTS5 BM25 + vector cosine + graph traversal + RRF fusion + confidence + supersession filter.

---

## 2. Lifecycle

Every L1 page carries a `confidence` score in `[0.0, 1.0]` and a `retention_tier`:

| Tier | Typical lifespan | Decay λ per day |
|---|---|---|
| `working` | hours – days | 0.3 |
| `episodic` | days – weeks | 0.1 |
| `semantic` | weeks – months | 0.01 |
| `procedural` | months – years | 0.001 |

Confidence decays per an Ebbinghaus curve: `confidence *= exp(-λ · days_since_last_confirm)`. Decay runs via `applyDecay(db)` — idempotent within a 1h window so scheduled jobs can safely re-fire.

- **Supersession.** A new L1 page may declare `supersedes: [old_id]`. The old row gains `superseded_by: new_id` and is filtered out of default recall. Curator output that includes `contradicts: [old_id]` AND whose new-page confidence ≥ old-page confidence auto-applies supersession (PR 7.2).
- **Archival.** Pages with confidence < 0.1 AND no access in 30d move to `curated/.archive/…` via `archivePage(page_id)`. The row stays; the vault path shifts; retrieval filters ignore the archived prefix.
- **Consolidation.** `findConsolidationCandidates(db, {workspace_id})` scans for pages that share the same entity set + retention tier + clear the confidence floor. The PR 7.4 engine emits dry-run candidates; curator-driven apply is deferred until the consolidation prompt stabilises.
- **Lint.** `fulcrum memory lint` reports orphans, broken wikilinks, stale claims (last_confirmed > 90d + confidence > 0.5), sources-vs-inline divergence, and template violations retroactively.

---

## 3. Curator pipeline

The curator is the only writer for L1 bodies. Humans edit by committing to git; the watcher re-indexes on change.

```
L0 raw dump
    │
    ▼
runCurator({l0_source, task, backend, model, reasoning})
    │  composes the prompt via composePrompt() — XML-delimited, template-verbatim,
    │  <USER_CONTENT> isolation for L0 body, <AGENT_CORRECTION> for corrections.
    ▼
backend.curate(prompt, schema, options)  →  CuratorOutput
    │  Structured-output schema (additionalProperties:false, all required)
    │  parseCuratorOutput() enforces the post-curator semantic allowlist:
    │    every new_pages[].sources[] ULID must be in the batch input.
    ▼
applyCuratorOutput(db, output, context)
    │  Inside db.transaction() — new pages, updates, supersessions, edges.
    │  Vault files unlinked on any throw.
    ▼
appendCuratorLog(vault, {l0_id, backend, affected_pages, confidence_deltas,
                         duration_ms, prompt_version})
```

**Backend selection order** (override via `FULCRUM_CURATOR_BACKEND`):

1. `codex` CLI — spawns `codex exec --json --output-schema=<file>`. Primary for ChatGPT Plus/Pro subscribers.
2. `pi` CLI — terminal future slot; filled when pi's non-interactive mode stabilises.
3. `openai` API — direct fetch to `/v1/chat/completions` with `response_format.json_schema.strict:true`.
4. `anthropic` API — terminal future slot for Claude-powered curation.

**Model + reasoning pinning** (per-task; override via `FULCRUM_CURATOR_MODEL_<TASK>`):

| Task | Model | Reasoning |
|---|---|---|
| extraction (95%) | `gpt-5-mini` | `minimal` |
| consolidation | `gpt-5-nano` | `minimal` |
| synthesis | `gpt-5` | `medium` |

---

## 4. Feature flags (operator cheatsheet)

| Env var | Default | Effect |
|---|---|---|
| `FULCRUM_MEMORY_CURATE_AUTO` | **on** | Vault watcher auto-fires the curator 30s after each new L0 drops (debounced per l0_id). Opt out with `0`/`false`/`off`/`no`. |
| `FULCRUM_MEMORY_CONSOLIDATE_SCHEDULE` | **daily** | Scheduled consolidation scan; logs to `vault/curated/consolidate.log.md`. Override with `hourly`; opt out with `never`/`off`/`0`/`false`/`no`. Unknown cadence strings also disable. |
| `FULCRUM_CURATOR_BACKEND` | auto-select | Force a specific backend: `codex` \| `pi` \| `openai` \| `anthropic`. |
| `FULCRUM_CURATOR_MODEL` | per-task | Global override for all curator tasks. Also `FULCRUM_CURATOR_MODEL_EXTRACTION`, `_CONSOLIDATION`, `_SYNTHESIS`. |
| `FULCRUM_CURATOR_REASONING` | per-task | Reasoning effort — typically `minimal`, `medium`, or `high`. |
| `FULCRUM_VAULT_PATH` | `~/.fulcrum/vault` | Override the vault root. Tests use this to redirect to a tmpdir. |
| `FULCRUM_OPERATOR_CONFIRM` | unset | Required UUID token to run `fulcrum memory rollback --to v2` (operator-only). |

Critical Constraint #6 in the plan: control-plane features defaulted OFF during PRs 0-8 so the rollout didn't break in-flight sessions, then flipped to default-ON after PR 9. Operators opt OUT of the curator + consolidation cron, not in — matches the "dormant, not absent" spirit without the permanent-dormancy side effect.

---

## 5. Inspection + correction

Every action a user can take, an agent can also take (Critical Constraint #8).

| Task | CLI | MCP tool |
|---|---|---|
| Show an L1 page with full body + frontmatter | `fulcrum memory inspect <page_id>` | `mcp__fulcrum__inspect_memory` |
| Walk L1 → L0 sources | `fulcrum memory sources <page_id>` | `mcp__fulcrum__get_memory_sources` |
| Read a specific L0 raw file | `fulcrum memory read-raw <l0_id>` | `mcp__fulcrum__read_raw_source` |
| Reverse lookup by claim text | `fulcrum memory trace "<text>"` | `mcp__fulcrum__trace_claim` |
| Run curator on one L0 | `fulcrum memory curate <l0_id>` | (agent-callable via MCP; covered in PR 5.4) |
| Propose merges | `fulcrum memory consolidate` | `mcp__fulcrum__consolidate_memory` |
| Lint the vault | `fulcrum memory lint` | `mcp__fulcrum__lint_memory` |
| Mark a page wrong | `fulcrum memory mark-wrong <page_id> --reason "..."` | `mcp__fulcrum__mark_memory_wrong` _(role-gated to `chief_of_staff`)_ |

**Mark-wrong flow.** User hits a bad recall → `fulcrum memory mark-wrong` appends a `source_type='correction'` L0 entry under `raw/correction/...` → curator re-run with the correction in a `<AGENT_CORRECTION>` delimiter → new page supersedes the flagged one. Audit chain preserved in `vault/curated/log.md`. Corrections carry a distinct trust tier — the curator treats them as claims to be verified, not as ground truth (Critical Constraint #14).

---

## 6. Observability — `GET /memory/stats`

The monitor server (`fulcrum serve monitor`, default port 4721) exposes `GET /memory/stats?workspace_id=<ws>`:

```json
{
  "data": {
    "l0": { "total": 12458, "ingest_rate_per_hour": 47 },
    "l1": {
      "total": 1842,
      "superseded": 203,
      "by_tier": {
        "working": 312, "episodic": 864, "semantic": 583, "procedural": 83
      },
      "confidence_histogram": [
        { "bucket": "0.0-0.1", "count": 7 },
        { "bucket": "0.1-0.2", "count": 22 },
        { "bucket": "0.2-0.3", "count": 48 },
        { "bucket": "0.3-0.4", "count": 112 },
        { "bucket": "0.4-0.5", "count": 186 },
        { "bucket": "0.5-0.6", "count": 301 },
        { "bucket": "0.6-0.7", "count": 408 },
        { "bucket": "0.7-0.8", "count": 441 },
        { "bucket": "0.8-0.9", "count": 222 },
        { "bucket": "0.9-1.0", "count": 95 }
      ]
    },
    "graph": { "nodes": 1104, "edges": 3892 },
    "curation": {
      "runs_last_24h": 318,
      "p50_duration_ms": 1840,
      "p95_duration_ms": 6102
    }
  }
}
```

Curation percentiles read `vault/curated/log.md`. Missing file ⇒ nulls. Malformed lines are skipped.

**CI gate.** `.github/workflows/memory-eval.yml` runs `pnpm --filter fulcrum-memory eval:fulcrum-recall` on every PR touching `packages/memory/src/{retrieval,l0,l1,l2,migration,eval}/**`, `stats.ts`, `schema.ts`, `write.ts`, `recall.ts`, or `scoring.ts`. The job must pass before merge.

---

## 7. Walkthrough — ingest → curate → recall → correct

```bash
# 1. Drop an L0 source (normally done via hooks; manual here for clarity).
fulcrum hook claude post --tool-name Bash --exit-code 0 <<< '{"command":"grep -r foo src/","output":"..."}'

# 2. When FULCRUM_MEMORY_CURATE_AUTO=1, the watcher debounces 30s then runs
#    the curator. Manual mode: pick up the ULID from the ingest output and
#    run curator yourself.
fulcrum memory curate l0src_01KPGHE... --backend codex

# 3. Recall — picks the new L1 page ordered by fused FTS+vec+graph score.
fulcrum memory recall "grep pattern in src"

# 4. Inspect the result.
fulcrum memory inspect <page_id>

# 5. Walk to the raw sources.
fulcrum memory sources <page_id>
fulcrum memory read-raw <l0_id>

# 6. Hit a bad recall? Flag it.
fulcrum memory mark-wrong <page_id> --reason "ignored the --exclude-dir flag"
#     → writes a correction L0, re-fires curator, new page supersedes the old.
```

All of the above are mirrored as MCP tools so agents can drive the same flow.

---

## 8. Rollback

`fulcrum memory rollback --to v2` (operator-only) restores the pre-migration snapshot. Guardrails (Critical Constraint #17):

1. stdout must be a TTY.
2. `FULCRUM_OPERATOR_CONFIRM=<uuid>` must be set to a fresh UUID (consumed on use).
3. `fulcrum action exec memory.rollback` — refused. No agent surface.
4. No MCP tool is registered for rollback.

---

## 9. Files of interest

- `packages/memory/src/l0/ingest.ts` — L0 single-writer entry point.
- `packages/memory/src/l1/page.ts` — curated page create/update/supersede primitives.
- `packages/memory/src/l1/validator.ts` — template + source-traceability rules.
- `packages/memory/src/l1/curator.ts` — prompt composer, backend registry, orchestrator.
- `packages/memory/src/l1/curator-backend/{codex,openai,pi}.ts` — backend implementations.
- `packages/memory/src/l1/apply.ts` — deterministic curator-output applier.
- `packages/memory/src/l1/lifecycle.ts` — decay, promote, archive.
- `packages/memory/src/l1/consolidate.ts` — merge-candidate scanner.
- `packages/memory/src/l1/auto-curate.ts` — vault-watcher-driven auto-trigger (PR 8.1).
- `packages/memory/src/l1/consolidate-schedule.ts` — cadence-driven scan loop (PR 8.2).
- `packages/memory/src/stats.ts` — `/memory/stats` compute fn (PR 8.3).
- `packages/memory/src/schema.ts` — v3 migrations 101–104.
- `packages/memory/src/migration/` — v2a → v3 classifier + migrator (PR 6).
- `packages/memory/src/retrieval/v3-search.ts` — graph + confidence + supersession-filtered recall.
- `packages/cli/src/commands/memory-*.ts` — CLI shims + MCP parity handlers.
- `docs/plans/2026-04-18-002-memory-tiered-architecture-plan.md` — the full plan.
