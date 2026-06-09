# Git, quality, and security rules

Read when changing files, reviewing diffs, committing, touching auth or config, or making claims about completion.

## Git and diffs

- Inspect status and diffs before claiming work is complete.
- Use syntax-aware diff tools when available for non-trivial code review.
- Use conventional commits: `type(scope): subject` with `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `perf`, `build`, or `ci`.
- Never amend or force-push shared history without explicit same-turn approval.

## Quality gates

- Run the project lint, test, typecheck, build, or smoke command before saying done.
- If a full suite is too expensive, run the targeted gate that covers the change and state what was not run.
- Trust but verify subagent output. Check files, diffs, and tests yourself before reporting success.

## Security gates

- Run secret scanning before committing changes that touch env files, config, CI, auth, credentials, or dependency setup.
- Run security scanning when changes touch auth, deserialization, SQL, shell execution, SSRF surfaces, or untrusted input.
- Redact secrets in summaries and notes. Never preserve API keys, tokens, passwords, private keys, or connection strings.
