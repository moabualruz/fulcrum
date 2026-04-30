# 02 — Targeted Claude settings.json patcher with provenance

Status: ready-for-agent
Risk tier: medium
Severity: high
Source findings: A2
Dependencies: 01
File ownership:
- `src/cli/uninstall.ts`
- `src/cli/uninstall.test.ts`
- `src/cli/install.ts`
- `src/cli/install.test.ts`

Acceptance criteria:
- Replace `cleanupClaudeManagedPluginSettings` whole-file rewrites with a patcher that only edits `extraKnownMarketplaces` / `enabledPlugins` keys whose values were recorded in a Fulcrum marker.
- Never delete a parent container in `~/.claude/settings.json`. Leave empty containers in place; a separate `--purge-empty-claude-containers` flag (off by default) is the only path that may prune them, and only when a Fulcrum-created-file marker for the whole settings file exists.
- New tests cover: removing a Fulcrum-tracked marketplace leaves user-added marketplaces in place; removing a Fulcrum-tracked enabled plugin preserves user keys; absence of a Fulcrum marker means the patcher is a no-op.
- `bun run ci` is green.
