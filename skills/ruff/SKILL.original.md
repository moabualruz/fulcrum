---
name: ruff
description: Use this skill whenever the user lints or formats Python code from the command line. ruff is a 2-in-1 tool — `ruff check` runs the linter (rules / fixes / import sort / security), and `ruff format` runs the formatter (Black-compatible style rewrites). They are distinct subcommands; agents commonly forget the formatter and try to "lint a file into shape" with `check` alone. Trigger phrases include "lint a Python file", "format Python code", "fix style issues in Python", "run python linter", "auto-fix imports in python", "check a python module for unused imports", "replacement for black + flake8 + isort", "reformat my python sources", "show me what ruff would change", "configure ruff in pyproject.toml". Skip for non-Python sources (JS → biome/prettier; Go → gofmt/golangci-lint; Rust → rustfmt/clippy), for type checking (use mypy/pyright), or for runtime errors (ruff is static-only).
---

# ruff

## When to use

- The user wants to lint Python — find unused imports, undefined names, style violations, security issues, complexity warnings — that's `ruff check`.
- The user wants to format Python — reflow code, normalize quotes, fix indentation, sort imports — that's `ruff format` (and `ruff check --select I --fix` for imports).
- The user mentions black, flake8, isort, pyupgrade, pylint, or bandit — ruff is the modern single-binary replacement for all six (with caveats for pylint/bandit coverage).
- The user wants a CI gate that fails on style drift — `ruff check` and `ruff format --check` both exit non-zero on findings.
- The agent is about to write or modify a `.py` file and should leave it lint-clean and formatted.

**Skip** for: non-Python files (`.js`/`.ts` → biome, `.go` → gofmt, `.rs` → rustfmt, `.yaml` → prettier/yamlfmt); type checking (mypy, pyright, pyre); runtime test failures (pytest); dependency vulnerability scans (use `pip-audit` or `osv-scanner`); refactors that need semantic understanding (use `ast-grep` or an LSP).

## Invocation

```bash
# Lint (read-only by default — exits non-zero on findings)
ruff check .                                    # lint cwd recursively
ruff check path/to/file.py                      # single file
ruff check --fix .                              # apply safe autofixes
ruff check --fix --unsafe-fixes .               # also apply semantic-changing fixes
ruff check --diff .                             # preview fixes without writing
ruff check --show-fixes .                       # explain every applied fix

# Format (mutates by default)
ruff format .                                   # reformat in place
ruff format --check .                           # CI mode: nonzero if reformat needed
ruff format --diff .                            # preview reformat without writing

# Rule selection (one-shot, overrides config)
ruff check --select F,E,I --ignore E501 .

# Output format for piping
ruff check --output-format=json . | jq '.[] | .code'
ruff check --output-format=github .             # GitHub Actions annotations
ruff check --output-format=sarif . > ruff.sarif

# Different config file / no cache
ruff check --config path/to/pyproject.toml .
ruff check --no-cache .
```

`ruff check` and `ruff format` are **separate subcommands** — running one does not run the other. A typical pre-commit pass is `ruff check --fix . && ruff format .`.

## Patterns

### Pattern A — lint with safe autofix

```bash
ruff check --fix .                              # apply safe fixes only
ruff check --fix --show-fixes .                 # log each fix (rule code + line)
```

Safe fixes don't change runtime behaviour (remove unused imports, sort imports, add trailing commas). Use this in pre-commit and editor-on-save.

### Pattern B — unsafe fixes (review the diff)

```bash
ruff check --fix --unsafe-fixes --diff .        # preview first
ruff check --fix --unsafe-fixes .               # then apply
```

Unsafe fixes can change semantics — e.g. rewriting `unittest` `assertEqual(a, b)` to `assert a == b`, or removing what looks like dead code. Always preview the diff before applying in CI or on a shared branch.

### Pattern C — format and format-check

```bash
ruff format .                                   # rewrite in place
ruff format --check .                           # CI: exit 1 if anything would change
ruff format --diff src/                         # show what would change
```

`ruff format` is Black-compatible by default. `--check` is the canonical CI invocation; pair with `ruff check` for full coverage.

### Pattern D — rule selection

```bash
# Enable only specific rule families
ruff check --select F,E,W,I .                   # Pyflakes + pycodestyle + isort

# Enable everything, ignore the noisy ones
ruff check --select ALL --ignore D,ANN,N,COM .

# Per-file ignore at the CLI
ruff check --per-file-ignores 'tests/*:S101,D' .
```

Rule families to know: `F` (Pyflakes — undefined names, unused imports), `E`/`W` (pycodestyle), `I` (isort), `B` (flake8-bugbear), `C90` (mccabe complexity), `N` (pep8-naming), `UP` (pyupgrade — modern syntax), `S` (bandit — security), `TID` (tidy-imports), `D` (pydocstyle), `ANN` (annotations), `RUF` (ruff-specific).

### Pattern E — pyproject.toml configuration

```toml
[tool.ruff]
line-length = 100
target-version = "py312"
extend-exclude = ["migrations", "vendor"]

[tool.ruff.lint]
select = ["F", "E", "W", "I", "B", "UP", "S", "RUF"]
ignore = ["E501", "S101"]                       # line length, asserts in tests
fixable = ["ALL"]
unfixable = ["F841"]                            # don't auto-remove unused locals

[tool.ruff.lint.per-file-ignores]
"tests/**" = ["S", "D"]                         # tests can use assert + skip docstrings
"__init__.py" = ["F401"]                        # re-exports

[tool.ruff.lint.isort]
known-first-party = ["mypkg"]

[tool.ruff.format]
quote-style = "double"
indent-style = "space"
docstring-code-format = true
```

`target-version` controls which `UP` (pyupgrade) rewrites apply — set it to your minimum supported Python.

### Pattern F — JSON output piped to jq

```bash
# Count findings by rule code
ruff check --output-format=json . | jq 'group_by(.code) | map({code: .[0].code, n: length}) | sort_by(-.n)'

# List files with at least one error
ruff check --output-format=json . | jq -r '.[].filename' | sort -u
```

`--output-format=json` returns a stable schema: `code`, `message`, `filename`, `location`, `fix`. Pair with the `jq` skill for any aggregation.

### Pattern G — pre-commit / CI shape

```bash
# Local pre-commit (fix what you can, then format)
ruff check --fix . && ruff format .

# CI gate (no mutation; both must pass)
ruff check . && ruff format --check .
```

Don't run with `--fix` in CI — the runner should fail on drift, not silently rewrite the tree.

## Anti-patterns

- **Don't keep `black`, `flake8`, or `isort` alongside ruff.** They duplicate work, fight each other on edge cases, and slow CI by 10x. Pick ruff and remove the others from `pyproject.toml` / `requirements-dev.txt` / pre-commit config.
- **Don't run `--select ALL` without `--ignore`.** `D` (docstrings), `ANN` (annotations), `N` (naming), `COM` (commas) will swamp output on any existing codebase. Start with `select = ["F", "E", "W", "I", "B", "UP", "RUF"]` and grow.
- **Don't apply `--unsafe-fixes` blindly in CI.** They can change semantics — `assertEqual` → bare `assert`, removed `pass` statements, rewritten exception handlers. Always `--diff` first and review.
- **Don't use `ruff check` and expect reformatting.** `check` runs lint rules and applies fixes for those rules; whitespace/quotes/line-wrapping live in `ruff format`. Run both.
- **Don't skip `--diff` on a destructive run.** Before `ruff check --fix --unsafe-fixes` or `ruff format` against a repo you don't own, preview with `--diff` and read the output.
- **Don't reach for ruff to type-check.** ruff is static, AST-level, and intentionally has no type system. Use mypy, pyright, or pyre for type errors. ruff complements them; it does not replace them.
- **Don't put `# noqa` everywhere to silence ruff.** Configure `per-file-ignores` in `pyproject.toml` instead — `# noqa` rots, configuration is reviewed.
- **Don't run `ruff check` against a virtualenv or `node_modules`.** Add them to `extend-exclude`; otherwise ruff will lint thousands of files in `.venv/lib/python3.12/site-packages/...`.

## Cross-refs

- Behavioral rule: see `rules/AGENTS.md` — "lint and format Python with ruff; never `black` + `flake8` separately".
- Hook recipe: `format` (in `docs/hooks.md`) is wired to run `ruff format` on `*.py` writes; `lint` runs `ruff check --fix`.
- JSON pipelines: `skills/jq/SKILL.md` — `ruff check --output-format=json | jq` is the canonical aggregation shape.
- Upstream docs: <https://docs.astral.sh/ruff/>
- Rules reference: <https://docs.astral.sh/ruff/rules/>
- Configuration: <https://docs.astral.sh/ruff/configuration/>
