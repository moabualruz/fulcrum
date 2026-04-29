## Cross-refs

- Behavioral rule: see `rules/AGENTS.md` — "lint and format Python with ruff; never `black` + `flake8` separately".
- Hook recipe: `format` (in `docs/hooks.md`) is wired to run `ruff format` on `*.py` writes; `lint` runs `ruff check --fix`.
- JSON pipelines: `skills/jq/SKILL.md` — `ruff check --output-format=json | jq` is the canonical aggregation shape.
- Upstream docs: <https://docs.astral.sh/ruff/>
- Rules reference: <https://docs.astral.sh/ruff/rules/>
- Configuration: <https://docs.astral.sh/ruff/configuration/>
