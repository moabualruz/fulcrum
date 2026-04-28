---
name: gitleaks
description: Use this skill whenever the user wants to find secrets, credentials, API keys, tokens, or passwords accidentally committed to a repository or sitting in a working tree. Trigger phrases include "scan for secrets", "check git history for leaked credentials", "audit a repo for accidentally committed API keys", "pre-commit secret scan", "find tokens or passwords in source", "look for leaked AWS/GitHub keys before pushing", "block commits that contain secrets", "scan a directory for credentials". Reach for this over ad-hoc `grep -E 'AKIA|ghp_'` sweeps, hand-rolled entropy scripts, or manual `git log -p | grep` — the rule pack already covers AWS, GCP, Azure, GitHub, Slack, Stripe, private keys, and ~150 other patterns. Skip for SAST / SQL-injection / memory-safety scans (use `semgrep`), dependency CVE audits (use `osv-scanner`, `npm audit`), and runtime secret leaks in logs (different problem).
---

# gitleaks

## When to use

- User ask scan repo for committed secrets — keys, tokens, passwords, private keys.
- User want pre-commit / pre-push gate block staged credentials.
- User prep repo for open-source, audit history (not just HEAD) for leaks.
- User want CI fail when PR introduce credential pattern.
- User have non-git directory (tarball, vendored snapshot), want same rule pack.

**Skip** for: code-quality / SAST scans (use `semgrep`); dependency vulns (use `osv-scanner`, `npm audit`, `pip-audit`); license checks; secrets already escaped to runtime logs (rotate first, audit upstream); generic `grep` for one known string.

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

Exit codes: `0` clean, `1` leaks found, else tool error. Wire hooks + CI on `1` exact — no `|| true`.

## Patterns

### Pattern A — `git` (history) vs `git --staged` (pre-commit)

`gitleaks git` scan **commit history** (already in graph). `gitleaks git --staged` scan **staged diff** only — no history. Use `git --staged` for pre-commit hooks (fast, scoped); use `git` for CI on PRs and periodic audits. Only `--staged` and never full scan miss anything already merged — including leaks hook once let through. (Note: `detect` and `protect` deprecated aliases since v8.19.0 — old docs may mention; both work but hidden in `--help`.)

```bash
gitleaks git --no-banner                           # all of history
gitleaks git --staged --no-banner                  # pre-commit
```

### Pattern B — scope the history scan

Full-history scans slow on old repos. `-l/--log-opts` accept any `git log` flag set:

```bash
gitleaks git --log-opts="--all --since=2025-01-01" --no-banner
gitleaks git --log-opts="main..HEAD" --no-banner        # PR diff only
gitleaks git --log-opts="<sha1>..<sha2>" --no-banner    # CI: just this push
```

### Pattern C — JSON / SARIF / JUnit reporting

```bash
gitleaks git --report-format json   --report-path leaks.json   --no-banner
gitleaks git --report-format sarif  --report-path gitleaks.sarif --no-banner
gitleaks git --report-format junit  --report-path gitleaks.xml  --no-banner
gitleaks git --report-format csv    --report-path leaks.csv    --no-banner
```

JSON pipe clean into `jq` (`jq '.[] | {file: .File, rule: .RuleID, commit: .Commit}' leaks.json`). SARIF upload to GitHub Code Scanning via `github/codeql-action/upload-sarif`. JUnit let Jenkins/GitLab render findings as test failures.

### Pattern D — baseline known-and-accepted leaks

Some leaks intentional fixtures (test keys, expired tokens). Snapshot once, ignore on next runs:

```bash
# Generate baseline once, review carefully, commit
gitleaks git --report-format json --report-path .gitleaks-baseline.json --no-banner

# Subsequent runs ignore anything in the baseline
gitleaks git --baseline-path .gitleaks-baseline.json --no-banner
```

Re-gen baseline when fixtures change. Review every entry before commit — baseline is security artifact.

### Pattern E — `.gitleaks.toml` config

Default rules cover most providers. Extend with allowlists + custom rules:

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

Run with `--config .gitleaks.toml` if not at repo root, or `gitleaks` find auto when beside `.git/`.

### Pattern F — pre-commit hook

```bash
# .git/hooks/pre-commit  (or via the `pre-commit` framework)
#!/usr/bin/env bash
gitleaks git --staged --redact --no-banner || {
  echo "gitleaks: secret detected in staged changes — abort." >&2
  exit 1
}
```

Use `--redact` in hook so leaked value not echo into terminal scrollback. When *fixing* leak, re-run without `--redact` to see exact value to rotate.

### Pattern G — performance and CI ergonomics

```bash
gitleaks git --max-target-megabytes 50 --no-banner      # skip huge blobs
gitleaks git --no-color --no-banner                     # plain text for logs
gitleaks git ./services/api --no-banner                 # subtree only (path is positional)
```

Monorepos: scope by passing subtree path positional per service, run jobs parallel. `--max-target-megabytes` skip large vendored blobs that else dominate runtime.

## Anti-patterns

- **Don't** scan only with `--staged` and call done. `gitleaks git --staged` no see history; leak landed before hook existed invisible until run `gitleaks git` on full repo. Schedule full-history scan in CI on cron, not just PRs.
- **Don't use `gitleaks detect` / `gitleaks protect` on new code.** Both deprecated in gitleaks v8.19.0 (work but hidden in `--help`). Use `gitleaks git` (history) and `gitleaks git --staged` (working tree).
- **Don't** silently `--redact` everywhere. CI logs benefit redaction, but when remediating need literal value to grep, rotate, confirm. Run unredacted local during cleanup.
- **Don't** allowlist by full secret value. `regexes = ['''ghp_aBcD…the actual key''']` wrong moment someone rotate key — and rotation exactly when can't afford noisy false negative. Allowlist by **shape** (path, rule id, fixture-prefix regex), not literal value.
- **Don't** assume "leak found" = "leak in HEAD". Git history forever. Removing line in new commit do **not** purge blob — need `git-filter-repo` (or BFG), force-push, then **rotate credential** because anyone who cloned still has it.
- **Don't** ignore exit code 1 with `|| true` to make CI green. That entire point of tool. Fixture → allowlist; real → rotate and remediate.
- **Don't** treat low-entropy strings as auto safe. Many real keys have structure, not randomness — `AKIA…` (AWS access key) 20 chars base32 fixed prefix, not high-entropy noise. Keyword + regex matter as much as Shannon entropy.
- **Don't** reach for `git-secrets` or `trufflehog` first in 2025-2026. `git-secrets` unmaintained; `trufflehog` heavier (verify live keys against provider APIs — useful, but slower and network-dependent). `gitleaks` modern default for fast offline rule-based scanning. Reach for `trufflehog` when specifically want validation against issuing provider.

## Cross-refs

- Behavioral rule: see `rules/AGENTS.md` — security section, "scan before push, scan in CI, never bypass exit code 1".
- Hook recipe: `docs/hooks.md` §5.5 — wiring `gitleaks protect --staged` as pre-commit guard.
- Companion tools: `semgrep` (SAST), `osv-scanner` (deps), `trufflehog` (live-key validation).
- Upstream: <https://github.com/gitleaks/gitleaks>
- Config reference: <https://github.com/gitleaks/gitleaks/blob/master/config/gitleaks.toml>