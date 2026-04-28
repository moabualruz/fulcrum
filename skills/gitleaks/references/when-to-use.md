## When to use

- The user asks to scan a repo for committed secrets — keys, tokens, passwords, private keys.
- The user wants a pre-commit / pre-push gate that blocks accidentally staged credentials.
- The user is preparing a repo for open-sourcing and needs to audit history (not just HEAD) for leaks.
- The user wants CI to fail when a PR introduces a credential pattern.
- The user has a non-git directory (a tarball, a vendored snapshot) and wants the same rule pack applied.

**Skip** for: code-quality / SAST scans (use `semgrep`); dependency vulnerabilities (use `osv-scanner`, `npm audit`, `pip-audit`); license checks; secrets that already escaped to runtime logs (rotate first, then audit upstream); generic `grep` for one specific known string.
