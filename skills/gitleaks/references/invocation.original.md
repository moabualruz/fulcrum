## Invocation

```bash
# Full git history scan (default, run from repo root)
gitleaks git --no-banner                  # scan commit history (replaces deprecated `detect`)

# Pre-commit / pre-push: only what's staged
gitleaks git --staged --no-banner

# Non-git directory (tarball, vendored snapshot)
gitleaks dir ./extracted --no-banner

# Machine-readable output for piping or CI
gitleaks git --report-format json --report-path leaks.json --no-banner --redact

# SARIF for GitHub Code Scanning
gitleaks git --report-format sarif --report-path gitleaks.sarif --no-banner
```

Exit codes: `0` clean, `1` leaks found, anything else is a tool error. Wire hooks and CI on `1` exactly — don't `|| true`.
