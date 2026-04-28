## Anti-patterns

- **Don't keep `black`, `flake8`, or `isort` alongside ruff.** They duplicate work, fight each other on edge cases, and slow CI by 10x. Pick ruff and remove the others from `pyproject.toml` / `requirements-dev.txt` / pre-commit config.
- **Don't run `--select ALL` without `--ignore`.** `D` (docstrings), `ANN` (annotations), `N` (naming), `COM` (commas) will swamp output on any existing codebase. Start with `select = ["F", "E", "W", "I", "B", "UP", "RUF"]` and grow.
- **Don't apply `--unsafe-fixes` blindly in CI.** They can change semantics — `assertEqual` → bare `assert`, removed `pass` statements, rewritten exception handlers. Always `--diff` first and review.
- **Don't use `ruff check` and expect reformatting.** `check` runs lint rules and applies fixes for those rules; whitespace/quotes/line-wrapping live in `ruff format`. Run both.
- **Don't skip `--diff` on a destructive run.** Before `ruff check --fix --unsafe-fixes` or `ruff format` against a repo you don't own, preview with `--diff` and read the output.
- **Don't reach for ruff to type-check.** ruff is static, AST-level, and intentionally has no type system. Use mypy, pyright, or pyre for type errors. ruff complements them; it does not replace them.
- **Don't put `# noqa` everywhere to silence ruff.** Configure `per-file-ignores` in `pyproject.toml` instead — `# noqa` rots, configuration is reviewed.
- **Don't run `ruff check` against a virtualenv or `node_modules`.** Add them to `extend-exclude`; otherwise ruff will lint thousands of files in `.venv/lib/python3.12/site-packages/...`.
