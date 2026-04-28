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
