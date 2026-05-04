---
Status: completed
Triage: AFK
Pillar: 04-sandcastle-wrapper
Blocked-by: 09-sandbox-runner-nosandbox-happy-path
ImplCommit: 043dfa5499cfa9e6993e0d646775f225d469c4d3
ImplRuntime: codex
---

# Gated sandbox providers: Docker, Podman, Vercel, Daytona, Modal, E2B

## Parent: PRD `prds/04-sandcastle-wrapper.md`

## What to build (end-to-end)

Implement provider-selection logic in `sandbox-runner.ts` for all six gated sandbox providers: `sandbox-docker`, `sandbox-podman`, `sandbox-vercel`, `sandbox-daytona`, `sandbox-modal`, `sandbox-e2b`. Each is activated by `FULCRUM_FEATURES=<flag>`. Provider selection reads active flags at run time and resolves to the correct Sandcastle provider object. Docker and Podman are mutually exclusive (error if both on). `fulcrum doctor` gains one check-group per provider: required env vars present, daemon reachable (Docker/Podman), flag off → noSandbox path active. No silent fallback when a provider is explicitly requested but unavailable — throw `SandboxProviderUnavailableError`.

## Acceptance criteria

- [x] Adapter / profile: `resolveProvider(flags, env)` function in `sandbox-runner.ts`; returns correct Sandcastle provider object per active flag; defaults to `noSandbox()` when no flag active.
- [x] Lifecycle integration: Docker + Podman mutual-exclusion check — if both `sandbox-docker` and `sandbox-podman` active simultaneously, throw with clear error message; never silently pick one.
- [x] Lifecycle integration: when `sandbox-docker` active + `docker info` non-zero exit → throw `SandboxProviderUnavailableError` (no silent noSandbox fallback); same pattern for Podman.
- [x] Lifecycle integration: cloud providers (Vercel/Daytona/Modal/E2B) require their respective env vars; `SandboxProviderUnavailableError` thrown if flag active but var absent.
- [x] Surfaces parity: `fulcrum doctor` reports `ok`/`warn`/`error` for each provider's prerequisite check; `sandbox_mode` column on `agent_runs` records the actual provider used (`'host'`, `'docker'`, `'podman'`); CLI `runs list --json` includes `sandbox_mode`.
- [x] Tests: unit test for each provider-selection branch; Docker mutual-exclusion test; `SandboxProviderUnavailableError` thrown when daemon down (mock `docker info` exit 1); noSandbox selected when no flags active.

## Blocked by

09-sandbox-runner-nosandbox-happy-path

## Notes

All six providers are shipped and tested behind flags per C1/C5. The `sandbox_mode` DB column currently supports `'host'|'docker'|'podman'` — extend the CHECK constraint if cloud provider modes need to be persisted (may need a schema migration addendum). Cloud providers (Vercel, Daytona, Modal, E2B) do not have a daemon-reachability check; their gate is env-var presence only.
