## Cross-refs

- Behavioral rule: see `rules/AGENTS.md` — "use biome for JS/TS/JSON/CSS formatting and linting; one tool replaces prettier + eslint".
- Hook recipe: `format` (in `docs/hooks.md`) wires biome as the JS/TS formatter, with prettier as the fallback when biome isn't installed or for Markdown lint.
- Sister skill: `skills/ruff/SKILL.md` — biome's Python counterpart (Rust-based linter + formatter, replaces flake8 + black).
- JSON pipelines: `skills/jq/SKILL.md` — `biome check --reporter=json | jq` is the canonical analysis shape.
- Type-checking partner: `tsc --noEmit` for TypeScript types; biome only handles syntax + style.
- Upstream: <https://biomejs.dev/>
- CLI reference: <https://biomejs.dev/reference/cli/>
- Migration guide: <https://biomejs.dev/guides/migrate-eslint-prettier/>
