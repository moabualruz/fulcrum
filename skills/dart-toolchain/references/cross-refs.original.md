## Cross-refs

- Behavioral rule: see `rules/AGENTS.md` — "format Dart with `dart format`; lint with `dart analyze`; both ship with the SDK".
- Hook recipe: `format` (in `docs/hooks.md`) is wired to run `dart format` on `*.dart` writes; lint hook runs `dart analyze`.
- Sister skills: `skills/ruff/SKILL.md` (Python check + format), `skills/biome/SKILL.md` (JS/TS check + format) — same combined-tool shape.
- Machine-readable analyzer output: `dart analyze --format=machine` is pipe-delimited; pipe through `awk -F'|'` for further processing. There is no JSON format on `dart analyze` — for JSON-shaped diagnostics use `dart language-server` (LSP).
- Upstream: <https://dart.dev/tools/dart-format>, <https://dart.dev/tools/dart-analyze>
- Lints index: <https://dart.dev/tools/linter-rules>
- Flutter wrappers: <https://docs.flutter.dev/reference/flutter-cli>
