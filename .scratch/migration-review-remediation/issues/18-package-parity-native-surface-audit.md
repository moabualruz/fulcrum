# 18 — Package parity native surface audit

Status: ready-for-agent
Risk tier: medium
Dependencies: —
Source: `.scratch/claude-migration-review/REPORT.md` C8
File ownership:
- `src/cli/package-parity.ts`
- `src/cli/package-parity.test.ts`

Acceptance criteria:
- Native surfaces are counted "installed" only when the underlying file/config exists, not when a parent root exists.
- `mcpManifestConfigured` returns true only when a real source file is present and the corresponding native MCP config entry exists.
- Test coverage for the "root exists but child missing" and "fallback manifest with no real source" cases.
