# 22 — Targeted agent config patchers

Status: ready-for-agent
Risk tier: high
Dependencies: —
Source: `.scratch/claude-migration-review/REPORT.md` A2, A3, A5
File ownership:
- `src/cli/uninstall.ts`
- `src/cli/mcp-registry.ts`
- `src/cli/repomix-package.ts`
- `src/cli/vendor-packages.ts`
- `src/components/adapters/sentinel.ts`
- `src/components/adapters/files.ts`

## Comments
- Partial close: marker module from issue 21 now backs every Claude plugin install/uninstall. Cache/marketplace dirs in `removeCavemanCopies` are preserved when no marker exists. Remaining work — marker-aware `cleanupClaudeManagedPluginSettings` and per-agent JSON/TOML patchers for OpenCode/Pi/Gemini/Codex — stays `ready-for-agent` for a follow-up.

Acceptance criteria:
- `cleanupClaudeManagedPluginSettings` deletes only keys whose values match a recorded Fulcrum-owned value (cross-checked against `~/.fulcrum/state/global/claude-plugin-markers/`).
- Whole-file deletion of agent config is blocked unless a Fulcrum-created-file marker exists at the same path.
- `~/.claude/plugins/cache/<vendor>` and marketplace dirs are removed only when the per-plugin marker authorises that exact root.
- Tests cover: (a) settings file with mixed Fulcrum + user values — only Fulcrum values removed; (b) settings file unknown to Fulcrum — left untouched.
