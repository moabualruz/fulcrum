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
