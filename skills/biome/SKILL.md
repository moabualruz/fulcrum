---
name: biome
description: Use this skill whenever the user wants to format or lint JavaScript, TypeScript, JSX, TSX, JSON, JSONC, CSS, GraphQL, HTML, Vue, Svelte, or Astro — biome is the unified Rust-based replacement for prettier + eslint, doing both with one binary and one config file. Trigger phrases include "format a TS/JS file", "lint a TypeScript file", "replacement for prettier and eslint", "format JSON", "run a JS linter", "fix code style in javascript", "format this jsx in place", "lint and format together", "migrate from prettier and eslint", "one tool to format and lint". Reach for biome before installing prettier or eslint on a fresh project, and run `biome migrate` to import existing prettier/eslint configs. Skip for Python (use ruff), Rust (rustfmt + clippy), Go (gofmt + golangci-lint), and TypeScript type-checking (that is `tsc --noEmit`). Markdown formatting in progress upstream; biome cannot lint Markdown today.
---

# biome

## When to use

- User want format/lint JS / TS / JSX / TSX / JSON / JSONC / CSS / GraphQL / HTML — biome handle all, one binary, one config (`biome.json`). Vue / Svelte / Astro single-file components also supported since biome v2.3.0 (experimental but stable for daily use).
- User ask for "prettier-and-eslint replacement" or want drop both for one tool. `biome migrate eslint` and `biome migrate prettier` read existing configs, emit `biome.json`.
- Agent wiring CI for JS/TS repo, need non-mutating linter+formatter check — `biome ci` dedicated entry point (no autofix, exit non-zero on any issue).
- Pre-commit hook want fix style on staged files — `biome check --write --staged` canonical shape.

**Skip** for: Python (`ruff`), Rust (`rustfmt` + `clippy`), Go (`gofmt` + `golangci-lint`), YAML (`prettier` or `yamllint`), Markdown lint (biome only parse/format markdown — no lint rules; use `markdownlint` if need lint), TypeScript **type** errors (`tsc --noEmit`; biome no type-check).

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

`biome` walk up from target path looking for `biome.json` or `biome.jsonc`. No config → fall back to defaults (still useful for one-shot formatting).

## Patterns

### Pattern A — combined check (the default agent shape)

```bash
biome check --write src/                      # lint-fix + format src/ in place
```

`check` = biome headline command: run linter + formatter together, emit single diagnostic stream. No `--write` → biome only report, file untouched. With `--write`, safe lint fixes plus formatting applied; add `--unsafe` for rules may change behavior (e.g. `noUnusedVariables`).

### Pattern B — format-only without mutation gotcha

```bash
biome format src/index.ts                     # PRINTS formatted source to stdout
biome format --write src/index.ts             # actually rewrites the file
```

`biome format file.ts` **not** mutate by default — stream formatted version to stdout. Trip agents migrating from `prettier --write`. Always pair `format` with `--write` when mean "fix file".

### Pattern C — CI gate

```bash
# In CI: check format + lint, never mutate, fail on any issue
biome ci .

# With GitHub annotations
biome ci --reporter=github .
```

`biome ci` = `check` with `--write` forbidden, parallelism tuned for CI runners, stable exit-code contract (non-zero ⇔ issues found). Use instead of `biome check` in workflows so misconfigured `--write` cannot silently fix things.

### Pattern D — migrate from prettier + eslint

```bash
biome migrate prettier --write                # imports .prettierrc into biome.json
biome migrate eslint --write                  # imports eslint config (incl. flat config)
git rm .prettierrc .prettierignore .eslintrc* eslint.config.js
npm uninstall prettier eslint @typescript-eslint/{parser,eslint-plugin}
```

Migration commands map prettier/eslint options to biome equivalents, print list of rules biome no support yet. Run both, review diff, drop old config files + dependencies.

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

`--max-diagnostics` keep first-run report readable; `--diagnostic-level` filter by severity (`info` | `warn` | `error`).

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

Top-level keys: `files` (globs / ignore), `formatter` (global formatter options), `linter` (rules), `javascript` / `json` / `css` (per-language overrides). biome respect `.editorconfig` for `indent_style`, `indent_size`, `end_of_line`, `max_line_length` — no need duplicate.

### Pattern H — version-flag compatibility

```bash
biome check --apply src/                      # OLD (≤ 1.7) — deprecated alias
biome check --write src/                      # NEW (≥ 1.8) — preferred
```

`--apply` renamed `--write` in biome 1.8. Newer versions accept both; future versions may drop `--apply`. Pin biome version (`package.json` `devDependencies` or `mise.toml`) and use `--write` in any script surviving release.

## Anti-patterns

- **Don't run `biome format file.ts` and assume file changed.** No `--write` → only print to stdout. Use `biome format --write` or better, `biome check --write` for lint+format together.
- **Don't keep prettier and eslint installed alongside biome.** Whole point = one tool, one config; double-formatting fight itself. Run `biome migrate prettier` and `biome migrate eslint`, then uninstall both and delete configs.
- **Don't assume Vue / Svelte / Astro support on by default for old biome.** Support landed biome v2.3.0, still experimental — verify installed version (`biome --version`) before relying in CI. Pin 2.3.0+ in `package.json` if depend on it.
- **Don't run `biome lint` and skip formatting.** Ship unformatted code. Use `biome check --write` so single command cover both.
- **Don't use `--apply` in scripts pinned to "latest" biome.** Flag renamed `--write`; older docs/snippets still show `--apply`. Pin biome version or use `--write` (accepted by every recent release).
- **Don't reach for biome to catch type errors.** `noUnusedVariables`, `noExplicitAny`, etc. syntactic. For "is this assignable to that?" still need `tsc --noEmit`.
- **Don't `grep` `biome check` output.** Use `--reporter=json` + pipe to `jq` — diagnostic shape stable across versions; human renderer not.
- **Don't run `biome check --write` in CI.** Use `biome ci` — same checks, refuse mutate, single non-zero exit on any diagnostic.

## Cross-refs

- Behavioral rule: see `rules/AGENTS.md` — "use biome for JS/TS/JSON/CSS formatting and linting; one tool replaces prettier + eslint".
- Hook recipe: `format` (in `docs/hooks.md`) wire biome as JS/TS formatter, prettier as fallback when biome not installed or for Markdown lint.
- Sister skill: `skills/ruff/SKILL.md` — biome Python counterpart (Rust-based linter + formatter, replaces flake8 + black).
- JSON pipelines: `skills/jq/SKILL.md` — `biome check --reporter=json | jq` canonical analysis shape.
- Type-checking partner: `tsc --noEmit` for TypeScript types; biome only handle syntax + style.
- Upstream: <https://biomejs.dev/>
- CLI reference: <https://biomejs.dev/reference/cli/>
- Migration guide: <https://biomejs.dev/guides/migrate-eslint-prettier/>