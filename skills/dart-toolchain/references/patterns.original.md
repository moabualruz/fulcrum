## Patterns

### Pattern A — format in place (the default agent shape)

```bash
dart format .
```

`dart format` mutates by default — there is no `--write` flag because writing **is** the default. To preview without writing, use `--output=show` (stdout) or `--output=none --set-exit-if-changed` (CI).

### Pattern B — CI format gate

```bash
dart format --output=none --set-exit-if-changed .
```

`--output=none` suppresses the write; `--set-exit-if-changed` makes the command exit 1 if any file would be reformatted. Pair with `dart analyze` for full coverage:

```bash
dart format --output=none --set-exit-if-changed . && dart analyze --fatal-warnings
```

### Pattern C — analyze with a recommended ruleset

```yaml
# analysis_options.yaml at the package root
include: package:lints/recommended.yaml         # pure Dart
# include: package:flutter_lints/flutter.yaml   # Flutter (do not stack with `lints`)

linter:
  rules:
    prefer_const_constructors: true
    avoid_print: true
    unawaited_futures: true

analyzer:
  errors:
    unused_import: error                        # promote info → error
    todo: ignore                                # silence specific lints
  exclude:
    - "**/*.g.dart"
    - "build/**"
```

Then `dart analyze` reads this file automatically. Severity overrides in `analyzer: errors:` are how you make a CI-blocking lint.

### Pattern D — auto-fix lint findings

```bash
dart fix --dry-run                                  # show every fix that would apply
dart fix --apply                                    # apply them
```

`dart fix` reads the same lints as `dart analyze` and applies the machine-fixable subset (add `const`, remove unused imports, prefer single quotes, …). Always preview with `--dry-run` first; some fixes change semantics (e.g. nullable demotions). Commit before running `--apply`.

### Pattern E — pubspec.yaml integration

```yaml
# pubspec.yaml
dev_dependencies:
  lints: ^3.0.0                                     # pure Dart
  # flutter_lints: ^4.0.0                           # Flutter (already includes `lints`)
```

After `dart pub get`, the `package:lints/recommended.yaml` (or `package:flutter_lints/flutter.yaml`) include in `analysis_options.yaml` resolves. Without the dev-dep declared, the include silently no-ops.

### Pattern F — machine-readable output for tooling

```bash
# Pipe-delimited: SEVERITY|TYPE|ERROR_CODE|FILE_PATH|LINE|COLUMN|LENGTH|ERROR_MESSAGE
dart analyze --format=machine .

# Count findings by error code (awk on the 3rd field)
dart analyze --format=machine . | awk -F'|' '{print $3}' | sort | uniq -c | sort -rn
```

`dart analyze` only emits `default` (human) and `machine` (pipe-delimited) formats. There is no `--format=json`. For JSON-shaped diagnostics, run the LSP via `dart language-server` or post-process the `machine` output through `awk`/`miller`.

### Pattern G — pre-commit / CI shape

```bash
# Local pre-commit (format then lint)
dart format . && dart analyze

# CI gate (no mutation; both must pass)
dart format --output=none --set-exit-if-changed . && dart analyze --fatal-warnings --fatal-infos
```

Don't run `dart format .` (mutating) in CI — the runner should fail on drift, not silently rewrite the tree.
