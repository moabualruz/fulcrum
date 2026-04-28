## Cross-refs

- Behavioral rule: see `rules/AGENTS.md` — "lint and format Kotlin with ktlint; configure via `.editorconfig` so the IDE matches".
- Hook recipe: `format` (in `docs/hooks.md`) is wired to run `ktlint -F` on `*.kt` / `*.kts` writes.
- Sister skills: `skills/ruff/SKILL.md` (Python equivalent), `skills/biome/SKILL.md` (JS/TS equivalent) — same lint-and-format-in-one-binary shape.
- JSON pipelines: `skills/jq/SKILL.md` — `ktlint --reporter=json | jq` is the canonical aggregation.
- Upstream docs: <https://pinterest.github.io/ktlint/>
- Rules reference: <https://pinterest.github.io/ktlint/latest/rules/standard/>
- `.editorconfig` keys: <https://pinterest.github.io/ktlint/latest/rules/configuration-ktlint/>
