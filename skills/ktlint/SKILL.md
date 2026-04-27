---
name: ktlint
description: Use this skill whenever the user lints or formats Kotlin source (`.kt`, `.kts`) from the command line — ktlint is the standard linter + formatter for Kotlin, enforcing the official Kotlin coding conventions (or Android's stricter variant via `--android`). Trigger phrases include "lint a kotlin file", "format kotlin code", "fix style issues in kotlin", "check kotlin coding conventions", "run a kotlin linter for android", "format .kts gradle scripts", "auto-fix kotlin formatting", "set up ktlint pre-commit", "configure ktlint via .editorconfig", "baseline ktlint on a legacy project". Skip for Java (`google-java-format` / `checkstyle` / `pmd`), Scala (`scalafmt`), Groovy build scripts (`spotless` / `npm-groovy-lint`), Swift (`swift-format` / `swiftlint`), and **type-checking** Kotlin (that is `kotlinc -Werror` or the IDE — ktlint is style-only).
---

# ktlint

## When to use

- The user wants to lint or format `.kt` / `.kts` sources — find indentation, import-order, wildcard-import, no-semicolon, trailing-comma, naming, and chain-wrapping issues, then fix them.
- The user mentions Kotlin coding conventions, the official Kotlin style guide, Android's Kotlin style, or "the strict subset of IntelliJ formatter that ktlint enforces".
- The agent is wiring CI for a Kotlin/Android repo and needs a check that fails on style drift, plus a `--format` step for local pre-commit.
- The user wants `.editorconfig` to be the single source of truth so IntelliJ and the CLI agree.

**Skip** for: Java (use `google-java-format`, `checkstyle`, or `pmd`), Scala (`scalafmt`), Groovy `build.gradle` (use `spotless` or `npm-groovy-lint`), Swift (`swift-format` / `swiftlint`), Kotlin **type errors** (use `kotlinc -Werror` or the IDE — ktlint is purely syntactic), or Android-specific lint rules beyond style (use `lint` / `detekt`).

## Invocation

```bash
# Report only — exits non-zero on findings, never mutates
ktlint                                          # lint all .kt/.kts under cwd (default glob)
ktlint 'src/**/*.kt'                            # explicit glob (quote it!)
ktlint 'src/**/*.kt' '!src/**/Generated.kt'     # negate with leading !

# Fix in place
ktlint -F                                       # short form
ktlint --format                                 # long form
ktlint -F 'src/**/*.kt'

# Android coding conventions — set in .editorconfig (the --android flag was removed in ktlint 1.0)
# [*.{kt,kts}]
# ktlint_code_style = android_studio
ktlint -F 'app/src/**/*.kt'                          # picks up android_studio style from .editorconfig

# Reporters (CI / pipelines)
ktlint --reporter=plain                         # default human
ktlint --reporter=json                          # for jq
ktlint --reporter=checkstyle                    # Jenkins / SonarQube
ktlint --reporter=html,output=report.html
ktlint --reporter=sarif,output=ktlint.sarif     # GitHub code-scanning

# Baseline (incremental adoption on legacy code)
ktlint --baseline=ktlint-baseline.xml           # ignore pre-existing
ktlint --baseline=ktlint-baseline.xml --format

# Pre-commit hook installer (writes .git/hooks/pre-commit)
ktlint installGitPreCommitHook

# Custom rule jar
ktlint --ruleset=path/to/custom-ruleset.jar
```

`ktlint` reads `.editorconfig` upward from each target file. Without `-F` ktlint **only reports** — agents that run `ktlint file.kt` and expect formatting are the #1 trip.

## Patterns

### Pattern A — lint and fix locally

```bash
ktlint -F 'src/**/*.kt' 'src/**/*.kts'          # safe to run pre-commit
```

`-F` applies every fixable rule and rewrites the file. Non-fixable issues (e.g. naming) are still reported. Pair with `installGitPreCommitHook` so the fix runs automatically on staged files.

### Pattern B — Android conventions

```bash
# Set ktlint_code_style = android_studio in .editorconfig, then:
ktlint -F 'app/src/**/*.kt'
```

Setting `ktlint_code_style = android_studio` in `.editorconfig` enables Android-specific rules (final-newline, no wildcard imports beyond a low threshold, max-line-length). The standalone `--android` CLI flag was removed in ktlint 1.0 — config is the only path.

### Pattern C — JSON reporter piped to jq

```bash
ktlint --reporter=json 'src/**/*.kt' \
  | jq '.[] | .errors[] | {file: input_filename, rule, line, message}'

# Count findings by rule
ktlint --reporter=json . \
  | jq '[.[].errors[].rule] | group_by(.) | map({rule: .[0], n: length}) | sort_by(-.n)'
```

JSON is a stable schema (`[{file, errors: [{line, column, message, rule}]}]`). Pair with the `jq` skill for any aggregation.

### Pattern D — `.editorconfig` as source of truth

```ini
# .editorconfig at repo root
root = true

[*.{kt,kts}]
indent_size = 4
indent_style = space
max_line_length = 120
end_of_line = lf
insert_final_newline = true
ij_kotlin_allow_trailing_comma = true
ij_kotlin_allow_trailing_comma_on_call_site = true

# Pick one — official Kotlin style, JetBrains style, or Android.
ktlint_code_style = ktlint_official    # or: intellij_idea | android_studio

# Disable / configure individual rules
ktlint_standard_no-wildcard-imports = disabled
ktlint_standard_max-line-length = error
```

`.editorconfig` is read by **both** ktlint and IntelliJ — keeping rules here is the only way to stop the IDE and CLI from disagreeing. `ktlint_code_style` (≥ 0.49) picks the rule preset; per-rule overrides use the `ktlint_<ruleset>_<rule-name>` key.

### Pattern E — baseline on legacy code

```bash
ktlint --baseline=ktlint-baseline.xml           # first run: writes baseline if absent
                                                # later runs: ignores pre-existing issues
```

A baseline records every current violation by file + rule + line so adopting ktlint on a multi-thousand-issue codebase doesn't gate every PR. Commit the baseline; new violations still fail. Regenerate (`rm` and rerun) periodically as you fix old issues.

### Pattern F — suppress per-call-site

```kotlin
@file:Suppress("ktlint:standard:no-wildcard-imports")

package com.example

@Suppress("ktlint:standard:filename")
class oddName { /* ... */ }
```

ktlint ≥ 1.0 reads `@Suppress("ktlint:<ruleset>:<rule-id>")` annotations. The older `// ktlint-disable <rule-id>` block comment is **deprecated** and removed in 2.0 — migrate to annotations on new code.

### Pattern G — pre-commit + CI shape

```bash
# Local pre-commit (auto-fix what you can)
ktlint -F --relative

# CI gate (no mutation — fail on drift)
ktlint --reporter=checkstyle,output=build/ktlint.xml \
       --reporter=plain                          # second reporter to stderr for the log
```

Don't run `-F` in CI — the runner should fail the build, not silently rewrite.

## Anti-patterns

- **Don't run `ktlint <file>` and expect the file to change.** Without `-F` / `--format` ktlint only reports; the file is untouched. Agents migrating from prettier/black assumptions get this wrong every time.
- **Don't mix the standalone `ktlint` binary with the gradle plugin (`jlleitschuh/ktlint-gradle`).** They version independently; behavior diverges (different rule presets, different `.editorconfig` reads). Pin one — for repos with a Gradle build, the plugin is usually the source of truth and the CLI mirrors its version.
- **Don't put rule configuration in CLI flags.** `--disabled_rules` / `--editorconfig-override` were deprecated and partially removed; the IDE ignores them anyway. Put rules in `.editorconfig` so IntelliJ and the CLI agree.
- **Don't use `// ktlint-disable <rule-id>` block comments on ktlint ≥ 1.0.** That syntax is deprecated and removed in 2.0. Use `@Suppress("ktlint:standard:<rule-id>")` (or `@file:Suppress(...)` for whole files) instead.
- **Don't skip `--baseline` when adopting ktlint on a legacy project.** A first run on an unprepared codebase floods the report with thousands of pre-existing issues, masking new ones. Baseline once, fix incrementally.
- **Don't pass `--android` on the CLI.** It was removed in ktlint 1.0 (Sept 2023). Set `ktlint_code_style = android_studio` in `.editorconfig` so the IDE and CLI agree.
- **Don't reach for ktlint to type-check Kotlin.** "Unresolved reference", "type mismatch", "smart-cast impossible" come from `kotlinc` / the IDE, not ktlint. ktlint is style-only.
- **Don't `grep` ktlint plain output.** Use `--reporter=json` and pipe to `jq` — the human renderer changes between releases; the JSON shape is stable.

## Cross-refs

- Behavioral rule: see `rules/AGENTS.md` — "lint and format Kotlin with ktlint; configure via `.editorconfig` so the IDE matches".
- Hook recipe: `format` (in `docs/hooks.md`) is wired to run `ktlint -F` on `*.kt` / `*.kts` writes.
- Sister skills: `skills/ruff/SKILL.md` (Python equivalent), `skills/biome/SKILL.md` (JS/TS equivalent) — same lint-and-format-in-one-binary shape.
- JSON pipelines: `skills/jq/SKILL.md` — `ktlint --reporter=json | jq` is the canonical aggregation.
- Upstream docs: <https://pinterest.github.io/ktlint/>
- Rules reference: <https://pinterest.github.io/ktlint/latest/rules/standard/>
- `.editorconfig` keys: <https://pinterest.github.io/ktlint/latest/rules/configuration-ktlint/>
