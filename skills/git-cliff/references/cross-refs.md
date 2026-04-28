## Cross-refs

- Behavioral rule: `rules/AGENTS.md` §4 — "use `git-cliff` for CHANGELOGs; conventional commits format".
- This repo's config: `/Users/mkh/workspace/fulcrum/cliff.toml` (Features / Bug Fixes / Refactor / Documentation / Performance / Tests / Build/CI / Styling / Chores / Other; tags match `v[0-9]*`).
- This repo's runner: `bun run changelog` → `git-cliff -o CHANGELOG.md`.
- Pairs with: `release-please`, `semantic-release` (heavier, opinionated). git-cliff is the language-agnostic, lightweight option — own the `cliff.toml` and you own the format.
- Manual: <https://git-cliff.org/docs/>
- Configuration: <https://git-cliff.org/docs/configuration>
- Tera templating: <https://keats.github.io/tera/docs/>
