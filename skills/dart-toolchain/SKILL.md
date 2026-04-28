---
name: dart-toolchain
description: Use this skill whenever the user formats or lints Dart or Flutter source code from the command line — `dart format` is the formatter (Black-style, mutates by default) and `dart analyze` is the static analyzer (errors, warnings, lints). Both ship with the Dart SDK; no separate install. Trigger phrases include "format dart code", "analyze a flutter project", "lint dart sources", "fix style issues in dart", "check dart for static errors", "format and lint a flutter package", "auto-fix dart import sorting and const usage", "check dart formatting in CI without writing", "run the dart linter with the recommended ruleset". Pair with `dart fix --apply` for machine-applicable lint suggestions. Skip for Kotlin (use ktlint), Swift (use swiftformat), JS/TS (use biome), Python (use ruff), and for Flutter app build/run (use `flutter build` / `flutter run`).
---

# dart-toolchain

## When to use

- User want format Dart — `dart format .` rewrite every `.dart` file under cwd in place; `dart format --output=none --set-exit-if-changed .` = CI gate (no write, exit 1 on any diff).
- User want lint or static check Dart — `dart analyze` read `analysis_options.yaml`, report errors, warnings, info-level lints in one pass.
- User want apply lint auto-fix (add `const`, remove unused imports, sort imports) — `dart fix --apply`; preview first with `--dry-run`.
- User mention `dartfmt` or `dartanalyzer` — legacy Dart 2.9- commands. Steer to `dart format` / `dart analyze` (Dart 2.10+).
- Repo pure Flutter — use `dart format` (`flutter format` wrapper removed in Flutter 3.x; only `flutter analyze` remain as wrapper).

**Skip** for: Kotlin (`ktlint`), Swift (`swiftformat` / `swiftlint`), JS/TS (`biome`), Python (`ruff`), Flutter app compile (`flutter build`, `flutter run`), unit tests (`dart test`, `flutter test`), package publish (`dart pub publish`).

## Invocation

```bash
# Format (mutates by default — write happens unless you opt out)
dart format .                                       # rewrite every .dart file in cwd
dart format lib/ test/                              # restrict to specific paths
dart format --line-length=100 .                     # default is 80
dart format --output=none --set-exit-if-changed .   # CI gate: no write, exit 1 on diff
dart format --output=show .                         # print formatted source to stdout
dart format -o none lib/foo.dart                    # short form of --output=none

# Analyze (read-only — exits non-zero on errors)
dart analyze                                        # entire package, honors analysis_options.yaml
dart analyze lib/                                   # one directory
dart analyze --fatal-infos                          # promote info-level lints to non-zero exit
dart analyze --fatal-warnings                       # default in CI
dart analyze --format=machine                       # pipe-delimited (`SEVERITY|TYPE|...`); see https://dart.dev/tools/dart-analyze

# Auto-fix lint findings
dart fix --dry-run                                  # preview every machine-applicable fix
dart fix --apply                                    # apply them in place

# Flutter — use `dart format` directly (the `flutter format` wrapper was removed in Flutter 3.x)
dart format .
flutter analyze                                     # still wraps `dart analyze`
```

`dart format` and `dart analyze` = **separate subcommands** — running one no run other. Canonical pre-commit shape: `dart format . && dart analyze`.

## Patterns

### Pattern A — format in place (the default agent shape)

```bash
dart format .
```

`dart format` mutate by default — no `--write` flag because writing **is** default. Preview without write: `--output=show` (stdout) or `--output=none --set-exit-if-changed` (CI).

### Pattern B — CI format gate

```bash
dart format --output=none --set-exit-if-changed .
```

`--output=none` suppress write; `--set-exit-if-changed` make command exit 1 if any file would reformat. Pair with `dart analyze` for full coverage:

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

Then `dart analyze` read this file auto. Severity overrides in `analyzer: errors:` = how you make CI-blocking lint.

### Pattern D — auto-fix lint findings

```bash
dart fix --dry-run                                  # show every fix that would apply
dart fix --apply                                    # apply them
```

`dart fix` read same lints as `dart analyze`, apply machine-fixable subset (add `const`, remove unused imports, prefer single quotes, …). Always preview with `--dry-run` first; some fixes change semantics (e.g. nullable demotions). Commit before run `--apply`.

### Pattern E — pubspec.yaml integration

```yaml
# pubspec.yaml
dev_dependencies:
  lints: ^3.0.0                                     # pure Dart
  # flutter_lints: ^4.0.0                           # Flutter (already includes `lints`)
```

After `dart pub get`, `package:lints/recommended.yaml` (or `package:flutter_lints/flutter.yaml`) include in `analysis_options.yaml` resolve. Without dev-dep declared, include silent no-op.

### Pattern F — machine-readable output for tooling

```bash
# Pipe-delimited: SEVERITY|TYPE|ERROR_CODE|FILE_PATH|LINE|COLUMN|LENGTH|ERROR_MESSAGE
dart analyze --format=machine .

# Count findings by error code (awk on the 3rd field)
dart analyze --format=machine . | awk -F'|' '{print $3}' | sort | uniq -c | sort -rn
```

`dart analyze` only emit `default` (human) and `machine` (pipe-delimited) formats. No `--format=json`. For JSON-shaped diagnostics, run LSP via `dart language-server` or post-process `machine` output through `awk`/`miller`.

### Pattern G — pre-commit / CI shape

```bash
# Local pre-commit (format then lint)
dart format . && dart analyze

# CI gate (no mutation; both must pass)
dart format --output=none --set-exit-if-changed . && dart analyze --fatal-warnings --fatal-infos
```

No run `dart format .` (mutating) in CI — runner should fail on drift, not silent rewrite tree.

## Anti-patterns

- **No invoke `dart format .` without commit first** if no trust its choices. No `--write` flag because writing is default; only preview = `--output=show` (stdout) or `--output=none --set-exit-if-changed`. Stage work first.
- **No pass `--line-length=120` if `analysis_options.yaml` say 80** (or vice versa). Formatter and analyzer must agree on width — disagreement show up as permanent format-then-lint diff loop. Set width in one place; if `pubspec.yaml`/IDE config also pin it, line them all up.
- **No stack `lints` and `flutter_lints`.** `flutter_lints` already pull `lints` transitively, re-tune rule set for Flutter. Pick one `include:` line in `analysis_options.yaml` and one dev-dependency.
- **No run `dart fix --apply` blind in CI.** Some auto-fixes change semantics (nullable demotions, removing what look like dead code). Preview with `--dry-run`, review diff, then apply on feature branch — never on `main` from workflow.
- **No use `dartfmt` or `dartanalyzer`.** Legacy commands removed in Dart 2.10+. Use `dart format` and `dart analyze` — update any CI/Makefile/just recipe still reference old names.
- **No duplicate format/analyze excludes between CLI flags and `analysis_options.yaml`.** Duplication drift. `analyzer: exclude:` block govern both analyzer and formatter (formatter respect analyzer excludes); keep paths there, only pass explicit CLI paths when overriding.
- **No run `dart format` and skip `dart analyze`.** Format only handle whitespace/wrapping; lints (`prefer_const_constructors`, `avoid_print`, `unused_import`) live in analyzer. Format-only pre-commit ship unlinted code.
- **No use `dart analyze` to find runtime errors or test failures.** Static and AST-level. Use `dart test` / `flutter test` for behavior; `dart analyze` complement them, no replace.

## Cross-refs

- Behavioral rule: see `rules/AGENTS.md` — "format Dart with `dart format`; lint with `dart analyze`; both ship with the SDK".
- Hook recipe: `format` (in `docs/hooks.md`) wired to run `dart format` on `*.dart` writes; lint hook run `dart analyze`.
- Sister skills: `skills/ruff/SKILL.md` (Python check + format), `skills/biome/SKILL.md` (JS/TS check + format) — same combined-tool shape.
- Machine-readable analyzer output: `dart analyze --format=machine` pipe-delimited; pipe through `awk -F'|'` for further processing. No JSON format on `dart analyze` — for JSON-shaped diagnostics use `dart language-server` (LSP).
- Upstream: <https://dart.dev/tools/dart-format>, <https://dart.dev/tools/dart-analyze>
- Lints index: <https://dart.dev/tools/linter-rules>
- Flutter wrappers: <https://docs.flutter.dev/reference/flutter-cli>