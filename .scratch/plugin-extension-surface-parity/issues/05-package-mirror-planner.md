# 05 — Per-agent package mirror planner (Wave B2)

Status: done
Risk tier: medium
Dependencies: plugin-extension-surface-parity/04
File ownership:
- `src/cli/package-mirror.ts`
- `src/cli/package-mirror.test.ts`

Acceptance criteria:
- Maps each `PackageSurface` to per-agent `AgentSurfaceTarget` for Claude/Codex/Gemini/OpenCode/Pi.
- Records `support: native | mirror | unsupported` and `unsupportedReason` where applicable.
- Honors per-agent target paths (Codex `~/.codex/skills/...`, Gemini `~/.gemini/extensions/...`, OpenCode `~/.config/opencode/...`, Pi `~/.pi/agent/...`).

## Comments
- Shipped via the parity series.
