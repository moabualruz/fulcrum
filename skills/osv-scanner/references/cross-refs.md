## Cross-refs

- Behavioral rule: see `rules/AGENTS.md` — security section, "audit deps every PR, treat exit code 1 as a hard fail, time-box every ignore".
- Companion tools: `gitleaks` (sibling — secrets), `semgrep` (SAST), `trivy` / `syft`+`grype` (container filesystem + OS packages), `npm audit` / `cargo audit` (per-ecosystem fallbacks).
- Upstream: <https://osv.dev/> (the database) and <https://google.github.io/osv-scanner/> (the tool).
- GitHub Action wrapper for PR-diff filtering: <https://github.com/google/osv-scanner-action>.
