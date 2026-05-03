---
Status: implemented
Triage: AFK
Pillar: 17-cross-cutting-platform
Blocked-by: [17-cross-cutting-platform/issues/04-theme-trpc-and-composable.md, 17-cross-cutting-platform/issues/02-secrets-keyring-and-vault.md, 17-cross-cutting-platform/issues/05-error-crashlog-trpc-and-surfaces.md, 17-cross-cutting-platform/issues/03-backup-restore-trpc.md, 17-cross-cutting-platform/issues/06-telemetry-collector-trpc-and-surfaces.md, 17-cross-cutting-platform/issues/07-feature-flag-rollout-trpc.md, 17-cross-cutting-platform/issues/09-json-import-export-trpc.md, 14-cli-codegen/issues/01-codegen-pipeline.md]
PRD: .scratch/agent-os-vision/prds/17-cross-cutting-platform.md
Requirements: .scratch/agent-os-vision/REQUIREMENTS.md (Pillar 14 section)
Decisions: [Q-cli-shape, C4]
Vision: .scratch/agent-os-vision/REQUIREMENTS.md (Pillar 14 — CLI surface)
Docs: https://bun.sh/docs
---

# CLI surfaces — fulcrum theme/secrets/errors/backup/telemetry/flags/export/import commands

## What to build

Wire the Pillar 14 CLI codegen to emit commands for all Pillar 17 tRPC namespaces. All commands: `--json` flag returns typed JSON; non-zero exit on error. Specific behaviors beyond codegen defaults:

- `fulcrum secrets set <name>`: reads value from stdin (never positional arg, never `--value` flag stored in shell history).
- `fulcrum secrets get <name>`: returns `{name, masked_value: "***", last_used_at}` by default; `--unmask` prompts Y/N before revealing.
- `fulcrum secrets rotate <name>`: prompts for new value on stdin.
- `fulcrum backup`: streams progress (KB written) to stderr; exits 0 with JSON manifest to stdout when `--json`.
- `fulcrum restore --dry-run`: exit 0 even on collision detection; returns collision list in JSON.
- `fulcrum flags set <name> --rollout-percent <0-100>`: validates 0–100.
- `fulcrum export --format csv --entity tasks`: only allowed when `import-csv`/`export-csv` flag ON.

## Acceptance criteria

- [ ] `fulcrum theme list --json` → typed array of `{key, value}`.
- [ ] `fulcrum secrets set MY_KEY` (stdin: `echo "sk-..."`) → `{id, name, created_at}` JSON; no value in output.
- [ ] `fulcrum secrets get MY_KEY --json` → `{name, masked_value: "***"}` (unmasked only with `--unmask` + Y/N).
- [ ] `fulcrum errors list --since 2026-05-01 --json` → filtered array.
- [ ] `fulcrum backup --output /tmp/b.tar.gz --json` → `{manifest: {...}, path: "/tmp/b.tar.gz"}`.
- [ ] `fulcrum restore --input /tmp/b.tar.gz --dry-run --json` → `{collisions: [...], entity_counts: {...}}`.
- [ ] `fulcrum telemetry status --json` → `{opted_in: bool, row_count: N}`.
- [ ] `fulcrum flags set my-feature --enabled --rollout-percent 50 --json` → `{name, enabled, rollout_percent}`.
- [ ] `fulcrum export --format json --output /tmp/org.json` → valid file; `--format csv` without flag → error "Feature import-csv/export-csv not enabled".
- [ ] All commands: unknown flag → helpful error; missing required arg → helpful error.

## Blocked by

- All Pillar 17 tRPC procedure issues.
- Pillar 14 issue 01 (codegen pipeline) — CLI command tree generation.
