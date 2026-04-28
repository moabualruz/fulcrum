## When to use

- The user wants to format or lint JS / TS / JSX / TSX / JSON / JSONC / CSS / GraphQL / HTML — biome handles all of these with one binary, one config (`biome.json`). Vue / Svelte / Astro single-file components are also supported since biome v2.3.0 (experimental but stable enough for daily use).
- The user asks for "the prettier-and-eslint replacement" or wants to drop both in favor of one tool. `biome migrate eslint` and `biome migrate prettier` read the existing configs and emit `biome.json`.
- The agent is wiring CI for a JS/TS repo and needs a non-mutating linter+formatter check — `biome ci` is the dedicated entry point (no autofix, exits non-zero on any issue).
- A pre-commit hook wants to fix style issues on staged files — `biome check --write --staged` is the canonical shape.

**Skip** for: Python (use `ruff`), Rust (`rustfmt` + `clippy`), Go (`gofmt` + `golangci-lint`), YAML (`prettier` or `yamllint`), Markdown lint (biome only parses/formats markdown — no lint rules; use `markdownlint` if you need lint), and TypeScript **type** errors (that is `tsc --noEmit`; biome does not do type-checking).
