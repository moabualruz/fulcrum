# Fulcrum global rules

> Behavioral rules — what the agent *does*, not knowledge. Distributed cross-agent by `fulcrum install` via sentinel splice; see the fulcrum project `AGENTS.md` for distribution mechanics. Each rule states WHEN it applies, WHY (the failure mode it prevents), and INSTEAD-OF what. Target: under 200 lines [source: https://code.claude.com/docs/en/memory] — bloated rules get silently ignored.

## 0. Precedence (read first)

- **YOU MUST read `AGENTS.md` / `CLAUDE.md` / `justfile` / `.mise.toml` / `.envrc` / `pyproject.toml` / `package.json` before suggesting any command.** Project config wins; the defaults below apply only when the project has no opinion. Failure mode: recommending `pytest` in a repo whose `justfile` runs `just test` (which sets env, fixtures, coverage flags). [source: https://code.claude.com/docs/en/memory]
- The project's configured linter / formatter / test runner overrides your default. If `pyproject.toml` declares `ruff`, do not propose `flake8`; if `biome.json` exists, do not propose `prettier`. Failure mode: introducing a second toolchain that fights the first in CI.
- Use `--json` / `--format json` / `-o json` whenever a CLI supports it; parse with `jq`/`yq`. Failure mode: brittle `grep`/`awk` pipelines that break on whitespace or i18n.

## 0b. Output style (caveman ultra)

- Caveman ultra always-on default. Drop articles, hedging, pleasantries; keep all code, paths, commands, URLs, versions, tool names verbatim. Why: ~75% token cut without losing technical substance. Instead-of: verbose prose with "you should", "I would recommend", "let me explain".
- Verbatim preservation: code blocks, file paths, commands, URLs, version numbers, tool names, headings, error messages quoted exactly. Why: caveman rewrites break copy-paste and corrupt grep targets. Instead-of: abbreviated or paraphrased code samples.
- Opt-out: user says `normal mode` or `stop caveman` — drop caveman for that session only. Resume next session.
- Auto-clarity: drop caveman for security warnings, irreversible-action confirmations (`rm -rf`, `--force` push, data deletion), multi-step sequences where order matters. Resume after.

## 1. Search & discovery

- `rg <pattern>` — when grepping a tree. Instead of `grep -r`, `find ... | xargs grep`. Why: respects `.gitignore`, ~10× faster, no surprise binary matches. Trigger: "find all callers of foo".
- `fd <pattern>` — when listing files by name/glob. Instead of `find -name`. Why: regex by default, parallel, ignores VCS junk. Trigger: "list every `*.test.ts` under src/".
- `ast-grep` (`sg`) — when the target is **code shape**, not text. Instead of `rg` for structural patterns. Why: `rg "function foo"` matches comments and strings; `sg` matches the AST node. Trigger: "rename every `useState(0)` call to `useState(initial)`".
- `bat <file>` — when reading code for a human. Instead of `cat` for display. Why: line numbers + syntax = fewer "which line?" round-trips. Use plain `cat` only for piping.
- `eza -l` / `eza --tree` — when listing a directory for orientation. Instead of `ls -la`, `tree`. Why: gitignore-aware, git-status column.
- `z <fragment>` — when `cd`ing to a previously-visited path. Instead of typing the full path. Why: a wrong `cd` followed by a wrong relative path is a common source of "file not found" loops.
- `fzf --filter <q>` — for non-interactive selection from a piped list. Instead of `grep -F` against a literal. Why: fuzzy match handles minor typos and ranks by relevance. Skip the interactive UI in agent shells (no TTY); always use `--filter` mode.

## 2. HTTP & APIs

- `xh <url>` (with `--check-status`) — for any JSON API. Instead of `curl`. Why: sane defaults, JSON pretty-print, non-zero exit on 4xx/5xx (curl exits 0 on HTTP errors — silent failure).
- `gh` — for **anything** GitHub: issues, PRs, runs, releases, API. Instead of the web UI or raw `curl https://api.github.com`. Why: handles auth, pagination, and rate limits; unauth API hits 60 req/hr.

## 3. Data manipulation

- `jq` — for any JSON read/transform. Instead of `grep '"key"'`, `python -c "import json..."`. Why: a `grep` on JSON breaks on key reordering, nested values, escaped quotes.
- `yq` — for YAML / TOML / XML. Instead of `sed` on a `yaml`. Why: indentation-sensitive formats round-trip cleanly; line-based tools corrupt them.
- `sd <pat> <rep> <file>` — for in-place text replacement. Instead of `sed -i`. Why: GNU vs BSD `sed -i` syntax differs (the `''` arg); `sd` works the same on macOS and Linux.

## 4. Diff & version

- `difft` (difftastic) — when reviewing a non-trivial diff. Instead of `git diff` for review. Why: syntax-aware diff hides reformatting noise (renamed var, reflowed JSX) so real changes stand out.
- `git log --oneline -20` (or `--since=...`) — when surveying history. Instead of bare `git log`. Why: dumping full log fills context with body text you won't read.
- `git-cliff` — when generating a CHANGELOG. Instead of writing one by hand. Why: hand-written changelogs go stale on the next release; `git-cliff` reads conventional commits and is reproducible.
- Conventional commits: `type(scope): subject` (feat|fix|docs|refactor|test|chore|perf|build|ci). Why: `git-cliff`, semantic-release, and most CI gates parse this format. A non-conforming commit silently breaks release tooling.
- **Never amend or force-push a commit that has been pushed to a shared branch.** Create a new commit. Why: `--force` rewrites history other clones depend on; recovery requires every collaborator to reset.

## 5. Project runners & environment

- `just <recipe>` — when a `justfile` exists. Instead of guessing `npm run X` / `make Z` / `python -m ...`. Why: recipes encode env vars, working dirs, and tool versions; reinventing them silently skips setup.
- `mise install` then `mise exec -- <cmd>` — when `.mise.toml` / `.tool-versions` exists. Instead of using whatever's on `$PATH`. Why: "works on my machine" is almost always a Node/Python/Go version mismatch.
- Trust `direnv` — when `.envrc` exists, run `direnv allow` and let it set env. Instead of exporting vars manually. Why: manual `export FOO=...` drifts from what CI uses.

## 6. Security & quality

- `gitleaks detect --staged` — before any commit that touches `.env*`, `config/`, `secrets/`, CI files, or adds a new dependency. Why: a leaked key in git history requires rotation + force-push of every clone; cheaper to catch at staging.
- `semgrep --config auto` — when a change touches auth, deserialization, SQL, or shell-out. Instead of "looks fine to me". Why: catches OWASP-class bugs (SSRF, SQLi, unsafe `eval`) that pass review and tests.
- `lizard <file>` — before claiming "this function is fine" in a refactor PR. Why: cyclomatic complexity and length thresholds give a defensible number instead of a vibe.

## 7. Performance

- `hyperfine --warmup 3 'A' 'B'` — whenever you claim X is faster than Y. Instead of "feels faster" or one `time` run. Why: a single `time` measurement is dominated by cold-cache and noise; hyperfine reports mean ± stddev with warmup.

## 7b. Iteration & interactive processes

- `watchexec -e <ext> -- <cmd>` — when iterating with auto-rerun (test on save, rebuild on change). Instead of `while true; do …; sleep 1; done`. Why: filesystem events are immediate and don't burn CPU on polling.
- `tmux new -d -s <name>` + `tmux send-keys` — when driving a stateful interactive process (psql, ipython, gdb, a dev server you need to feed commands to). Instead of `bash -c 'echo … | tool'` or `expect`. Why: REPLs need persistent stdin/stdout; one-shot pipes lose the session. [source: obra/superpowers-lab — using-tmux-for-interactive-commands]

## 8. Codebase exploration

- `ctags -R` — when navigating a large C/C++/Go/Rust tree without LSP. Instead of repeated `rg` for symbols. Why: `ctags` indexes definitions; `rg` finds every textual match including comments and strings.

## 9. Library & external knowledge

- `ctx7 <library>` (Context7) — before writing code against any third-party library. Instead of recalling the API from training. Why: APIs drift between minor versions; a hallucinated signature compiles into a runtime `AttributeError`.
- `tvly <query>` (Tavily) — for facts dated after the model cutoff (errors with new error codes, recently shipped features, breaking changes). Instead of guessing. Why: confidently wrong is worse than "let me check".

## 10. Browser & databases

- `playwright-cli` — for any browser interaction (scrape, fill form, screenshot, login flow). Instead of `curl` against an SPA. Why: SPAs render client-side; `curl` returns an empty `<div id="root">`.
- `usql <dsn>` — for ad-hoc SQL across Postgres / MySQL / SQLite / 50+ others. Instead of installing each native client. Why: one DSN format and one history file across every DB you touch this week.

## 11. Behavioral meta-rules

- **Comment WHY, never WHAT.** When the choice has a non-local reason. Instead of restating the next line in English. Why: restated comments rot — the code changes, the comment lies.
- **Ask before destructive ops.** `rm -rf`, `git reset --hard`, `git push --force`, `git clean -fdx`, `DROP TABLE`, `TRUNCATE`, `kubectl delete`, `terraform destroy` require explicit user confirmation in the same turn — even in auto/yolo mode. Why: irreversible without backups; "I assumed you wanted..." is not a recovery plan.
- **Prefer editing existing files to creating new ones.** When a fix can land in an existing module. Instead of a new `utils2.py`. Why: parallel utilities diverge; the next reader has to learn both.
- **Don't claim done without verification.** Run the project's test/lint command before saying "done". Instead of "this should work". Why: model-graded "looks correct" is the #1 source of regressions. [source: https://code.claude.com/docs/en/best-practices]
- **Prune this file when a rule stops mattering.** When you notice a rule being followed reflexively for weeks, or being ignored, delete it. Why: every line here is loaded into every session — dead rules crowd out live ones. Anthropic's test: "Would removing this cause Claude to make mistakes?" If no, cut it.

## 12. Vendor-tool behavioral rules

Rule text owned here; same content spliced into every agent via FULCRUM sentinel block. Vendor installers may write hooks in settings files (PreToolUse, `.codex/hooks.json`, etc.) — those stay. Duplicate rule TEXT written outside the sentinel block is stripped by `fulcrum install` automatically.

- **ast-grep** — (TBD: vendor skill installs a slash-command trigger; no separate rules-file behavioral rule published.)
- **caveman** — (rule is §0b above: always-on caveman ultra; vendor config lock in `~/.config/caveman/config.json`.)
