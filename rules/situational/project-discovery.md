# Project discovery rules

Read when you are about to suggest commands, install dependencies, run tests, or edit a repository you have not inspected yet.

## Precedence

- Project files beat global defaults.
- Read `AGENTS.md`, `CLAUDE.md`, `justfile`, `.mise.toml`, `.tool-versions`, `.envrc`, `pyproject.toml`, and `package.json` when they exist.
- Use the configured runner, linter, formatter, package manager, and environment tool instead of generic defaults.

## Runners and environment

- If a `justfile` exists, use `just <recipe>` rather than guessing package scripts.
- If `.mise.toml` or `.tool-versions` exists, use the pinned toolchain.
- If `.envrc` exists, allow or load the project environment instead of exporting drifted variables by hand.
- Check current docs, versions, release notes, and API behavior with live lookup when the fact may have changed.

## Planning existing codebases

Plans for existing code must include:

- Integration points by exact path.
- Files and APIs that must not break.
- Data flow across touched components.
- Cross-phase dependencies.
- Verification commands from project config.
