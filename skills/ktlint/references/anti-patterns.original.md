## Anti-patterns

- **Don't run `ktlint <file>` and expect the file to change.** Without `-F` / `--format` ktlint only reports; the file is untouched. Agents migrating from prettier/black assumptions get this wrong every time.
- **Don't mix the standalone `ktlint` binary with the gradle plugin (`jlleitschuh/ktlint-gradle`).** They version independently; behavior diverges (different rule presets, different `.editorconfig` reads). Pin one — for repos with a Gradle build, the plugin is usually the source of truth and the CLI mirrors its version.
- **Don't put rule configuration in CLI flags.** `--disabled_rules` / `--editorconfig-override` were deprecated and partially removed; the IDE ignores them anyway. Put rules in `.editorconfig` so IntelliJ and the CLI agree.
- **Don't use `// ktlint-disable <rule-id>` block comments on ktlint ≥ 1.0.** That syntax is deprecated and removed in 2.0. Use `@Suppress("ktlint:standard:<rule-id>")` (or `@file:Suppress(...)` for whole files) instead.
- **Don't skip `--baseline` when adopting ktlint on a legacy project.** A first run on an unprepared codebase floods the report with thousands of pre-existing issues, masking new ones. Baseline once, fix incrementally.
- **Don't pass `--android` on the CLI.** It was removed in ktlint 1.0 (Sept 2023). Set `ktlint_code_style = android_studio` in `.editorconfig` so the IDE and CLI agree.
- **Don't reach for ktlint to type-check Kotlin.** "Unresolved reference", "type mismatch", "smart-cast impossible" come from `kotlinc` / the IDE, not ktlint. ktlint is style-only.
- **Don't `grep` ktlint plain output.** Use `--reporter=json` and pipe to `jq` — the human renderer changes between releases; the JSON shape is stable.
