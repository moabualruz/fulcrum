# Quickstart: Fulcrum CLI Agent OS

**Feature**: [Fulcrum CLI Agent OS](./spec.md)
**Audience**: implementers, reviewers, and roadmap validators

This quickstart describes expected validation flows for future implementation. Commands are contract examples, not proof that current code already supports the roadmap.

## Preconditions

- Work from repo root.
- Treat current branch as alpha/spike foundation until milestone gates pass.
- Use temporary `FULCRUM_HOME` for setup, doctor, backup, restore, reset, and uninstall validation.
- Keep `core` tests sidecar-free.
- Keep code, memory, actions, full, remote provider, Docker, telemetry export, and model-download flows explicitly profile-gated.

## M0 Core Bootstrap Transcript

```bash
export FULCRUM_HOME="$(mktemp -d)"

fulcrum setup plan core --json
fulcrum setup install core --json
fulcrum init --json
fulcrum up --json
fulcrum status --json
fulcrum doctor --json
fulcrum validate core --json
fulcrum backup create --json
fulcrum down --json
fulcrum restore verify <backup_id> --json
fulcrum setup uninstall core --mode preview --json
```

Expected:

- First state creation occurs only after explicit command.
- No cloud credentials, Docker, remote model, remote telemetry, remote DB, or external PM product required.
- Daemon binds loopback only.
- Backup manifest verifies canonical state.
- Uninstall preview preserves backups by default.

## M1 Task/Run/Event Transcript

```bash
fulcrum task create --title "Smoke local run" --json
fulcrum run start <task_id> --mode stub --json
fulcrum run watch <run_id> --json
fulcrum run complete <run_id> --json
fulcrum event replay --run <run_id> --json
```

Expected:

- Run emits heartbeat and terminal event.
- Invalid transitions fail with structured error.
- Each run reaches at most one terminal state.
- Artifact metadata includes kind, size, digest, producer refs, task/run refs, and retention state.

## M2 Cockpit/TUI Live State Transcript

```bash
fulcrum dashboard snapshot --json
fulcrum events watch --cursor latest --json
fulcrum cockpit serve --loopback --json
```

Expected:

- CLI, TUI/cockpit, and event replay show same task/run/blocker/artifact/policy state.
- SSE/live stream reconnects with cursor.
- Missing optional sidecars show as optional or degraded without blocking core workflows.

## M3 Code Profile Transcript

```bash
export FULCRUM_HOME="$(mktemp -d)"

fulcrum setup plan code --json
fulcrum setup install code --json
fulcrum setup doctor code --json
fulcrum index project . --json
fulcrum search code "SetupPlanner" --explain --json
```

Expected:

- Parser registry smoke passes.
- Zoekt fixture index/query passes or explicit fallback is reported.
- LanceDB fixture insert/query/delete passes or explicit fallback is reported.
- Real project indexing handles create/update/delete/rename without full rebuild.
- Exact symbol, path, quoted phrase, and identifier-like hits outrank weak semantic hits.
- Missing vectors degrade semantic lane without breaking exact search.

## M4 Memory Profile Transcript

```bash
export FULCRUM_HOME="$(mktemp -d)"

fulcrum setup provider configure \
  --kind openai-compatible \
  --base-url http://127.0.0.1:11434/v1 \
  --chat-model qwen3:14b \
  --embedding-model qwen3-embedding:0.6b \
  --embedding-dimensions 1024 \
  --json

fulcrum setup install memory --no-model-download --json
fulcrum setup doctor memory --json
fulcrum memory import docs/ --json
fulcrum memory query "adapter setup" --explain --json
fulcrum memory delete <memory_source_id> --json
fulcrum memory query "adapter setup" --explain --json
```

Expected:

- Provider config is required for memory readiness.
- Doctor verifies chat endpoint, embedding endpoint, returned vector length, optional reranker, and privacy status.
- LightRAG import/API/query smoke passes when provider is ready.
- Import/update/delete/tombstone changes query results with provenance.
- Embedding model/dimension drift blocks until affected vectors rebuild.

## M5 Worktree Delivery Transcript

```bash
fulcrum task create --title "Implement smoke change" --json
fulcrum worktree allocate <task_id> --json
fulcrum run start <task_id> --worktree <worktree_allocation_id> --mode subprocess --json
fulcrum worktree status <worktree_allocation_id> --json
fulcrum review create --run <run_id> --artifact <artifact_id> --json
fulcrum merge enqueue <task_id> --json
fulcrum merge run <merge_item_id> --json
fulcrum worktree cleanup <worktree_allocation_id> --json
```

Expected:

- Dirty, untracked, conflicted, and unmerged state are visible.
- Review findings attach to files, artifacts, runs, and tasks.
- Merge success updates task/run/artifact/merge/review/graph state.
- Conflict produces block reason and artifact.
- Cleanup refuses unsafe worktrees.

## M6 Setup Profiles Transcript

```bash
export FULCRUM_HOME="$(mktemp -d)"

fulcrum setup plan full --json
fulcrum setup install code --offline --json
fulcrum setup doctor code --json
fulcrum setup repair code --json
fulcrum setup logs --json
fulcrum setup uninstall code --json
```

Expected:

- `setup plan` is read-only.
- `setup install --json` emits JSONL step events.
- Managed writes stay under selected safe `$FULCRUM_HOME` assets.
- Setup lock and receipts record profile, OS/arch, versions, sources, hashes, paths, health commands, and results.
- Offline mode makes zero network access and blocks with exact remediation when assets are missing.
- Windows validation avoids shell-only scripts, Visual Studio Build Tools, Homebrew-style assumptions, and host-global PATH mutation.

## M7 Actions Transcript

```bash
fulcrum setup plan actions --json
fulcrum setup doctor actions --json
fulcrum action run smoke --json
fulcrum artifact list --action <action_id> --json
```

Expected:

- Docker Compose missing state is guided or blocked only for selected actions/full profiles.
- Action launch creates Fulcrum action record.
- Policy passes before launch.
- Windmill/external job status maps to Fulcrum action state.
- Logs/results attach as artifacts.
- Windmill cannot mutate Run lifecycle directly.

## M8 Plane Adapter Transcript

```bash
fulcrum adapter plane doctor --json
fulcrum adapter plane import --json
fulcrum adapter plane export <task_id> --json
fulcrum adapter plane sync --dry-run --json
fulcrum adapter plane conflicts list --json
```

Expected:

- Fulcrum cockpit works when Plane is absent or offline.
- Plane work item mappings are reversible.
- Conflicts are explicit.
- Adapter footprint and offline behavior are recorded in certification report.

## M9-M12 Release Validation Transcript

```bash
fulcrum validate privacy --json
fulcrum validate setup --profile core --json
fulcrum validate setup --profile code --json
fulcrum validate setup --profile memory --json
fulcrum validate context --json
fulcrum validate graph --json
fulcrum validate release --json
```

Expected:

- Network-deny first-run passes.
- Loopback bind is default.
- Secrets, credentials, raw env values, and unapproved private paths are redacted or excluded.
- `.gitignore` and `.fulcrum/ignore` are respected for indexing/retrieval/artifacts.
- Context packs cite source refs and preserve lane explanations.
- Graph refs update incrementally and repair derived graph only.
- Backup/restore/uninstall/rollback docs and tests exist.

## Release Band Checklist

- Local Alpha: M0-M2 validation runs pass.
- Useful Alpha: M0-M6 validation runs pass, including setup profile doctor proof for `core`, `code`, and `memory`.
- Adapter Beta: M0-M8 validation runs pass, including optional adapter certification or explicit deferral.
- Release Candidate/Beta Hardening: M0-M12 validation runs pass, including privacy, packaging, RAG quality, graph correctness, recovery, and docs.

## Planning Artifact Verification

```bash
test -f specs/003-fulcrum-cli-agent-os/plan.md
test -f specs/003-fulcrum-cli-agent-os/research.md
test -f specs/003-fulcrum-cli-agent-os/data-model.md
test -f specs/003-fulcrum-cli-agent-os/quickstart.md
test -f specs/003-fulcrum-cli-agent-os/contracts/cli-agent-os-contracts.md
rg "UNRESOLVED_PLACEHOLDER" specs/003-fulcrum-cli-agent-os
```

Expected:

- Artifact files exist.
- No unresolved planning placeholders remain in generated plan artifacts.
- Deferred choices are recorded as milestone gates or adapter certification gates.
