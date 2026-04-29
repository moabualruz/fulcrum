## Cross-refs

- Behavioral rule: see `rules/AGENTS.md` — toolchain pinning and runtime resolution.
- Complement: `direnv` skill — direnv handles per-project env vars, mise handles per-project tools (with optional `[env]` overlap; pick one).
- Peer: `just` skill — both define tasks; if the repo already has a justfile, leave tasks there and keep `.mise.toml` to `[tools]`.
- Migration: any `.tool-versions` from asdf is read by mise unmodified — drop in mise, run `mise install`, remove asdf from PATH.
- Upstream: <https://mise.jdx.dev/>
- Config reference: <https://mise.jdx.dev/configuration.html>
