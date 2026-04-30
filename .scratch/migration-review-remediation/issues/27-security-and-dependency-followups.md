# 27 — Security and dependency follow-ups

Status: ready-for-agent
Risk tier: low
Dependencies: 14
Source: `.scratch/claude-migration-review/REPORT.md` S1, S2, S3
File ownership:
- `evals/gitleaks.json`
- `src/cli/install.ts`
- `src/cli/uninstall.ts`
- `src/cli/mcp-registry.ts`
- `src/cli/repomix-package.ts`
- `src/web/package.json`
- `src/web/bun.lock`

Acceptance criteria:
- `evals/gitleaks.json:3` is reviewed; if it is a fixture, add an explicit gitleaks allowlist entry referencing the fixture context.
- Semgrep "non-literal regexp" findings get either a justification comment (`// nosemgrep: ...`) or a refactor to a literal/anchored regex.
- `cookie@0.6.0` low advisory: bump SvelteKit transitive (`bun update` in `src/web`) or add a tracking note in `docs/product-kernel.md`.
- Documented in commit body which findings are accepted vs fixed.
