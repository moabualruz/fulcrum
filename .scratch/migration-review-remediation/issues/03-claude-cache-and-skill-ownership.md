# 03 — Marker-gate vendor cache/skill removals across agents

Status: ready-for-agent
Risk tier: medium
Severity: high
Source findings: A3, A6, A7
Dependencies: 01
File ownership:
- `src/cli/repomix-package.ts`
- `src/cli/vendor-packages.ts`
- `src/cli/upstream-skills.ts`
- `src/cli/uninstall.ts`
- `src/cli/repomix-package.test.ts`
- `src/cli/vendor-packages.test.ts`
- `src/cli/upstream-skills.test.ts`

Acceptance criteria:
- Before removing any top-level skill/command/cache directory under `~/.claude`, `~/.codex`, `~/.config/opencode`, `~/.gemini`, or `~/.pi/agent`, the code reads a per-path Fulcrum marker. No marker → skip with a conflict report; do not back up to a Fulcrum dir without explicit consent.
- Before writing a top-level skill/command path, check for an existing path without a Fulcrum marker; if present, skip and log a conflict report instead of overwriting.
- Use namespaced paths (`<root>/skills/fulcrum/<name>/`) where the agent supports them; only fall back to top-level names when the agent loader cannot read the namespaced layout.
- Tests cover: install skips an unmarked top-level conflict; uninstall preserves an unmarked path that happens to share a name; install + uninstall round-trip restores the directory state byte-for-byte.
- `bun run ci` is green.
