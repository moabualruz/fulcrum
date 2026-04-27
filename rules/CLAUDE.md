# Fulcrum global rules

> Append to `~/.claude/CLAUDE.md`. These are behavioral rules — what the agent *does* — not knowledge. **Skill files are sourced upstream**, not authored here. See `skills/SOURCES.md` for the install manifest.

## Tool preferences (use this, not that)

**Search and discovery**
- Use `rg`, never `grep -r` or `find -name | xargs grep`.
- Use `fd`, never `find`.
- Use `ast-grep` (`sg`) for structural / AST-aware patterns — prefer over `rg` when the target is code shape, not text.
- Use `bat` (not `cat`) when output benefits from syntax highlighting; `cat` only for piping.
- Use `eza`, never `ls`.
- Use `zoxide` (`z <fragment>`) instead of `cd <full path>` for previously-visited paths.

**HTTP and APIs**
- Use `xh`, never `curl`, for JSON APIs. `xh --check-status` to fail on non-2xx.
- Use `gh` for everything GitHub. Never the web UI.
- Use `--json` / `--format json` / `-o json` whenever the CLI supports it. Parse with `jq`, never with `grep`/`awk`.

**Data manipulation**
- `jq` for JSON, `yq` for YAML/TOML. Always pipe; never parse manually.
- `sd` for text replacement, never `sed -i`.

**Diff and version**
- `difftastic` (`difft`) for syntax-aware diffs.
- `git log --oneline -20` — never dump full git log.
- `git-cliff` for changelogs; never hand-write.

**Project task running**
- **Check for a `justfile` before suggesting `npm run X` / `pip install Y` / `make Z`.** If `just` is the project runner, use its recipes.
- `mise` if `.mise.toml` / `.tool-versions` exists.
- `direnv` if `.envrc` exists.

**Security and quality**
- `gitleaks detect` before pushing diffs that touch config / env.
- `semgrep --config auto` for SAST when security is on the table.
- `lizard` before claiming "this function is fine".

**Performance**
- Never claim "X is faster than Y" without `hyperfine`. "Feels faster" is not a benchmark.

**Unknown codebase**
- `repomix --compress` to pack for context, or `graphify build .` for a queryable code graph. Don't read 50 files one by one.

**Library / API docs**
- `ctx7` (Context7) for up-to-date library docs. Never hallucinate API signatures.
- `tvly` (Tavily) for web research beyond training cutoff.

**Browser automation**
- `playwright-cli` for any browser interaction.

**Databases**
- `usql` for ad-hoc queries — Postgres / MySQL / SQLite / 50+ others.

## Behavioral rules

- Read `AGENTS.md` and `justfile` (if present) before suggesting commands in a project.
- Use the project's configured linter/formatter (from `AGENTS.md`), not your default.
- Never propose `rm -rf`, `git reset --hard`, `git push --force`, or `git clean -fd` without explicit confirmation.
- Don't write comments that restate code. Only comment on *why*.
- Conventional commits: `type(scope): subject` — feat / fix / docs / refactor / test / chore.
- Never amend a published commit; create a new one.

## Fulcrum slash commands

- `/adr <one-line>` — capture an architectural decision.
- `/wrap` — session-end extraction.
- `/promote` — review pending-global staging.
- `/in-flight <one-line>` — capture mid-thought state.
- `/postmortem <slug>` — two-document post-mortem.
- `/plan-to-plane` — convert a plan into Plane issues.
