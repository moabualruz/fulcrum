## Anti-patterns

- **Don't invoke `dart format .` without committing first** if you don't trust its choices. There is no `--write` flag because writing is the default; the only way to preview is `--output=show` (stdout) or `--output=none --set-exit-if-changed`. Stage your work first.
- **Don't pass `--line-length=120` if `analysis_options.yaml` says 80** (or vice versa). The formatter and the analyzer must agree on width — disagreements show up as a permanent format-then-lint diff loop. Set the width in one place; if `pubspec.yaml`/IDE config also pins it, line them all up.
- **Don't stack `lints` and `flutter_lints`.** `flutter_lints` already pulls `lints` transitively and re-tunes the rule set for Flutter. Pick one `include:` line in `analysis_options.yaml` and one dev-dependency.
- **Don't run `dart fix --apply` blindly in CI.** Some auto-fixes change semantics (nullable demotions, removing what looks like dead code). Preview with `--dry-run`, review the diff, then apply on a feature branch — never on `main` from a workflow.
- **Don't use `dartfmt` or `dartanalyzer`.** Those are legacy commands removed in Dart 2.10+. Use `dart format` and `dart analyze` — and update any CI/Makefile/just recipe that still references the old names.
- **Don't duplicate format/analyze excludes between CLI flags and `analysis_options.yaml`.** Duplication drifts. The `analyzer: exclude:` block governs both the analyzer and the formatter (the formatter respects analyzer excludes); keep paths there and only pass explicit CLI paths when overriding.
- **Don't run `dart format` and skip `dart analyze`.** Format only handles whitespace/wrapping; lints (`prefer_const_constructors`, `avoid_print`, `unused_import`) live in the analyzer. A format-only pre-commit ships unlinted code.
- **Don't use `dart analyze` to find runtime errors or test failures.** It is static and AST-level. Use `dart test` / `flutter test` for behavior; `dart analyze` complements them, it does not replace them.
