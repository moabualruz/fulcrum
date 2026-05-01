---
Status: completed
Triage: AFK
Pillar: 01-foundation-reset
Blocked-by: 09-auth-trpc-procedures-and-org-management, 08-binary-entrypoint-scaffold
---

# CLI auth + flags verbs — `fulcrum auth *` and `fulcrum flags *`

## Parent
PRD: `.scratch/agent-os-vision/prds/01-foundation-reset.md`

## What to build
Implement the CLI layer for auth and flags subcommands via in-process tRPC calls (no HTTP round-trip). CLI handlers share the same root needle-di `Container` instantiated by the binary entrypoint, so repository calls + flag-registry caches are reused across commands.

**`src/cli/auth.ts`:**
- `fulcrum auth whoami [--json]` — calls `auth.whoami` in-process; prints email + org + role.
- `fulcrum auth login [--passkey | --password] [--non-interactive]` — interactive prompts or flag-driven; calls Better-Auth session create; persists session token to `FULCRUM_HOME/session.json`.
- `fulcrum auth logout` — invalidates session via Better-Auth; clears `session.json`.
- `fulcrum auth invite <email> [--role member|admin|guest]` — calls `auth.invite`; prints token.

**`src/cli/flags.ts`:**
- `fulcrum flags list [--json]` — calls `flags.list`; pretty-print table or JSON.
- `fulcrum flags set <flag> <on|off>` — calls `flags.set`; prints confirmation.

All commands: `--json` outputs machine-readable JSON to stdout; non-JSON outputs human-readable text. Exit 0 on success; non-zero on error with stderr message.

Cuts through: CLI entry (`src/index.ts`) → `src/cli/auth.ts` / `src/cli/flags.ts` (handlers resolve services from the shared needle-di container) → in-process tRPC call → repository calls → stdout assertion tests.

## Acceptance criteria
- [ ] Schema: no new migration classes.
- [ ] Server action / tRPC: commands call procedures in-process (no HTTP socket needed); shared container resolves `EntityManager` + `FlagRegistry`.
- [ ] Web surface: N/A.
- [ ] CLI command: `fulcrum auth whoami --json` returns `{ userId, orgId, email, role }` JSON. `fulcrum auth invite test@example.com --role member` prints invitation token. `fulcrum flags list --json` returns array of `{ name, enabled, description }`. `fulcrum flags set router-llm on` then `fulcrum flags list --json` shows `router-llm` as `enabled: true`. All commands exit 0 on success.
- [ ] TUI screen: N/A.
- [ ] Tests: `tests/cli/auth.test.ts` — spawn `fulcrum auth whoami --json`, parse JSON, assert `email === 'admin@local'`. `tests/cli/flags.test.ts` — `set router-llm on` then `list --json` assert updated. `tests/cli/auth-invite.test.ts` — invite, capture token, acceptInvite via tRPC, assert new `OrgMember` row via `orgMemberRepo.findOne`. RED → GREEN.

## Blocked by
- `09-auth-trpc-procedures-and-org-management` (needs auth + flags tRPC procedures).
- `08-binary-entrypoint-scaffold` (CLI verbs registered on the binary dispatcher; needle-di container initialized).

## Notes
Per Q-cli-shape: auto-codegen from tRPC schema is the long-term goal but for this pillar hand-roll the CLI wrappers — codegen tooling lives in a later pillar. `--non-interactive` on `auth login` is required for CI/scripting scenarios.
