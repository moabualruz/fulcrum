# 02 — Parity expectations on existing package tests (Wave A2)

Status: done
Risk tier: medium
Dependencies: plugin-extension-surface-parity/01
File ownership:
- `src/cli/repomix-package.test.ts`
- `src/cli/vendor-packages.test.ts`
- `src/cli/install.test.ts`
- `src/cli/uninstall.test.ts`
- `src/cli/mirror-policy.test.ts`

Acceptance criteria:
- OpenCode/Pi Repomix mirrors include skills, MCP, explorer agent, commands, rules/context, metadata or unsupported reasons.
- Codex Superpowers mirror is full (skills/commands/agents/hooks/metadata/assets), not skills-only.
- Pi Superpowers fallback is full, not skills-only.
- Cloudflare non-Claude mirrors include all supported official surfaces.
- Caveman non-native mirrors include all supported official surfaces.

## Comments
- Shipped via the parity series.
