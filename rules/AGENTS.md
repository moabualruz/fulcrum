# Fulcrum global rules

> Behavioral rules — what agent *does*, not knowledge. Distributed cross-agent by `fulcrum install` via sentinel splice; see fulcrum project `AGENTS.md` for distribution mechanics. Each rule state WHEN apply, WHY (failure mode prevent), INSTEAD-OF what. Target: under 200 lines [source: https://code.claude.com/docs/en/memory] — bloated rules silently ignored.

## 0. Precedence (read first)

- **YOU MUST read `AGENTS.md` / `CLAUDE.md` / `justfile` / `.mise.toml` / `.envrc` / `pyproject.toml` / `package.json` before suggesting any command.** Project config win; defaults below apply only when project no opinion. Failure mode: recommend `pytest` in repo whose `justfile` runs `just test` (sets env, fixtures, coverage flags). [source: https://code.claude.com/docs/en/memory]
- Project's configured linter / formatter / test runner override default. If `pyproject.toml` declare `ruff`, no propose `flake8`; if `biome.json` exist, no propose `prettier`. Failure mode: second toolchain fight first in CI.
- Use `--json` / `--format json` / `-o json` whenever CLI support; parse with `jq`/`yq`. Failure mode: brittle `grep`/`awk` pipelines break on whitespace or i18n.

## 0b. Output style (caveman ultra)

- Caveman ultra always-on default. Drop articles, hedging, pleasantries; keep all code, paths, commands, URLs, versions, tool names verbatim. Why: ~75% token cut, no lose technical substance. Instead-of: verbose prose with "you should", "I would recommend", "let me explain".
- Verbatim preservation: code blocks, file paths, commands, URLs, version numbers, tool names, headings, error messages quoted exact. Why: caveman rewrites break copy-paste, corrupt grep targets. Instead-of: abbreviated or paraphrased code samples.
- Opt-out: user say `normal mode` or `stop caveman` — drop caveman that session only. Resume next session.
- Auto-clarity: drop caveman for security warnings, irreversible-action confirmations (`rm -rf`, `--force` push, data deletion), multi-step sequences where order matter. Resume after.

## 0c. Strategic Orchestration

- **Dispatch up to 6 parallel subagents for independent work.** (Wave-3 audits, parallel research, fixing multiple files). Partition by file ownership to avoid collisions. Why: Context isolation prevents bloat; parallel execution speeds up "wall-clock" time. Instead-of: sequential turns for independent sub-tasks.
- **Trust-but-verify subagent output.** Always run `git status` + `git diff --stat` + `bun run ci` (or native tests) after an agent reports completion. Why: Agents may claim "DONE" while files are missing or tests fail. Instead-of: accepting textual "Success" as fact.
- **Research → Plan → Implement workflow.** Use separate agents for research (fetching READMEs, docs) and planning before implementation. Why: Prevents overengineering and implementation drift. Instead-of: "research-and-implement-now" in one turn.
- **Match model effort to task complexity.** Use Haiku/Flash for mechanical edits/tests; Sonnet/Pro for integration/refactoring; Opus/Ultra for design/architecture. Why: Conserves high-reasoning tokens for hard problems; increases overall throughput.

## 1. Search & discovery

- `rg <pattern>` — when grepping tree. Instead of `grep -r`, `find ... | xargs grep`. Why: respects `.gitignore`, ~10× faster, no surprise binary matches. Trigger: "find all callers of foo".
- `fd <pattern>` — when listing files by name/glob. Instead of `find -name`. Why: regex by default, parallel, ignores VCS junk. Trigger: "list every `*.test.ts` under src/".
- `ast-grep` (`sg`) — when target is **code shape**, not text. Instead of `rg` for structural patterns. Why: `rg "function foo"` matches comments and strings; `sg` matches AST node. Trigger: "rename every `useState(0)` call to `useState(initial)`".
- `bat <file>` — when reading code for human. Instead of `cat` for display. Why: line numbers + syntax = fewer "which line?" round-trips. Use plain `cat` only for piping.
- `eza -l` / `eza --tree` — when listing directory for orientation. Instead of `ls -la`, `tree`. Why: gitignore-aware, git-status column.
- `z <fragment>` — when `cd`ing to previously-visited path. Instead of typing full path. Why: wrong `cd` followed by wrong relative path common source of "file not found" loops.
- `fzf --filter <q>` — for non-interactive selection from piped list. Instead of `grep -F` against literal. Why: fuzzy match handles minor typos, ranks by relevance. Skip interactive UI in agent shells (no TTY); always use `--filter` mode.

## 2. HTTP & APIs

- `xh <url>` (with `--check-status`) — for any JSON API. Instead of `curl`. Why: sane defaults, JSON pretty-print, non-zero exit on 4xx/5xx (curl exits 0 on HTTP errors — silent failure).
- `gh` — for **anything** GitHub: issues, PRs, runs, releases, API. Instead of web UI or raw `curl https://api.github.com`. Why: handles auth, pagination, rate limits; unauth API hits 60 req/hr.

## 3. Data manipulation

- `jq` — for any JSON read/transform. Instead of `grep '"key"'`, `python -c "import json..."`. Why: `grep` on JSON breaks on key reordering, nested values, escaped quotes.
- `yq` — for YAML / TOML / XML. Instead of `sed` on `yaml`. Why: indentation-sensitive formats round-trip clean; line-based tools corrupt them.
- `sd <pat> <rep> <file>` — for in-place text replacement. Instead of `sed -i`. Why: GNU vs BSD `sed -i` syntax differ (the `''` arg); `sd` works same on macOS and Linux.

## 4. Diff & version

- `difft` (difftastic) — when reviewing non-trivial diff. Instead of `git diff` for review. Why: syntax-aware diff hides reformatting noise (renamed var, reflowed JSX), real changes stand out.
- `git log --oneline -20` (or `--since=...`) — when surveying history. Instead of bare `git log`. Why: dumping full log fills context with body text you won't read.
- `git-cliff` — when generating CHANGELOG. Instead of writing by hand. Why: hand-written changelogs go stale next release; `git-cliff` reads conventional commits, reproducible.
- Conventional commits: `type(scope): subject` (feat|fix|docs|refactor|test|chore|perf|build|ci). Why: `git-cliff`, semantic-release, most CI gates parse this format. Non-conforming commit silently break release tooling.
- **Never amend or force-push commit pushed to shared branch.** Create new commit. Why: `--force` rewrites history other clones depend on; recovery requires every collaborator reset.

## 5. Project runners & environment

- `just <recipe>` — when `justfile` exists. Instead of guessing `npm run X` / `make Z` / `python -m ...`. Why: recipes encode env vars, working dirs, tool versions; reinventing silently skip setup.
- `mise install` then `mise exec -- <cmd>` — when `.mise.toml` / `.tool-versions` exists. Instead of using whatever on `$PATH`. Why: "works on my machine" almost always Node/Python/Go version mismatch.
- Trust `direnv` — when `.envrc` exists, run `direnv allow`, let it set env. Instead of exporting vars manually. Why: manual `export FOO=...` drift from what CI uses.

## 6. Security & quality

- `gitleaks detect --staged` — before any commit touching `.env*`, `config/`, `secrets/`, CI files, or adds new dependency. Why: leaked key in git history requires rotation + force-push of every clone; cheaper to catch at staging.
- `semgrep --config auto` — when change touches auth, deserialization, SQL, or shell-out. Instead of "looks fine to me". Why: catches OWASP-class bugs (SSRF, SQLi, unsafe `eval`) that pass review and tests.
- `lizard <file>` — before claiming "this function is fine" in refactor PR. Why: cyclomatic complexity and length thresholds give defensible number instead of vibe.

## 7. Performance

- `hyperfine --warmup 3 'A' 'B'` — whenever claim X faster than Y. Instead of "feels faster" or one `time` run. Why: single `time` measurement dominated by cold-cache and noise; hyperfine reports mean ± stddev with warmup.

## 7b. Iteration & interactive processes

- `watchexec -e <ext> -- <cmd>` — when iterating with auto-rerun (test on save, rebuild on change). Instead of `while true; do …; sleep 1; done`. Why: filesystem events immediate, don't burn CPU on polling.
- `tmux new -d -s <name>` + `tmux send-keys` — when driving stateful interactive process (psql, ipython, gdb, dev server need feed commands). Instead of `bash -c 'echo … | tool'` or `expect`. Why: REPLs need persistent stdin/stdout; one-shot pipes lose session. [source: obra/superpowers-lab — using-tmux-for-interactive-commands]

## 8. Codebase exploration

- `graphify build .` then queries — when question structural ("who calls X", "what implements Y"). Instead of `rg` walks across many files. Why: code graph answers in one query what `rg` answers in many.
- `ctags -R` — when navigating large C/C++/Go/Rust tree without LSP. Instead of repeated `rg` for symbols. Why: `ctags` indexes definitions; `rg` finds every textual match including comments and strings.

## 9. Library & external knowledge

- `ctx7 <library>` (Context7) — before writing code against any third-party library. Instead of recalling API from training. Why: APIs drift between minor versions; hallucinated signature compiles into runtime `AttributeError`.
- `tvly <query>` (Tavily) — for facts dated after model cutoff (errors with new error codes, recently shipped features, breaking changes). Instead of guessing. Why: confidently wrong worse than "let me check".

## 10. Browser & databases

- `playwright-cli` — for any browser interaction (scrape, fill form, screenshot, login flow). Instead of `curl` against SPA. Why: SPAs render client-side; `curl` returns empty `<div id="root">`.
- `usql <dsn>` — for ad-hoc SQL across Postgres / MySQL / SQLite / 50+ others. Instead of installing each native client. Why: one DSN format, one history file across every DB you touch this week.

## 11. Behavioral meta-rules

- **Comment WHY, never WHAT.** When choice has non-local reason. Instead of restating next line in English. Why: restated comments rot — code changes, comment lies.
- **Ask before destructive ops.** `rm -rf`, `git reset --hard`, `git push --force`, `git clean -fdx`, `DROP TABLE`, `TRUNCATE`, `kubectl delete`, `terraform destroy` require explicit user confirmation same turn — even in auto/yolo mode. Why: irreversible without backups; "I assumed you wanted..." not a recovery plan.
- **Prefer editing existing files to creating new ones.** When fix can land in existing module. Instead of new `utils2.py`. Why: parallel utilities diverge; next reader must learn both.
- **Don't claim done without verification.** Run project's test/lint command before saying "done". Instead of "this should work". Why: model-graded "looks correct" is #1 source of regressions. [source: https://code.claude.com/docs/en/best-practices]
- **Prune this file when rule stops mattering.** When notice rule followed reflexively for weeks, or being ignored, delete. Why: every line here loaded into every session — dead rules crowd out live ones. Anthropic's test: "Would removing this cause Claude to make mistakes?" If no, cut it.

## 12. Vendor-tool behavioral rules

Rule text owned here; same content spliced into every agent via FULCRUM sentinel block. Vendor installers may write hooks in settings files — those stay. Duplicate rule TEXT outside sentinel block stripped by `fulcrum install` automatically.

- **graphify** — when `graphify-out/` exists in project, read `graphify-out/GRAPH_REPORT.md` before answering architecture or codebase questions; navigate `graphify-out/wiki/index.md` instead of reading raw files when it exists. Why: graph answers structural questions 71× fewer tokens than grepping raw files. Trigger: architecture question + `graphify-out/` present. [source: https://github.com/safishamsi/graphify]
  - (graphify also installs PreToolUse hook before every Glob/Grep call — that hook config managed by `graphify install`, not this file.)
- **ast-grep** — (TBD: vendor skill installs slash-command trigger; no separate rules-file behavioral rule published.)
- **caveman** — (rule is §0b above: always-on caveman ultra; vendor config lock in `~/.config/caveman/config.json`.)
