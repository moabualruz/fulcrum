---
name: gitleaks
description: Use this skill whenever the user wants to find secrets, credentials, API keys, tokens, or passwords accidentally committed to a repository or sitting in a working tree. Trigger phrases include "scan for secrets", "check git history for leaked credentials", "audit a repo for accidentally committed API keys", "pre-commit secret scan", "find tokens or passwords in source", "look for leaked AWS/GitHub keys before pushing", "block commits that contain secrets", "scan a directory for credentials". Reach for this over ad-hoc `grep -E 'AKIA|ghp_'` sweeps, hand-rolled entropy scripts, or manual `git log -p | grep` — the rule pack already covers AWS, GCP, Azure, GitHub, Slack, Stripe, private keys, and ~150 other patterns. Skip for SAST / SQL-injection / memory-safety scans (use `semgrep`), dependency CVE audits (use `osv-scanner`, `npm audit`), and runtime secret leaks in logs (different problem).
---

# gitleaks

## When to use

- The user asks to scan a repo for committed secrets — keys, tokens, passwords, private keys.
- The user wants a pre-commit / pre-push gate that blocks accidentally staged credentials.
- The user is preparing a repo for open-sourcing and needs to audit history (not just HEAD) for leaks.
- The user wants CI to fail when a PR introduces a credential pattern.
- The user has a non-git directory (a tarball, a vendored snapshot) and wants the same rule pack applied.

**Skip** for: code-quality / SAST scans (use `semgrep`); dependency vulnerabilities (use `osv-scanner`, `npm audit`, `pip-audit`); license checks; secrets that already escaped to runtime logs (rotate first, then audit upstream); generic `grep` for one specific known string.

## Invocation

```bash
# Full git history scan (default, run from repo root)
gitleaks detect --no-banner

# Pre-commit / pre-push: only what's staged
gitleaks protect --staged --no-banner

# Non-git directory (tarball, vendored snapshot)
gitleaks dir ./extracted --no-banner

# Machine-readable output for piping or CI
gitleaks detect --report-format json --report-path leaks.json --no-banner --redact

# SARIF for GitHub Code Scanning
gitleaks detect --report-format sarif --report-path gitleaks.sarif --no-banner
```

Exit codes: `0` clean, `1` leaks found, anything else is a tool error. Wire hooks and CI on `1` exactly — don't `|| true`.

## Patterns

### Pattern A — `detect` vs `protect`

`detect` scans **commit history** (what's already in the graph). `protect` scans the **working tree** or **staged diff** only — it cannot see history. Use `protect --staged` for pre-commit hooks (fast, scoped to the diff); use `detect` for CI on PRs and for periodic audits. Running only `protect` and never `detect` will miss anything already merged — including leaks the hook itself once let through.

```bash
gitleaks detect --no-banner                        # all of history
gitleaks protect --staged --no-banner              # pre-commit
```

### Pattern B — scope the history scan

Full-history scans get slow on old repos. `-l/--log-opts` accepts any `git log` flag set:

```bash
gitleaks detect -l "--all --since=2025-01-01" --no-banner
gitleaks detect -l "main..HEAD" --no-banner        # PR diff only
gitleaks detect -l "<sha1>..<sha2>" --no-banner    # CI: just this push
```

### Pattern C — JSON / SARIF / JUnit reporting

```bash
gitleaks detect --report-format json   --report-path leaks.json   --no-banner
gitleaks detect --report-format sarif  --report-path gitleaks.sarif --no-banner
gitleaks detect --report-format junit  --report-path gitleaks.xml  --no-banner
gitleaks detect --report-format csv    --report-path leaks.csv    --no-banner
```

JSON pipes cleanly into `jq` (`jq '.[] | {file: .File, rule: .RuleID, commit: .Commit}' leaks.json`). SARIF uploads to GitHub Code Scanning via `github/codeql-action/upload-sarif`. JUnit lets Jenkins/GitLab render findings as test failures.

### Pattern D — baseline known-and-accepted leaks

Some leaks are intentional fixtures (test keys, expired tokens). Snapshot them once, then ignore on subsequent runs:

```bash
# Generate baseline once, review carefully, commit
gitleaks detect --report-format json --report-path .gitleaks-baseline.json --no-banner

# Subsequent runs ignore anything in the baseline
gitleaks detect --baseline-path .gitleaks-baseline.json --no-banner
```

Re-generate the baseline whenever fixtures change. Review every entry before committing the file — a baseline is a security artifact.

### Pattern E — `.gitleaks.toml` config

Default rules cover most providers. Extend with allowlists and custom rules:

```toml
# .gitleaks.toml
title = "Project rules"
[extend]
useDefault = true

[allowlist]
description = "Test fixtures and example tokens"
paths = [
  '''testdata/.*''',
  '''docs/examples/.*\.md''',
]
regexes = [
  '''AKIAIOSFODNN7EXAMPLE''',           # AWS docs example
  '''ghp_[A-Za-z0-9]{36}_FAKE_FIXTURE''',
]

[[rules]]
id = "internal-api-token"
description = "Acme internal API token"
regex = '''acme_(live|test)_[A-Za-z0-9]{32}'''
keywords = ["acme_live_", "acme_test_"]
entropy = 3.5
path = '''.*\.(go|ts|py)$'''
```

Run with `--config .gitleaks.toml` if not at repo root, or `gitleaks` finds it automatically when sitting beside `.git/`.

### Pattern F — pre-commit hook

```bash
# .git/hooks/pre-commit  (or via the `pre-commit` framework)
#!/usr/bin/env bash
gitleaks protect --staged --redact --no-banner || {
  echo "gitleaks: secret detected in staged changes — abort." >&2
  exit 1
}
```

Use `--redact` in the hook so the leaked value isn't echoed into terminal scrollback. When *fixing* a leak, re-run without `--redact` so you can see exactly what to rotate.

### Pattern G — performance and CI ergonomics

```bash
gitleaks detect --max-target-megabytes 50 --no-banner   # skip huge blobs
gitleaks detect --no-color --no-banner                  # plain text for logs
gitleaks detect --source ./services/api --no-banner     # subtree only
```

For monorepos, scope `--source` per service and run jobs in parallel. `--max-target-megabytes` skips large vendored blobs that would otherwise dominate runtime.

## Anti-patterns

- **Don't** scan only with `protect` and call it a day. `protect` cannot see history; a leak that landed before the hook existed is invisible until you run `detect`. Schedule `detect` in CI on a cron, not just on PRs.
- **Don't** silently `--redact` everywhere. CI logs benefit from redaction, but when you're remediating you need the literal value to grep, rotate, and confirm. Run unredacted locally during cleanup.
- **Don't** allowlist by full secret value. `regexes = ['''ghp_aBcD…the actual key''']` becomes wrong the moment someone rotates the key — and rotations are exactly when you can't afford a noisy false negative. Allowlist by **shape** (path, rule id, fixture-prefix regex), not literal value.
- **Don't** assume "leak found" = "leak in HEAD". Git history is forever. Removing the line in a new commit does **not** purge the blob — you need `git-filter-repo` (or BFG), force-push, then **rotate the credential** because anyone who cloned still has it.
- **Don't** ignore exit code 1 with `|| true` to make CI green. That's the entire point of the tool. If the finding is a fixture, allowlist it; if it's real, rotate and remediate.
- **Don't** treat low-entropy strings as automatically safe. Many real keys have structure, not randomness — `AKIA…` (AWS access key) is 20 chars of base32 with a fixed prefix, not high-entropy noise. Keyword + regex matters as much as Shannon entropy.
- **Don't** reach for `git-secrets` or `trufflehog` first in 2025-2026. `git-secrets` is unmaintained; `trufflehog` is heavier (verifies live keys against provider APIs — useful, but slower and network-dependent). `gitleaks` is the modern default for fast, offline rule-based scanning. Reach for `trufflehog` when you specifically want validation against the issuing provider.

## Cross-refs

- Behavioral rule: see `rules/AGENTS.md` — security section, "scan before push, scan in CI, never bypass exit code 1".
- Hook recipe: `docs/hooks.md` §5.5 — wiring `gitleaks protect --staged` as a pre-commit guard.
- Companion tools: `semgrep` (SAST), `osv-scanner` (deps), `trufflehog` (live-key validation).
- Upstream: <https://github.com/gitleaks/gitleaks>
- Config reference: <https://github.com/gitleaks/gitleaks/blob/master/config/gitleaks.toml>
