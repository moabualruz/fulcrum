## Patterns

### Pattern A — combined check (the default agent shape)

```bash
biome check --write src/                      # lint-fix + format src/ in place
```

`check` is biome's headline command: it runs the linter and formatter together and emits a single diagnostic stream. Without `--write`, biome only reports — the file is untouched. With `--write`, safe lint fixes plus formatting are applied; add `--unsafe` to opt into rules that may change behavior (e.g. `noUnusedVariables`).

### Pattern B — format-only without mutation gotcha

```bash
biome format src/index.ts                     # PRINTS formatted source to stdout
biome format --write src/index.ts             # actually rewrites the file
```

`biome format file.ts` does **not** mutate by default — it streams the formatted version to stdout. This trips agents migrating from `prettier --write`. Always pair `format` with `--write` when you mean "fix the file".

### Pattern C — CI gate

```bash
# In CI: check format + lint, never mutate, fail on any issue
biome ci .

# With GitHub annotations
biome ci --reporter=github .
```

`biome ci` is `check` with `--write` forbidden, parallelism tuned for CI runners, and a stable exit-code contract (non-zero ⇔ issues found). Use it instead of `biome check` in workflows so a misconfigured `--write` cannot silently fix things.

### Pattern D — migrate from prettier + eslint

```bash
biome migrate prettier --write                # imports .prettierrc into biome.json
biome migrate eslint --write                  # imports eslint config (incl. flat config)
git rm .prettierrc .prettierignore .eslintrc* eslint.config.js
npm uninstall prettier eslint @typescript-eslint/{parser,eslint-plugin}
```

The migration commands map prettier/eslint options to their biome equivalents and print a list of any rules biome doesn't yet support. Run both commands, review the diff, then drop the old config files and dependencies.

### Pattern E — JSON reporter + jq

```bash
biome check --reporter=json src/ \
  | jq '.diagnostics | group_by(.category) | map({rule: .[0].category, count: length})'
```

Reporters: `summary` (default human), `json` (one object per run), `junit` (CI test-result aggregators), `github` (Actions annotations), `gitlab` (GitLab Code Quality). Pair `json` with `jq` for any scripted analysis.

### Pattern F — bound output on noisy projects

```bash
biome check --max-diagnostics=20 src/         # cap to 20 messages then summarize
biome check --diagnostic-level=error src/     # hide warnings
```

`--max-diagnostics` keeps a first-run report readable; `--diagnostic-level` filters by severity (`info` | `warn` | `error`).

### Pattern G — config file shape

```jsonc
// biome.json
{
  "$schema": "https://biomejs.dev/schemas/2.0.0/schema.json",
  "files": {
    "ignore": ["dist", "build", "**/*.gen.ts"]
  },
  "formatter": {
    "indentStyle": "space",
    "indentWidth": 2,
    "lineWidth": 100
  },
  "linter": {
    "enabled": true,
    "rules": {
      "recommended": true,
      "style": { "noNonNullAssertion": "warn" }
    }
  },
  "javascript": { "formatter": { "quoteStyle": "single", "semicolons": "asNeeded" } },
  "json":       { "formatter": { "trailingCommas": "none" } }
}
```

Top-level keys: `files` (globs / ignore), `formatter` (global formatter options), `linter` (rules), `javascript` / `json` / `css` (per-language overrides). biome respects `.editorconfig` for `indent_style`, `indent_size`, `end_of_line`, `max_line_length` — no need to duplicate.

### Pattern H — version-flag compatibility

```bash
biome check --apply src/                      # OLD (≤ 1.7) — deprecated alias
biome check --write src/                      # NEW (≥ 1.8) — preferred
```

`--apply` was renamed `--write` in biome 1.8. Newer versions accept both; future versions may drop `--apply`. Pin the biome version (`package.json` `devDependencies` or `mise.toml`) and use `--write` in any script that survives a release.
