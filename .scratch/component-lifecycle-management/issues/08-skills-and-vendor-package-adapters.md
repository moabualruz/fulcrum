# 08 — Skills and vendor package adapters

Status: done
Risk tier: high
Dependencies: component-lifecycle-management/05, component-lifecycle-management/06, component-lifecycle-management/07
File ownership:
- `src/components/adapters/vendor.ts`
- `src/components/adapters/vendor.test.ts`
- `src/cli/skills.ts`
- `src/cli/upstream-skills.ts`
- `src/cli/vendor-packages.ts`
- `src/cli/repomix-package.ts`
- `src/cli/install.ts`
- `src/cli/uninstall.ts`

Acceptance criteria:
- `classifyVendorComponent` maps every supported component id to its handler family.
- Repomix package install runs Claude plugin commands and mirrors non-Claude surfaces (skills, MCP, commands, agents).
- Cloudflare package uses Claude plugin and mirrors only Cloudflare upstream skills to non-Claude agents.
- Superpowers package mirrors Codex and falls back to a Pi mirror when `pi` binary is absent.
- Caveman package preserves Claude/Gemini native install, mirrors Codex/OpenCode/Pi from the official repo.
- Authored skills and upstream skills are addressable as `skills.authored` and `skills.upstream` components.
- `vendor_canonical_agents` skip behavior is preserved for upstream sync.

## Comments
- Shipped via `deb720b feat(component): add skill lifecycle helpers`, `9795707 feat(component): add package lifecycle helpers`, `39e8a3f`, `adf9cac`, `13705b9`, `dcbb9bf`, `3d0dda3 feat(component): mirror package surfaces`.
