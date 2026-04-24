# Contracts: Fulcrum CLI Agent OS

**Feature**: [Fulcrum CLI Agent OS](../spec.md)
**Date**: 2026-04-24

## Contract Rules

- Human output and machine-readable output describe the same canonical state.
- Agent-facing output uses JSON or JSONL and structured errors with `code`, `message`, `details`, and `retryable`.
- `blocked` means agents must stop and report remediation; they must not guess provider, dependency, adapter, or destructive-operation choices.
- Absolute paths appear only in explicit operator-facing preflight/report output. Agent-facing output uses stable refs and fingerprints.
- Mutations emit local events and, where applicable, receipts, artifacts, policy decisions, or validation reports.
- External adapters cannot directly mutate canonical task/run/event/state.
- Remote providers, telemetry export, external sync, Docker sidecars, model downloads, destructive reset, and backup purge require explicit opt-in or confirmation flow.

## Setup Contracts

### Setup Plan

Command:

```bash
fulcrum setup plan <core|code|memory|actions|full> --json
```

Contract:

- Read-only.
- Reports selected profile, dependency classifications, proposed managed assets, guided steps, blocked dependencies, network/download requirements, and safety warnings.
- Does not create receipts.

Output shape:

```json
{
  "profile": "code",
  "mode": "plan",
  "home": { "path_fingerprint": "sha256:..." },
  "dependencies": [
    {
      "id": "zoekt",
      "classification": "managed",
      "required": true,
      "planned_action": "install_managed_bundle",
      "network_required": true
    }
  ],
  "managed_assets": ["bin/", "sidecars/zoekt/", "indexes/zoekt/", "manifests/"],
  "blocking_errors": [],
  "warnings": []
}
```

### Setup Install

Command:

```bash
fulcrum setup install <profile> --json
fulcrum setup install <profile> --offline --json
fulcrum setup install <profile> --no-model-download --json
fulcrum setup install <profile> --host-tools-only --json
```

Contract:

- Real executor, not preview.
- Mutates only selected safe Fulcrum-managed assets.
- Writes setup lock and receipts.
- JSON mode emits JSONL step events.
- Offline mode performs zero network access.

JSONL event examples:

```jsonl
{"event":"setup.step.started","profile":"memory","id":"lightrag","index":5,"total":6}
{"event":"setup.step.completed","profile":"memory","id":"lightrag","paths":["sha256:..."],"duration_ms":1234}
{"event":"setup.step.failed","profile":"memory","id":"provider","code":"provider_missing","retryable":true,"fix":"fulcrum setup provider configure ..."}
```

Allowed managed assets:

```text
$FULCRUM_HOME/config.toml
$FULCRUM_HOME/fulcrum.db
$FULCRUM_HOME/events/
$FULCRUM_HOME/logs/
$FULCRUM_HOME/backups/
$FULCRUM_HOME/manifests/
$FULCRUM_HOME/bin/
$FULCRUM_HOME/parsers/
$FULCRUM_HOME/indexes/
$FULCRUM_HOME/sidecars/lightrag/
$FULCRUM_HOME/sidecars/zoekt/
$FULCRUM_HOME/sidecars/windmill/
$FULCRUM_HOME/sidecars/plane/
generated compose/env files for selected optional Docker profiles
```

### Setup Doctor

Command:

```bash
fulcrum setup doctor <profile> --json
```

Output shape:

```json
{
  "profile": "memory",
  "status": "blocked",
  "dependencies": [
    {
      "id": "memory-provider",
      "classification": "blocked",
      "required": true,
      "why": "LightRAG needs both LLM and embedding endpoints for extraction/query.",
      "fix": "fulcrum setup provider configure --kind openai-compatible --base-url http://127.0.0.1:11434/v1 --chat-model qwen3:14b --embedding-model qwen3-embedding:0.6b --embedding-dimensions 1024",
      "presets": ["ollama-local", "lmstudio-local", "vllm-local", "llama-cpp-local", "localai", "openai-compatible"]
    }
  ],
  "receipts_checked": true,
  "smoke_checks": []
}
```

Doctor smoke requirements:

- `core`: DB, event replay, daemon health, backup/restore verify.
- `code`: parser registry, Zoekt fixture index/query, LanceDB fixture insert/query/delete or explicit fallback, durable indexed row counts.
- `memory`: provider chat/embedding/reranker health, vector length equals dimensions, LightRAG import/API/query fixture, dimension drift check.
- `actions`: Docker Compose when selected, Windmill health, adapter API smoke.
- `full`: all selected profile checks plus optional Plane certification status.

### Setup Repair, Logs, Uninstall

Commands:

```bash
fulcrum setup repair <profile> --json
fulcrum setup logs --json
fulcrum setup uninstall <profile> --json
fulcrum setup uninstall <profile> --purge-backups --confirm <token> --json
```

Rules:

- Repair uses receipts and setup lock; it does not guess unmanaged host state.
- Logs output path fingerprints unless operator requests paths.
- Uninstall preserves backups by default.
- Backup purge requires explicit confirmation.

## Provider Contracts

### Provider Configure

Commands:

```bash
fulcrum setup provider preset ollama-local \
  --chat-model qwen3:14b \
  --embedding-model qwen3-embedding:0.6b \
  --embedding-dimensions 1024 \
  --json

fulcrum setup provider configure \
  --kind openai-compatible \
  --base-url http://127.0.0.1:1234/v1 \
  --api-key-env FULCRUM_LLM_API_KEY \
  --chat-model qwen3-14b \
  --embedding-model Qwen3-Embedding-0.6B \
  --embedding-dimensions 1024 \
  --json
```

Config shape:

```json
{
  "provider": {
    "kind": "openai-compatible",
    "base_url": "http://127.0.0.1:11434/v1",
    "api_key_env": "FULCRUM_LLM_API_KEY",
    "chat_model": "qwen3:14b",
    "embedding_model": "qwen3-embedding:0.6b",
    "embedding_dimensions": 1024,
    "reranker_model": "",
    "privacy_status": "local"
  }
}
```

Rules:

- Setup does not write API key values directly when env indirection is available.
- Remote base URLs require visible remote opt-in/privacy status.
- Existing vector indexes become blocked when provider model/dimensions differ from stored index metadata.

## Core OS Contracts

### Status And Doctor

Commands:

```bash
fulcrum status --json
fulcrum doctor --json
fulcrum validate core --json
```

Required fields:

```json
{
  "workspace_id": "ws_...",
  "daemon": {
    "state": "running",
    "pid": 1234,
    "health_url": "http://127.0.0.1:..."
  },
  "storage": {
    "schema_version": 1,
    "wal_enabled": true,
    "migration_ledger": "current"
  },
  "profiles": {
    "core": "ready",
    "code": "optional",
    "memory": "blocked"
  },
  "privacy": {
    "loopback_only": true,
    "remote_provider": false,
    "telemetry_export": false
  }
}
```

### Task And Run

Commands:

```bash
fulcrum task create --title <title> --json
fulcrum run start <task_id> --mode <stub|subprocess> --json
fulcrum run watch <run_id> --json
fulcrum run cancel <run_id> --json
fulcrum run complete <run_id> --json
```

Rules:

- Run transitions are validated.
- Each run has at most one terminal state.
- Heartbeats, blocks, failures, cancellations, completions, artifacts, and policy decisions are evented.

### Live Events

Commands:

```bash
fulcrum events watch --cursor <cursor> --json
fulcrum cockpit serve --loopback --json
```

Contract:

- SSE/live streams support cursor reconnect.
- Event replay reconstructs task/run/cockpit state.
- Local events are primary; OTel export is optional and opt-in.

## Code Intelligence Contracts

Commands:

```bash
fulcrum index project <path> --json
fulcrum search code <query> --explain --json
fulcrum rebuild-index code --mode plan --json
fulcrum rebuild-index code --execute --json
```

Search response shape:

```json
{
  "query": "SetupPlanner",
  "results": [
    {
      "type": "code_chunk",
      "rank": 1,
      "relative_path": "crates/fulcrum-setup/src/lib.rs",
      "line_start": 10,
      "line_end": 48,
      "symbol_path": "SetupPlanner",
      "freshness": "current",
      "lane_contributions": [
        { "lane": "exact_symbol", "rank": 1 },
        { "lane": "semantic", "rank": 8 }
      ],
      "degraded_lanes": []
    }
  ]
}
```

Rules:

- Exact identifier, exact symbol, exact token, path, quoted phrase, and suffix matches outrank weak semantic hits.
- Create/update/delete/rename update file, symbol, lexical, semantic, and graph state incrementally.
- Semantic backlog is daemon-drained, bounded, resumable, observable, cancellable after current batch, and limited to one active slice per workspace/project/source domain.
- Ignored, binary, large, and secret files are skipped with explicit reason.

## Memory And Context Contracts

Commands:

```bash
fulcrum memory import <path> --json
fulcrum memory query <query> --explain --json
fulcrum context build <query> --budget-tokens 6000 --explain --json
```

Context response shape:

```json
{
  "query": "adapter setup",
  "context_pack": {
    "budget_tokens": 6000,
    "used_tokens": 3810,
    "source_diversity": {
      "memory": 3,
      "code": 4,
      "graph": 2,
      "task": 1
    },
    "results": [
      {
        "type": "memory",
        "source_ref": "memsrc_...",
        "provenance_class": "raw_backed",
        "freshness": "current",
        "citation": "docs/research/2026-04-24-cross-os-adapter-setup-research.md"
      }
    ]
  },
  "trace": {
    "persisted": false,
    "tokenizer": "deterministic-fallback",
    "embedding_cache_hit": true,
    "degraded_lanes": []
  }
}
```

Rules:

- Read-only retrieval does not persist trace/artifact unless requested.
- Context pack prevents one file, memory family, source, or lane from dominating unless explicitly targeted.
- Claims must map to cited source spans in eval gates.
- Token budgets are tokenizer-aware with deterministic fallback and optional provider plugins.

## Worktree Contracts

Commands:

```bash
fulcrum worktree allocate <task_id> --json
fulcrum worktree status <worktree_allocation_id> --json
fulcrum review create --run <run_id> --artifact <artifact_id> --json
fulcrum merge enqueue <task_id> --json
fulcrum merge run <merge_item_id> --json
fulcrum worktree cleanup <worktree_allocation_id> --json
```

Rules:

- Dirty, untracked, conflicted, unmerged, and unsafe cleanup states are explicit.
- Merge success updates task, run, artifact, review queue, merge queue, and graph state consistently.
- Merge conflict blocks with reason and artifact.
- Cleanup refuses unsafe deletion.

## Adapter Contracts

### Action/Windmill

Commands:

```bash
fulcrum action run smoke --json
fulcrum adapter windmill doctor --json
```

Rules:

- Windmill is optional and profile-gated.
- Fulcrum creates Action Record before launch.
- Policy passes before launch.
- External job state maps to Fulcrum action state.
- Logs/results attach as artifacts.
- External action runner cannot mutate Run lifecycle directly.

### Plane

Commands:

```bash
fulcrum adapter plane doctor --json
fulcrum adapter plane import --json
fulcrum adapter plane export <task_id> --json
fulcrum adapter plane sync --dry-run --json
fulcrum adapter plane conflicts list --json
```

Rules:

- Plane is optional PM surface/import-export/sync only.
- Fulcrum remains source of truth.
- Mapping is reversible.
- Conflict states are explicit.
- Outage does not block core cockpit.

### Adapter Certification

Required report fields:

```json
{
  "adapter": "plane",
  "profile": "full",
  "install_strategy": "...",
  "doctor_health": "passed",
  "local_footprint": "...",
  "ports_processes": [],
  "external_ids": "...",
  "mapping_contract": "...",
  "crud_update_delete_semantics": "...",
  "offline_behavior": "...",
  "offline_boot_behavior": "...",
  "backup_restore_posture": "...",
  "uninstall_behavior": "...",
  "security_privacy_notes": "...",
  "clean_machine_smoke_result": "passed"
}
```

No adapter becomes default until certification and release-band gates pass.

## Validation Contracts

Commands:

```bash
fulcrum validate <core|code|memory|actions|full|release|privacy|setup|graph|context|adapter> --json
```

Rules:

- Validation emits pass/fail/degraded/skipped evidence.
- Release bands cannot be claimed with hidden skipped gates.
- Skipped optional gates require explicit defer reason.
- Privacy validation covers first-run network denial, loopback binding, secret redaction/exclusion, ignore rules, purge, backup preservation, and remote opt-in warnings.

Release band mapping:

```text
Local Alpha: M0-M2
Useful Alpha: M0-M6
Adapter Beta: M0-M8
Release Candidate/Beta Hardening: M0-M12
```
