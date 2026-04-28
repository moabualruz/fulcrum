## When to use

- The user wants to format Dart — `dart format .` rewrites every `.dart` file under cwd in place; `dart format --output=none --set-exit-if-changed .` is the CI gate (no writes, exits 1 on any diff).
- The user wants to lint or statically check Dart — `dart analyze` reads `analysis_options.yaml` and reports errors, warnings, and info-level lints in one pass.
- The user wants to apply lint auto-fixes (add `const`, remove unused imports, sort imports) — `dart fix --apply`; preview first with `--dry-run`.
- The user mentions `dartfmt` or `dartanalyzer` — those are legacy Dart 2.9- commands. Steer to `dart format` / `dart analyze` (Dart 2.10+).
- The repo is pure Flutter — use `dart format` (the `flutter format` wrapper was removed in Flutter 3.x; only `flutter analyze` remains as a wrapper).

**Skip** for: Kotlin (`ktlint`), Swift (`swiftformat` / `swiftlint`), JS/TS (`biome`), Python (`ruff`), Flutter app compilation (`flutter build`, `flutter run`), unit tests (`dart test`, `flutter test`), package publishing (`dart pub publish`).
