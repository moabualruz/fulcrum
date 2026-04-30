# 03 — Disabled MCP semantic tests (Wave A3)

Status: done
Risk tier: medium
Dependencies: plugin-extension-surface-parity/01
File ownership:
- `src/cli/mcp-registry.test.ts`
- `src/cli/mcp-cmd.test.ts`
- `src/components/adapters/mcp.test.ts`

Acceptance criteria:
- `fulcrum install --no-default-mcps` writes disabled native config on Codex/Gemini/OpenCode.
- `fulcrum mcp disable <name>` preserves disabled native config on Codex/Gemini/OpenCode.
- `fulcrum component disable mcp.<name>` preserves disabled native config on supported agents.
- Claude/Pi report `disabledConfigUnsupported`.

## Comments
- Shipped via the parity series.
