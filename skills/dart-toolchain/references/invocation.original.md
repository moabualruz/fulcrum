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
