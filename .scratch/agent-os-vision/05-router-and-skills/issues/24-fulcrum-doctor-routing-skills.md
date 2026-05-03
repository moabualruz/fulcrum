---
Status: implemented
Triage: AFK
ImplRuntime: claude
Pillar: 05-router-and-skills
Blocked-by: 07-routing-trpc-procedures, 16-skills-trpc-procedures, 12-llm-fallback-tier3-gated
---

# fulcrum doctor — routing + skills health checks

## Parent: PRD `prds/05-router-and-skills.md`

## What to build

Extend `fulcrum doctor` (existing command from Pillar 1) with Pillar 5 health checks: (1) `routing_rules` table exists and is reachable, (2) pending skills conflicts count, (3) `router-llm` feature state + inference sidecar reachability when flag ON. Exit-0 when all checks pass. Exit non-zero when any check fails (with clear error per failing check).

## Acceptance criteria

- [ ] Schema / module: `src/cli/doctor/routing-checks.ts` exports three check functions integrated into the doctor runner
- [ ] Logic: `routing_rules` table missing → doctor reports "routing_rules table not found — run migrations" + marks check FAIL
- [ ] Logic: pending conflicts > 0 → doctor reports "N skills have upstream conflicts — run `fulcrum skills conflicts list`" + marks check WARN (not FAIL)
- [ ] Logic: `router-llm` flag OFF → doctor reports "router-llm: disabled (deterministic rules only)" + marks check PASS
- [ ] Logic: `router-llm` flag ON + sidecar reachable → doctor reports "router-llm: enabled, sidecar OK" + marks check PASS
- [ ] Logic: `router-llm` flag ON + sidecar unreachable → doctor reports "router-llm: enabled, sidecar UNREACHABLE" + marks check FAIL
- [ ] Logic: all checks pass → exit code 0
- [ ] Logic: any FAIL check → exit code 1
- [ ] Surfaces parity: doctor is CLI-only; same checks reflected as status tiles on Web dashboard (link to existing dashboard component if present)
- [ ] Tests: each check pass/fail/warn scenario
- [ ] Tests: exit code 0 on all pass; exit code 1 on any fail

## Blocked by

- `07-routing-trpc-procedures`
- `16-skills-trpc-procedures`
- `12-llm-fallback-tier3-gated`

## Notes

Sidecar reachability check: send a health-check JSON-RPC call to the Unix socket; 1s timeout; success = reachable. Do not start the sidecar as part of doctor — only test if already running.
