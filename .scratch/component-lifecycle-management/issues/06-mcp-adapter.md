# 06 — MCP adapter

Status: done
Risk tier: medium
Dependencies: component-lifecycle-management/05
File ownership:
- `src/components/adapters/mcp.ts`
- `src/components/adapters/mcp.test.ts`
- `src/cli/mcp-registry.ts`
- `src/cli/mcp-cmd.ts`

Acceptance criteria:
- MCP adapter dispatches `mcp-registry-entry` and `mcp-agent-config` actions through registry helpers.
- Disable preserves disabled native config on Codex/Gemini/OpenCode where supported.
- Disable on Claude/Pi reports `disabledConfigUnsupported`.
- Package-owned MCPs are not removed by generic registry/disable paths.

## Comments
- Shipped via the lifecycle foundation series and reinforced by `08b33d6 fix(packages): adapt mirrored skills and MCPs`.
