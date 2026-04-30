# 11 — MCP install/setup/enable/disable semantics (Wave D1)

Status: done
Risk tier: high
Dependencies: plugin-extension-surface-parity/03
File ownership:
- `src/cli/mcp-registry.ts`
- `src/cli/mcp-registry.test.ts`
- `src/cli/mcp-cmd.ts`
- `src/cli/mcp-cmd.test.ts`
- `src/components/adapters/mcp.ts`
- `src/components/adapters/mcp.test.ts`

Acceptance criteria:
- Install writes disabled native config on Codex/Gemini/OpenCode for registry-owned MCPs.
- `mcp disable` preserves disabled native config where supported.
- `component disable mcp.<name>` preserves disabled native config where supported.
- Claude/Pi report `disabledConfigUnsupported`.
- Package-owned MCPs are not removed/disabled by generic ops.

## Comments
- Shipped via parity series and `62255fb fix(install): harden package mirrors and mcp config`.
