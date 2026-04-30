# 07 — Refactor Repomix package onto manifest/mirror/parity (Wave C1)

Status: done
Risk tier: high
Dependencies: plugin-extension-surface-parity/04..06
File ownership:
- `src/cli/repomix-package.ts`
- `src/cli/repomix-package.test.ts`
- `src/cli/mirror-policy.test.ts`

Acceptance criteria:
- Repomix install runs Claude plugin commands and mirrors non-Claude surfaces using the manifest layer.
- OpenCode/Pi missing surfaces are repaired (skills, MCP, commands, agent, rules/context, metadata).
- Codex/Gemini full mirrors are preserved.
- Pi explorer-agent unsupported reason is recorded explicitly.

## Comments
- Shipped in `890e30d fix(repomix): mirror full package surfaces`.
