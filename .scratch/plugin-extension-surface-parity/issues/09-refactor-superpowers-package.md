# 09 — Refactor Superpowers package (Wave C3)

Status: done
Risk tier: high
Dependencies: plugin-extension-surface-parity/06
File ownership:
- `src/cli/vendor-packages.ts`
- `src/cli/vendor-packages.test.ts`
- `src/cli/upstream-skills.ts`
- `src/cli/upstream-skills.test.ts`

Acceptance criteria:
- Native Claude/Gemini/OpenCode/Pi installs preserved.
- Codex full package mirror (skills/commands/agents/hooks/metadata/assets) shipped.
- Pi fallback is a full package mirror when `pi` binary is unavailable.
- `vendor_canonical_agents` skip behavior remains intact for skill-only upstream sync.

## Comments
- Shipped via parity series.
