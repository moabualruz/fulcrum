## Invocation

```bash
# One-time config bootstrap
biome init                                    # writes biome.json with sensible defaults

# Combined lint + format (the entry point most agents want)
biome check path/...                          # report only — no mutation
biome check --write path/...                  # apply safe lint fixes + format
biome check --write --unsafe path/...         # also apply unsafe lint fixes
biome check --staged                          # only files staged in git (pre-commit)
biome check --changed                         # only files changed vs the VCS base

# Format only
biome format path/...                         # PRINTS to stdout — does NOT mutate
biome format --write path/...                 # mutate in place

# Lint only
biome lint path/...                           # report
biome lint --write path/...                   # apply safe fixes

# CI mode — never mutates, exits non-zero on any diagnostic
biome ci path/...

# Migrate from prettier / eslint
biome migrate prettier                        # reads .prettierrc(.json|.js|…)
biome migrate eslint                          # reads .eslintrc / eslint.config.js
biome migrate --write                         # update biome.json instead of printing diff

# JSON output for piping to jq
biome check --reporter=json path/... | jq '.diagnostics[] | .description'
biome ci --reporter=github                    # GitHub Actions annotations
```

`biome` walks up from the target path looking for `biome.json` or `biome.jsonc`. Without a config it falls back to defaults (still useful for one-shot formatting).
