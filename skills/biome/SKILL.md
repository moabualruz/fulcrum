---
name: biome
description: Use this skill whenever the user wants to format or lint JavaScript, TypeScript, JSX, TSX, JSON, JSONC, CSS, or Markdown — biome is the unified Rust-based replacement for prettier + eslint, doing both with one binary and one config file. Trigger phrases include "format a TS/JS file", "lint a TypeScript file", "replacement for prettier and eslint", "format JSON", "run a JS linter", "fix code style in javascript", "format this jsx in place", "lint and format together", "migrate from prettier and eslint", "one tool to format and lint". Reach for biome before installing prettier or eslint on a fresh project, and run `biome migrate` to import existing prettier/eslint configs. Skip for Python (use ruff), Rust (rustfmt + clippy), Go (gofmt + golangci-lint), Vue/Svelte/Astro single-file components (still prettier territory as of 2026), and TypeScript type-checking (that is `tsc --noEmit`).
---

# biome

## When to use

- The user wants to format or lint JS / TS / JSX / TSX / JSON / JSONC / CSS / Markdown — biome handles all of these with one binary, one config (`biome.json`).
- The user asks for "the prettier-and-eslint replacement" or wants to drop both in favor of one tool. `biome migrate eslint` and `biome migrate prettier` read the existing configs and emit `biome.json`.
- The agent is wiring CI for a JS/TS repo and needs a non-mutating linter+formatter check — `biome ci` is the dedicated entry point (no autofix, exits non-zero on any issue).
- A pre-commit hook wants to fix style issues on staged files — `biome check --write --staged` is the canonical shape.

**Skip** for: Python (use `ruff`), Rust (`rustfmt` + `clippy`), Go (`gofmt` + `golangci-lint`), YAML (`prettier` or `yamllint`), Vue / Svelte / Astro single-file components (prettier — biome has no parser for these as of 2026), and TypeScript **type** errors (that is `tsc --noEmit`; biome does not do type-checking).

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

## Anti-patterns

- **Don't run `biome format file.ts` and assume the file changed.** Without `--write` it only prints to stdout. Use `biome format --write` or, better, `biome check --write` for lint+format together.
- **Don't keep prettier and eslint installed alongside biome.** The whole point is one tool, one config; double-formatting fights itself. Run `biome migrate prettier` and `biome migrate eslint`, then uninstall both and delete their configs.
- **Don't expect Vue / Svelte / Astro single-file component support.** As of 2026, biome's parsers cover JS/TS/JSX/TSX/JSON/CSS/Markdown only. Keep prettier (or each framework's official formatter) for `.vue` / `.svelte` / `.astro`.
- **Don't run `biome lint` and skip formatting.** That ships unformatted code. Use `biome check --write` so a single command covers both.
- **Don't use `--apply` in scripts pinned to "latest" biome.** The flag was renamed `--write`; older docs and snippets still show `--apply`. Either pin the biome version or use `--write` (accepted by every recent release).
- **Don't reach for biome to catch type errors.** `noUnusedVariables`, `noExplicitAny`, etc. are syntactic. For "is this assignable to that?" you still need `tsc --noEmit`.
- **Don't `grep` `biome check` output.** Use `--reporter=json` and pipe to `jq` — diagnostic shape is stable across versions; the human renderer is not.
- **Don't run `biome check --write` in CI.** Use `biome ci` — same checks, refuses to mutate, single non-zero exit code on any diagnostic.

## Cross-refs

- Behavioral rule: see `rules/AGENTS.md` — "use biome for JS/TS/JSON/CSS formatting and linting; one tool replaces prettier + eslint".
- Hook recipe: `format` (in `docs/hooks.md`) wires biome as the JS/TS formatter, with prettier as the fallback for Vue/Svelte/Astro.
- Sister skill: `skills/ruff/SKILL.md` — biome's Python counterpart (Rust-based linter + formatter, replaces flake8 + black).
- JSON pipelines: `skills/jq/SKILL.md` — `biome check --reporter=json | jq` is the canonical analysis shape.
- Type-checking partner: `tsc --noEmit` for TypeScript types; biome only handles syntax + style.
- Upstream: <https://biomejs.dev/>
- CLI reference: <https://biomejs.dev/reference/cli/>
- Migration guide: <https://biomejs.dev/guides/migrate-eslint-prettier/>
