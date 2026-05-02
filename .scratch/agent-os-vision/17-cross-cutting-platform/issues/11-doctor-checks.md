---
Status: ready-for-agent
Triage: AFK
Pillar: 17-cross-cutting-platform
Blocked-by: [17-cross-cutting-platform/issues/02-secrets-keyring-and-vault.md, 17-cross-cutting-platform/issues/05-error-crashlog-trpc-and-surfaces.md, 17-cross-cutting-platform/issues/06-telemetry-collector-trpc-and-surfaces.md, 17-cross-cutting-platform/issues/07-feature-flag-rollout-trpc.md, 01-foundation-reset/issues/18-test-infrastructure-baseline-and-ci.md]
PRD: .scratch/agent-os-vision/prds/17-cross-cutting-platform.md
Requirements: .scratch/agent-os-vision/REQUIREMENTS.md (Cross-Cutting Requirements section)
Decisions: [A2, C4]
Vision: .scratch/agent-os-vision/EXTRA-GAPS.md (A2 doctor coverage)
Docs: https://bun.sh/docs
---

# Doctor checks — all 11 platform.* checks implemented

## What to build

Implement all 11 `platform.*` doctor checks in the doctor subsystem (Pillar 1 extension point). Each check: returns `{name, status: 'pass'|'warn'|'fail', message, recovery, checked_at}` JSON shape per PRD Zod schema. Checks: `platform.theme` (`TenantSettingRepository` readable, accent parseable HEX); `platform.keyring` (OS keyring reachable OR fallback file exists mode 0600); `platform.keyring_mode` (warn if fallback in use); `platform.credentials` (`Credential` metadata registered + encryption round-trip succeeds); `platform.crashlog_dir` (`~/.fulcrum/state/errors/` exists + writable); `platform.backup_last_run` (last backup <7d or no policy — info only); `platform.telemetry` (`opted_in` has value); `platform.flags_registry` (feature-flag registry loads, count reported); `platform.experiment_entity` (`ExperimentAssignment` metadata registered); `platform.i18n` (when `i18n` flag ON: all locale JSON present, zero missing keys); `platform.remote_backup` (when `scheduled-backups` ON: remote DSN reachable + test PUT succeeds).

`fulcrum doctor --json`: exit code 0 on all pass; exit code 1 on any fail. Total all-checks runtime <3s p99.

## Acceptance criteria

- [ ] All 11 checks registered and returned in `doctor.runAll()` response.
- [ ] Pass scenarios: each check returns `status: 'pass'` on a clean system.
- [ ] Fail scenarios: simulate each failure condition → correct `status: 'fail'` + `recovery` text.
- [ ] Warn scenarios: `platform.keyring_mode` (fallback in use) → `status: 'warn'`; `platform.backup_last_run` (>7d) → `status: 'warn'` (not fail).
- [ ] `platform.i18n` gated: flag OFF → check returns `status: 'skip'`; flag ON + all JSON present → `pass`.
- [ ] `platform.remote_backup` gated: flag OFF → `skip`; flag ON + DSN unreachable → `fail` + recovery.
- [ ] `fulcrum doctor --json` all-checks runtime <3s in Vitest timer test.
- [ ] JSON shape: matches `PlatformDoctorCheck` Zod schema with `checked_at` ISO timestamp.

## Blocked by

- Issues 02, 05, 06, 07 (keyring/vault, crashlog, telemetry, flags) — check logic depends on these modules.
- Pillar 1 issue 18 (CI infrastructure) — doctor extension point.
