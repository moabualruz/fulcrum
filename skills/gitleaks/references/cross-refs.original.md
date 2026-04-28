## Cross-refs

- Behavioral rule: see `rules/AGENTS.md` — security section, "scan before push, scan in CI, never bypass exit code 1".
- Hook recipe: `docs/hooks.md` §5.5 — wiring `gitleaks protect --staged` as a pre-commit guard.
- Companion tools: `semgrep` (SAST), `osv-scanner` (deps), `trufflehog` (live-key validation).
- Upstream: <https://github.com/gitleaks/gitleaks>
- Config reference: <https://github.com/gitleaks/gitleaks/blob/master/config/gitleaks.toml>
