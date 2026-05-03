---
Status: implemented
Triage: AFK
Pillar: 04-sandcastle-wrapper
Blocked-by: 05-agent-profile-type-registry
---

# pi, copilot, opencode, gemini-cli agent profiles

## Parent: PRD `prds/04-sandcastle-wrapper.md`

## What to build (end-to-end)

Implement four remaining agent profile files: `pi`, `copilot`, `opencode`, `gemini-cli`. Register all in the registry. The registry integration test must load all six profiles at startup without error. Each profile gets a `fulcrum agents test <name>` path (binary + auth var check). A single registry startup test verifies all six load and validate against the Zod schema.

## Acceptance criteria

- [ ] Adapter / profile: `src/agents/profiles/pi.ts` — `name: 'pi'`, `cliPath: 'pi'`, `skillFolder: '~/.pi/agent/skills'`, `authEnvVars` per pi CLI docs, `sandcastleProvider: 'noSandbox'`.
- [ ] Adapter / profile: `src/agents/profiles/copilot.ts` — `name: 'copilot'`, `cliPath: 'gh copilot'` or standalone binary, `authEnvVars: ['GITHUB_TOKEN']` (or equivalent), `sandcastleProvider: 'noSandbox'`.
- [ ] Adapter / profile: `src/agents/profiles/opencode.ts` — `name: 'opencode'`, `cliPath: 'opencode'`, `skillFolder: '~/.config/opencode/skills'`, appropriate `authEnvVars`, `sandcastleProvider: 'noSandbox'`.
- [ ] Adapter / profile: `src/agents/profiles/gemini-cli.ts` — `name: 'gemini-cli'`, `cliPath: 'gemini'`, `skillFolder: '~/.gemini/extensions/<ext>/skills'`, `authEnvVars: ['GEMINI_API_KEY']` (or equivalent), `sandcastleProvider: 'noSandbox'`.
- [ ] Lifecycle integration: all six profiles loadable by registry at startup; `listProfiles()` returns all six.
- [ ] Surfaces parity: `fulcrum agents list --json` returns all six profiles; `fulcrum agents test <name>` works for all four new profiles.
- [ ] Tests: registry integration test loads all six profiles; Zod validation passes for each; test for each `test` command path (binary found / missing).

## Blocked by

05-agent-profile-type-registry

## Notes

Auth var names and skill folder paths should be verified against each CLI's actual documentation before hardcoding — do not guess. For profiles where the binary probe command is not `--version`, find the appropriate no-op flag. gemini-cli `skillFolder` uses a per-extension path pattern; use a configurable placeholder that can be overridden per-org in `agent_profiles` DB row.
