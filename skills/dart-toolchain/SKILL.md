---
name: dart-toolchain
description: Use this skill whenever the user formats or lints Dart or Flutter source code from the command line — `dart format` is the formatter (Black-style, mutates by default) and `dart analyze` is the static analyzer (errors, warnings, lints). Both ship with the Dart SDK; no separate install. Trigger phrases include "format dart code", "analyze a flutter project", "lint dart sources", "fix style issues in dart", "check dart for static errors", "format and lint a flutter package", "auto-fix dart import sorting and const usage", "check dart formatting in CI without writing", "run the dart linter with the recommended ruleset". Pair with `dart fix --apply` for machine-applicable lint suggestions. Skip for Kotlin (use ktlint), Swift (use swiftformat), JS/TS (use biome), Python (use ruff), and for Flutter app build/run (use `flutter build` / `flutter run`).
---

# dart-toolchain

## When to use

- The user wants to format Dart — `dart format .` rewrites every `.dart` file under cwd in place; `dart format --output=none --set-exit-if-changed .` is the CI gate (no writes, exits 1 on any diff).
- The user wants to lint or statically check Dart — `dart analyze` reads `analysis_options.yaml` and reports errors, warnings, and info-level lints in one pass.
- The user wants to apply lint auto-fixes (add `const`, remove unused imports, sort imports) — `dart fix --apply`; preview first with `--dry-run`.
- The user mentions `dartfmt` or `dartanalyzer` — those are legacy Dart 2.9- commands. Steer to `dart format` / `dart analyze` (Dart 2.10+).
- The repo is pure Flutter — use `dart format` (the `flutter format` wrapper was removed in Flutter 3.x; only `flutter analyze` remains as a wrapper).

**Skip** for: Kotlin (`ktlint`), Swift (`swiftformat` / `swiftlint`), JS/TS (`biome`), Python (`ruff`), Flutter app compilation (`flutter build`, `flutter run`), unit tests (`dart test`, `flutter test`), package publishing (`dart pub publish`).

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

`dart format` and `dart analyze` are **separate subcommands** — running one does not run the other. The canonical pre-commit shape is `dart format . && dart analyze`.

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

## Anti-patterns

- **Don't invoke `dart format .` without committing first** if you don't trust its choices. There is no `--write` flag because writing is the default; the only way to preview is `--output=show` (stdout) or `--output=none --set-exit-if-changed`. Stage your work first.
- **Don't pass `--line-length=120` if `analysis_options.yaml` says 80** (or vice versa). The formatter and the analyzer must agree on width — disagreements show up as a permanent format-then-lint diff loop. Set the width in one place; if `pubspec.yaml`/IDE config also pins it, line them all up.
- **Don't stack `lints` and `flutter_lints`.** `flutter_lints` already pulls `lints` transitively and re-tunes the rule set for Flutter. Pick one `include:` line in `analysis_options.yaml` and one dev-dependency.
- **Don't run `dart fix --apply` blindly in CI.** Some auto-fixes change semantics (nullable demotions, removing what looks like dead code). Preview with `--dry-run`, review the diff, then apply on a feature branch — never on `main` from a workflow.
- **Don't use `dartfmt` or `dartanalyzer`.** Those are legacy commands removed in Dart 2.10+. Use `dart format` and `dart analyze` — and update any CI/Makefile/just recipe that still references the old names.
- **Don't duplicate format/analyze excludes between CLI flags and `analysis_options.yaml`.** Duplication drifts. The `analyzer: exclude:` block governs both the analyzer and the formatter (the formatter respects analyzer excludes); keep paths there and only pass explicit CLI paths when overriding.
- **Don't run `dart format` and skip `dart analyze`.** Format only handles whitespace/wrapping; lints (`prefer_const_constructors`, `avoid_print`, `unused_import`) live in the analyzer. A format-only pre-commit ships unlinted code.
- **Don't use `dart analyze` to find runtime errors or test failures.** It is static and AST-level. Use `dart test` / `flutter test` for behavior; `dart analyze` complements them, it does not replace them.

## Cross-refs

- Behavioral rule: see `rules/AGENTS.md` — "format Dart with `dart format`; lint with `dart analyze`; both ship with the SDK".
- Hook recipe: `format` (in `docs/hooks.md`) is wired to run `dart format` on `*.dart` writes; lint hook runs `dart analyze`.
- Sister skills: `skills/ruff/SKILL.md` (Python check + format), `skills/biome/SKILL.md` (JS/TS check + format) — same combined-tool shape.
- Machine-readable analyzer output: `dart analyze --format=machine` is pipe-delimited; pipe through `awk -F'|'` for further processing. There is no JSON format on `dart analyze` — for JSON-shaped diagnostics use `dart language-server` (LSP).
- Upstream: <https://dart.dev/tools/dart-format>, <https://dart.dev/tools/dart-analyze>
- Lints index: <https://dart.dev/tools/linter-rules>
- Flutter wrappers: <https://docs.flutter.dev/reference/flutter-cli>
