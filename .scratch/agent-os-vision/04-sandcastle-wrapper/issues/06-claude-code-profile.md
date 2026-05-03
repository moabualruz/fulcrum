---
Status: implemented
Triage: AFK
Pillar: 04-sandcastle-wrapper
Blocked-by: 05-agent-profile-type-registry
---

# claude-code agent profile + fulcrum agents test claude-code

## Parent: PRD `prds/04-sandcastle-wrapper.md`

## What to build (end-to-end)

Implement the `claude-code` agent profile file at `src/agents/profiles/claude-code.ts`. Register it in the registry. Wire `fulcrum agents test claude-code` to spawn `claude --version`, assert exit 0, verify `ANTHROPIC_API_KEY` is set, write result to `agent_profiles` DB row. The full path — profile definition → registry load → `test` command → DB write — must work end-to-end.

## Acceptance criteria

- [ ] Adapter / profile: `src/agents/profiles/claude-code.ts` exports `AgentProfile` with `name: 'claude-code'`, correct `cliPath` (`claude`), `defaultFlags` (e.g. `['--dangerously-skip-permissions']` or equivalent), `skillFolder` (`~/.claude/skills`), `authEnvVars: ['ANTHROPIC_API_KEY']`, `sandcastleProvider: 'noSandbox'`, `maxIterations: 10`, `defaultTimeout: 600000`.
- [ ] Lifecycle integration: profile loaded by registry at startup; `getProfile('claude-code')` returns the profile.
- [ ] Lifecycle integration: `fulcrum agents test claude-code` spawns `claude --version` → asserts exit 0 → checks `ANTHROPIC_API_KEY` env → writes `last_tested_at` + `test_passed` to DB.
- [ ] Surfaces parity: `fulcrum agents test claude-code --json` outputs `{name, passed, reason?, testedAt}` JSON; doctor check also verifies claude-code binary + auth var.
- [ ] Tests: integration test with mock process spawn — binary found + auth var set → `test_passed=true`; binary missing → `test_passed=false` + non-zero exit; `--json` output is valid JSON matching schema.

## Blocked by

05-agent-profile-type-registry

## Notes

`claude --version` is the probe command. If the binary is not on PATH, test fails with a clear message including the expected binary name. `ANTHROPIC_API_KEY` presence (not validity) is the auth check — no live API call in `agents test`. Session resumption for this profile (gated `FULCRUM_FEATURES=session-resume`) is handled in slice 13.
