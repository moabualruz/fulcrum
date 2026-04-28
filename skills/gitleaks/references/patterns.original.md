## Patterns

### Pattern A — `git` (history) vs `git --staged` (pre-commit)

`gitleaks git` scans **commit history** (what's already in the graph). `gitleaks git --staged` scans the **staged diff** only — it cannot see history. Use `git --staged` for pre-commit hooks (fast, scoped to the diff); use `git` for CI on PRs and for periodic audits. Running only `--staged` and never the full history scan will miss anything already merged — including leaks the hook itself once let through. (Note: `detect` and `protect` are deprecated aliases since v8.19.0 — older docs may still mention them; both still work but are hidden in `--help`.)

```bash
gitleaks git --no-banner                           # all of history
gitleaks git --staged --no-banner                  # pre-commit
```

### Pattern B — scope the history scan

Full-history scans get slow on old repos. `-l/--log-opts` accepts any `git log` flag set:

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

JSON pipes cleanly into `jq` (`jq '.[] | {file: .File, rule: .RuleID, commit: .Commit}' leaks.json`). SARIF uploads to GitHub Code Scanning via `github/codeql-action/upload-sarif`. JUnit lets Jenkins/GitLab render findings as test failures.

### Pattern D — baseline known-and-accepted leaks

Some leaks are intentional fixtures (test keys, expired tokens). Snapshot them once, then ignore on subsequent runs:

```bash
# Generate baseline once, review carefully, commit
gitleaks git --report-format json --report-path .gitleaks-baseline.json --no-banner

# Subsequent runs ignore anything in the baseline
gitleaks git --baseline-path .gitleaks-baseline.json --no-banner
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
gitleaks git --staged --redact --no-banner || {
  echo "gitleaks: secret detected in staged changes — abort." >&2
  exit 1
}
```

Use `--redact` in the hook so the leaked value isn't echoed into terminal scrollback. When *fixing* a leak, re-run without `--redact` so you can see exactly what to rotate.

### Pattern G — performance and CI ergonomics

```bash
gitleaks git --max-target-megabytes 50 --no-banner      # skip huge blobs
gitleaks git --no-color --no-banner                     # plain text for logs
gitleaks git ./services/api --no-banner                 # subtree only (path is positional)
```

For monorepos, scope by passing the subtree path positionally per service and run jobs in parallel. `--max-target-megabytes` skips large vendored blobs that would otherwise dominate runtime.
