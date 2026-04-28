# Capability Layer

> What agent can do. CLI tools output JSON, paired with skills (see [skills.md](skills.md)).

## 1. Foundation — install once per machine

```bash
brew install \
  ripgrep fd fzf jq yq bat sd eza zoxide \
  xh gh just mise direnv \
  tmux difftastic \
  universal-ctags hyperfine watchexec \
  ast-grep gitleaks git-cliff
```

```bash
pip install semgrep lizard
npm install -g repomix ctx7 @playwright/cli
uv tool install graphifyy tavily-cli
```

| Tool | Replaces | Agent use |
|---|---|---|
| `rg` | grep | Fast code search — agents run 10+ searches per loop, speed matters |
| `fd` | find | File discovery |
| `jq` / `yq` | manual parsing | JSON/YAML in every pipeline |
| `xh` | curl | HTTP/API calls, readable JSON output by default |
| `gh` | browser | PRs, issues, CI status, code search |
| `just` | make | Project task runner — AGENTS.md documents just recipes |
| `mise` | nvm/pyenv/rbenv | Runtime version mgmt, kills "wrong version" failures |
| `direnv` | manual exports | Per-directory env vars, transparent to agent |
| `tmux` | — | Required for Claude Code multi-agent parallel sessions |
| `difftastic` | git diff | Syntax-aware structural diff — better signal for agents reading changes |
| `bat` | cat | File content with syntax highlighting |
| `sd` | sed | Reliable text replacement |
| `eza` | ls | File listings with metadata |
| `fzf` | — | Fuzzy selection in shell pipelines |
| `zoxide` | cd | Smart directory jump |
| `hyperfine` | time | Statistical benchmarking, JSON output |
| `watchexec` | polling | Re-run on file change |
| `universal-ctags` | — | Symbol index — where X defined, all languages |
| `gitleaks` | — | Secrets in git history |
| `git-cliff` | — | Changelog from conventional commits |

## 2. Code Intelligence

| Tool | Install | Provides |
|---|---|---|
| `ast-grep` | `brew install ast-grep` | Structural AST pattern search + skill |
| `repomix` | `npm install -g repomix` | Pack repo into context + skill |
| `graphify` | `uv tool install graphifyy` | Code knowledge graph + skill |
| `semgrep` | `pip install semgrep` | SAST scan, 1000+ rules, no account, local |
| `lizard` | `pip install lizard` | Cyclomatic complexity + function length, JSON output, 27 languages |

## 3. Web + Docs

| Tool | Install | Provides |
|---|---|---|
| `ctx7` | `npm install -g ctx7` | Up-to-date library/API docs + skill |
| `tvly` | `uv tool install tavily-cli` | Web search + research + skill |
| `playwright-cli` | `npm install -g @playwright/cli && npx playwright install chromium` | Browser automation + skill |

## 4. Services — install when project needs

| Tool | Install | Covers |
|---|---|---|
| `gws` | see gws docs | Gmail, Google Drive, Google Calendar |
| `hcloud` | `brew install hcloud` | Hetzner Cloud — servers, volumes, firewalls, networks, load balancers (`-o json` on all commands) |
| `wrangler` | `npm install -g wrangler` | Cloudflare Workers, Pages, D1, KV, R2 |
| `flarectl` | `go install github.com/cloudflare/cloudflare-go/cmd/flarectl@latest` | Cloudflare DNS + zone mgmt (no JSON — use `xh` + Cloudflare REST API for scripted DNS ops) |
| `usql` | `brew install usql` | All databases — Postgres, MySQL, SQLite, 50+ others |

## 5. Language-specific — install per project, not globally

| Language | Formatter | Linter / Analyzer | Security |
|---|---|---|---|
| Python | `ruff format` (`pip install ruff`) | `ruff check --output-format=json` | `pip-audit --format=json` |
| JS/TS | `biome format --write` (`npm i -g @biomejs/biome`) | `biome check --reporter=json` + `knip --reporter=json` | — |
| Rust | `rustfmt` (built-in) | `clippy` (built-in) | `cargo-deny check` (`cargo install cargo-deny`) |
| Go | `gofmt` (built-in) | `golangci-lint run --out-format=json` (`brew install golangci-lint`) | — |
| PHP | `php-cs-fixer fix --format=json` | `phpstan --error-format=json` | `composer audit --format=json` |
| Kotlin | `ktlint --format` (`brew install ktlint`) | `ktlint --reporter=json` | — |
| Java | `google-java-format --replace` (`brew install google-java-format`) | `pmd check --format json` (`brew install pmd`) | `spotbugs -sarif` (`brew install spotbugs`) |
| Dart/Flutter | `dart format` | `dart analyze` (no JSON — parse exit code) | `osv-scanner --lockfile pubspec.lock --format=json` (`brew install osv-scanner`) |