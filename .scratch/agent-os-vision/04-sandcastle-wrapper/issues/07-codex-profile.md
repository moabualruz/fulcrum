---
Status: implemented
Triage: AFK
Pillar: 04-sandcastle-wrapper
Blocked-by: 05-agent-profile-type-registry
---

# codex agent profile + fulcrum agents test codex

## Parent: PRD `prds/04-sandcastle-wrapper.md`

## What to build (end-to-end)

Implement the `codex` agent profile at `src/agents/profiles/codex.ts`. The Codex CLI uses `OPENAI_API_KEY`. Register in registry. Wire `fulcrum agents test codex` end-to-end: spawn `codex --version`, check `OPENAI_API_KEY`, write DB result, `--json` output.

## Acceptance criteria

- [x] Adapter / profile: `src/agents/profiles/codex.ts` exports `AgentProfile` with `name: 'codex'`, `cliPath: 'codex'`, `authEnvVars: ['OPENAI_API_KEY']`, `skillFolder: '~/.codex/skills'`, `sandcastleProvider: 'noSandbox'`, `maxIterations` and `defaultTimeout` set to sane defaults.
- [x] Lifecycle integration: profile loaded by registry; `getProfile('codex')` returns profile.
- [ ] Lifecycle integration: `fulcrum agents test codex` spawns `codex --version`, checks `OPENAI_API_KEY`, writes `last_tested_at` + `test_passed` to DB.
- [ ] Surfaces parity: `--json` output on `test`; `fulcrum doctor` includes codex binary + `OPENAI_API_KEY` check.
- [ ] Tests: same mock-spawn pattern as claude-code slice; binary missing → `test_passed=false`; auth var missing → `test_passed=false` with descriptive reason.

## Blocked by

05-agent-profile-type-registry

## Notes

Codex skills live in `~/.codex/skills/` per Q20 / global CLAUDE.md rule. `defaultFlags` for codex should include any flags required for non-interactive / auto-approve mode (check codex CLI docs; do not hardcode without verification).
