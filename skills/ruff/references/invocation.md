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
