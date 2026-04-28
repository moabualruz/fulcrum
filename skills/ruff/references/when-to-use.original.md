## When to use

- The user wants to lint Python — find unused imports, undefined names, style violations, security issues, complexity warnings — that's `ruff check`.
- The user wants to format Python — reflow code, normalize quotes, fix indentation, sort imports — that's `ruff format` (and `ruff check --select I --fix` for imports).
- The user mentions black, flake8, isort, pyupgrade, pylint, or bandit — ruff is the modern single-binary replacement for all six (with caveats for pylint/bandit coverage).
- The user wants a CI gate that fails on style drift — `ruff check` and `ruff format --check` both exit non-zero on findings.
- The agent is about to write or modify a `.py` file and should leave it lint-clean and formatted.

**Skip** for: non-Python files (`.js`/`.ts` → biome, `.go` → gofmt, `.rs` → rustfmt, `.yaml` → prettier/yamlfmt); type checking (mypy, pyright, pyre); runtime test failures (pytest); dependency vulnerability scans (use `pip-audit` or `osv-scanner`); refactors that need semantic understanding (use `ast-grep` or an LSP).
