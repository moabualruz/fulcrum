# CLI + TUI Design for Power-User Workbenches — Research

> Deep-web research feeding Fulcrum's CLI (`fulcrum …`) and TUI (`fulcrum tui`) redesign. Cluster: power-user operator tooling — what gh/stripe/vercel/wrangler/flyctl/cargo/bun/kubectl/heroku do at the command line, and what k9s/lazygit/tig/btop/fzf/Helix/gh-dash do in the terminal. Every recommendation grounded in cited prior art.

---

## 1. CLI cluster — patterns by tool

### 1.1 `gh` (GitHub CLI)

**Subcommand grouping — flat noun-first, two-level hub-and-spoke.** Top-level nouns: `gh auth`, `gh repo`, `gh issue`, `gh pr`, `gh release`, `gh workflow`, `gh codespace`, `gh project`, `gh search`, `gh variable`, `gh secret`, `gh extension`, plus the verbs `gh status`, `gh completion`, `gh help`. Each noun owns its own verbs (`gh pr create`, `gh pr view`, `gh pr checks`, `gh pr checkout`). Source: <https://cli.github.com/manual/>.

**Flag conventions — universal `--json`, `--jq`, `--template`, `--web`, `-R/--repo`.** Quote: "By default, the result of `gh` commands are output in line-based plain text format. Some commands support passing the `--json` flag, which converts the output to JSON format." `--json` requires a comma-separated field list; omit the argument and the CLI prints possible field names (a remarkable bit of discoverability — the flag is its own documentation). `--jq` "requires a string argument in jq query syntax, and will only print those JSON values which match the query" and "the `jq` utility need not be installed locally." `--template` accepts Go template syntax with helper functions including `autocolor`, `color`, `join`, `pluck`, `tablerow`, `tablerender`, `timeago`, `timefmt`, `truncate`, `hyperlink`, plus Sprig string helpers. Source: <https://cli.github.com/manual/gh_help_formatting>.

**Output modes.** Plain text (default, TTY-aware coloring), `--json` machine, `--template` shaped, `--web` opens browser instead of returning data. The `--web` flag is unusual and worth copying — for any view command, "I'd rather see this in the dashboard" is a one-flag escape hatch.

**Error recovery / next-action copy.** First-run installs print "Run `gh auth login` to authenticate with your GitHub account" — explicit next command, not "you must authenticate." Enterprise hosts: "set the `GH_HOST` environment variable." `gh auth status` is the doctor surface.

**Completion.** `gh completion -s {bash|zsh|fish|powershell}`. Install lines documented per shell — Bash uses `eval "$(gh completion -s bash)"` in `~/.bash_profile`, Zsh writes to `/usr/local/share/zsh/site-functions/_gh` with `autoload -U compinit; compinit -i`, Fish writes to `~/.config/fish/completions/gh.fish`, PowerShell uses `Invoke-Expression -Command $(gh completion -s powershell | Out-String)`. Source: <https://cli.github.com/manual/gh_completion>.

### 1.2 `stripe` (Stripe CLI)

Top-level page is sparse; the actionable pattern is well-known: `stripe login` (browser OAuth, saves API key), `stripe listen --forward-to localhost:4242/webhook` for long-running webhook forwarding (log-tail UX, not progress bar), `stripe trigger <event>` for synthetic events, `stripe logs tail`, `stripe events resend`. Source: <https://docs.stripe.com/stripe-cli>. The pattern worth copying: **`listen` is a verb that streams forever**, with prominent "Ready! Your webhook signing secret is whsec_…" first-frame so the user knows it's alive even when nothing is happening.

### 1.3 `vercel`

**Massive flat-but-grouped surface.** Vercel exposes ~50+ top-level commands. Categories visible from the manual: deployment (`deploy`, `dev`, `build`, `redeploy`, `rollback`, `promote`, `bisect`), inspection (`logs`, `inspect`, `list`, `httpstat`, `activity`, `metrics`), resources (`alias`, `dns`, `domains`, `certs`, `env`, `flags`, `routes`, `redirects`, `cache`, `blob`), account (`login`, `logout`, `whoami`, `switch`, `teams`, `target`, `usage`, `contract`), integration (`integration`, `integration-resource`, `install`, `mcp`, `marketplace`), meta (`guidance`, `telemetry`, `help`). Source: <https://vercel.com/docs/cli>.

**Project linking — `vercel link`.** The CLI binds to a project via a local `.vercel/` directory; subsequent commands are project-scoped without `--project`. **Default command is implicit:** running bare `vercel` = `vercel deploy`. (clig.dev warns against this; Vercel does it anyway because deploy is the dominant action.)

**Token handling.** "Set the `VERCEL_TOKEN` environment variable" is recommended over `--token` because "it avoids exposing the token in command-line arguments, which can be visible in process lists and logs. If both are provided, the `--token` flag takes precedence." Direct echo of clig.dev's "Never accept secrets in flags."

**`vercel logs` is the cleanest log UX in this cluster.** Source: <https://vercel.com/docs/cli/logs>. Flags worth copying verbatim:

- `--follow` / `-f` to stream (capped at 5 min unless re-invoked — bounded long-running).
- `--json` / `-j` outputs **JSONL** (one JSON object per line) — pipeable to `jq`.
- `--expand` / `-x` toggles truncated vs full message.
- `--limit` / `-n` (default 100).
- `--level error --level warning` — multi-value filter.
- `--status-code 5xx` — wildcard support.
- `--source edge-function --source serverless` — repeatable.
- `--since 1h` and `--until 1h` accept both ISO 8601 and relative.
- `--query "timeout"` full-text.
- `--branch` with `--no-branch` to opt out of git-branch auto-detect.

The mix of repeatable enum flags + relative-time + JSONL is the canonical log-CLI pattern. Fulcrum's `runs feed` should clone it.

### 1.4 `wrangler` (Cloudflare Workers)

**Two-level noun verb.** Pattern: `wrangler <COMMAND> <SUBCOMMAND> [PARAMETERS] [OPTIONS]`. Top-level groups: Browser, Certificates, Containers, D1, General, Hyperdrive, KV, Pages, Pipelines, Queues, R2, Secrets Store, Tunnel, Vectorize, VPC, Workers, Workers for Platforms, Workflows — 17 categories. Notable scoped commands: `wrangler deploy`, `wrangler dev`, `wrangler versions`, `wrangler tail` (log stream). Source: <https://developers.cloudflare.com/workers/wrangler/commands/>. Wrangler is implemented on Ink (React-for-CLI) — the developer-facing TUI bits (`wrangler dev`'s overlay) are Ink components.

### 1.5 `flyctl`

**App-scoped via `fly.toml`.** Groups: app management (`fly launch`, `fly deploy`, `fly apps`), monitoring (`fly logs`, `fly status`, `fly releases`), infrastructure (`fly machine`, `fly volumes`, `fly ips`), security (`fly secrets`, `fly ssh`, `fly auth`). Quote: "You'll use the `fly` command to create and deploy apps, manage Machines and volumes, configure networking, and more." Like Vercel, the local directory is the implicit scope; `fly.toml` is the project marker. Source: <https://fly.io/docs/flyctl/>.

### 1.6 `cargo` / `bun` / `pnpm` — task runners

**`cargo` standard color env.** `--color always|auto|never`, `CARGO_TERM_COLOR` env. Output modes include `--message-format json` for structured build output and `--message-format short` for terse. Network-aware flags `--offline`, `--frozen`, `--locked` make CI reproducible. Groups: General / Build / Manifest / Package / Publishing / Report. Source: <https://doc.rust-lang.org/cargo/commands/index.html>.

**`bun` task runner pattern.** Source: <https://bun.com/docs/cli>. Pattern: `bun <script-from-package.json>` shadows top-level subcommands (`bun run`, `bun install`, `bun test`, `bun build`, `bun x`, `bun init`, `bun create`). Bun added `--watch` / `--hot` for dev loops and `--print` for REPL-like output of a single expression. Error messages prioritize a clear "what failed" line followed by a code snippet with column markers — Rust influence.

### 1.7 `kubectl`

**Verb-noun grammar; `--output` is the universal format switch.** Syntax: `kubectl [command] [TYPE] [NAME] [flags]`. Verbs: `get`, `describe`, `apply`, `delete`, `edit`, `exec`, `logs`. Source: <https://kubernetes.io/docs/reference/kubectl/>.

`--output={json|yaml|jsonpath|table|wide|name|go-template|custom-columns}` is the most copied output-mode contract in CLI design. `-o wide` adds extra columns to the same table. `-o jsonpath='{.items[*].metadata.name}'` is an inline templating language.

Other key patterns: `--watch` / `-w` for streaming (`kubectl get pods --watch`), `--namespace`/`-n` and `--context` are universal across every subcommand, `-v=2` for verbosity level (numeric, not boolean), completion via `kubectl completion {bash|zsh|fish|powershell}`. Resource types accept singular, plural, or short alias (`po`, `svc`, `deploy`) — a power-user shortcut.

### 1.8 `doctl` / `heroku`

**`heroku apps:create` — colon-separated namespace.** From the 12-factor CLI article: "Be clear about subcommands — Use colons (e.g., `heroku domains:add`) to separate topic-commands from subcommands rather than spaces." Source: <https://jdxcode.medium.com/12-factor-cli-apps-dd3c227a0e46>. Heroku's CLI is config-aware: cwd's `.git` remote determines the target app (no `--app` needed). Token saved to `~/.netrc`. First-run hint: "we recommend enabling the CLI's autocomplete feature with `heroku autocomplete`." Source: <https://devcenter.heroku.com/articles/heroku-cli>. **Most modern CLIs reject the colon syntax** because it conflicts with shell history search and breaks completion semantics — but the underlying idea (topic:action) is sound; Fulcrum should keep the topic+verb shape with a space.

### 1.9 `clig.dev` (Command Line Interface Guidelines)

Anchor rules to lift directly:

- **Output streams.** "Send output to `stdout`. The primary output for your command should go to `stdout`. Send messaging to `stderr`. Log messages, errors, and so on should all be sent to `stderr`."
- **Human first, machine on demand.** "Human-readable output is paramount. Humans come first, machines second."
- **`--json` is the structured contract.** "Display output as formatted JSON if `--json` is passed."
- **`--plain` for grep/awk.** "If human-readable output breaks machine-readable output, use `--plain` to display output in plain, tabular text format for integration with tools like `grep` or `awk`."
- **Error message shape.** "Catch errors and rewrite them for humans … Think of it like a conversation, where the user has done something wrong and the program is guiding them in the right direction." Worked example: "Can't write to file.txt. You might need to make it writable by running 'chmod +w file.txt'."
- **Next-command suggestion.** "Suggest commands the user should run. When several commands form a workflow, suggesting to the user commands they can run next helps them learn."
- **Color disable conditions.** Disable on non-TTY stdout/stderr, `NO_COLOR` env non-empty, `TERM=dumb`, `--no-color` flag — and "Consider adding `MYAPP_NO_COLOR` environment variable."
- **No animations in piped output.** "If `stdout` is not an interactive terminal, don't display any animations. This will stop progress bars turning into Christmas trees in CI log output."
- **Boundary-crossing actions explicit.** "Actions crossing the boundary of the program's internal world should usually be explicit … Reading or writing files that the user didn't explicitly pass as arguments … Talking to a remote server."
- **Config precedence (highest→lowest).** Flags → shell env vars → project config (`.env`) → user config → system-wide.
- **Never read secrets from env or flags.** "Exported environment variables are sent to every process … Shell substitutions like `curl -H 'Authorization: Bearer $BEARER_TOKEN'` will leak into globally-readable process state." Use files (`--password-file`) or stdin. (Aligns with Vercel's `VERCEL_TOKEN` warning above — Vercel allows env but explicitly forbids `--token`.)
- **Responsive > fast.** "Print something to the user in <100ms. If you're making a network request, print something before you do it so it doesn't hang and look broken."
- **Ctrl-C.** "If a user hits Ctrl-C (the INT signal), exit as soon as possible. Say something immediately, before you start clean-up." Second Ctrl-C during cleanup must skip cleanup, with the user told upfront: "Gracefully stopping… (press Ctrl+C again to force)".
- **TTY detection.** `--no-input` disables every prompt. Never *require* a prompt; always allow flags/args.

Source: <https://clig.dev/>.

### 1.10 12-Factor CLI Apps

Twelve numbered rules (Heroku/jdxcode):

1. Great help is essential — in-CLI **and** web.
2. Prefer flags to args.
3. What version am I on — support `version`, `--version`, `-V`.
4. Mind the streams — stdout for output, stderr for messaging.
5. Handle things going wrong — errors carry "code, title, description, fix instructions, documentation URL."
6. Be fancy — colors/spinners/progress, off on non-TTY / `TERM=dumb` / `NO_COLOR` / `--no-color`.
7. Prompt if you can — interactive when TTY, flags always available.
8. Use tables — `--columns`, `--sort`, `--filter`, `--no-truncate`, CSV/JSON output.
9. Be speedy — 100–500ms startup target.
10. Encourage contributions.
11. Be clear about subcommands — colons (Heroku-style).
12. Follow XDG-spec — `~/.config/myapp`, `~/.local/share/myapp`, cache by OS.

### 1.11 Charm — Bubble Tea / Bubbles / Lipgloss / Ink

**Bubble Tea = Elm Architecture for Go terminal apps.** "Bubble Tea programs are comprised of a **model** that describes the application state and three simple methods on that model" — Model, Update, View. "high-performance cell-based renderer, built-in color downsampling, declarative views" with "alt screen mode, mouse tracking, cursor position" and "high-fidelity keyboard and mouse handling, native clipboard support." Source: <https://github.com/charmbracelet/bubbletea>.

**Lipgloss = CSS-in-Go for terminal.** Inline (bold, italic, underline styles like `UnderlineCurly`, `UnderlineDotted`, `UnderlineDashed`, hyperlinks), block (padding, margin, borders, width, height, alignment), borders (`NormalBorder()`, `RoundedBorder()`, multi-color gradient), joining (horizontal/vertical with alignment control), placement (`Place()`), layered cell-based compositor. Color profiles: ANSI 16, ANSI 256, TrueColor, ASCII fallback — "automatically downsampling colors to the best available profile." `HasDarkBackground()` / `LightDark()` for adaptive themes. Source: <https://github.com/charmbracelet/lipgloss>.

**Ink = React for CLIs.** "Build and test your CLI output using components." Yoga (Flexbox) for layout. `<Text>` (styled), `<Box>` (Flexbox container with padding/margin/gap), `render()`, hooks `useInput`, `useFocus`, `useApp`, `useWindowSize`. Adopters include "Claude Code", "GitHub Copilot CLI", Cloudflare Wrangler, Gatsby, Prisma, Shopify CLI. Source: <https://github.com/vadimdemedes/ink>.

---

## 2. TUI cluster — patterns by tool

### 2.1 `k9s` — colon command palette is the model

Source: <https://k9scli.io/topics/commands/>. Resource view triggered by `:<alias>⏎` — accepts "singular, plural, short-name or alias" (e.g. `:po`, `:pod`, `:pods`). Extended grammar: `:pod ns-x` (namespace), `:pod app=fred,env=dev` (label selector), `:pod @ctx1` (context). `?` = help, `Ctrl-A` = "Show all available resource alias", `:q` or `Ctrl-C` = quit, `Esc` "Bails out of view/command/filter mode". Filter via `/` (regex), `/-l label`, `/-f filter` (fuzzy), `/!filter` (invert). Per-row actions: `d`, `v`, `e`, `l` = describe / view / edit / logs. `Ctrl-D` delete (TAB+ENTER to confirm), `Ctrl-K` kill (no dialog). `:ctx`/`:ns` switch context/namespace. `:pulses` for cluster overview, `:xray <resource>` for hierarchy.

**This is the canonical "modeless command palette via `:`"** — Helix and tig use identical patterns; Fulcrum should adopt verbatim.

### 2.2 `lazygit` / `lazydocker` / `lazysql` — side-panel + chord menus

Source: <https://github.com/jesseduffield/lazygit>, <https://github.com/jesseduffield/lazydocker>. Vim-keys (`j`/`k`), `space` to stage, `x` for contextual menu, `?` help, `q` quit. Single-letter verbs in panel context: `i` interactive rebase, `s` squash, `f` fixup, `d` drop, `e` edit, `Ctrl-K`/`Ctrl-J` move commits, `Shift-C` cherry-pick, `Shift-V` paste, `b` bisect mark, `Shift-D` reset menu, `/` filter. Mouse supported. **Lazydocker quote:** "everything is one keypress away (or one click away! Mouse support FTW)" — escape-hatch for mouse users without sacrificing keyboard-first design.

### 2.3 `tig`

Source: <https://jonas.github.io/tig/doc/manual.html>. Views: Main, Log, Diff, Tree, Blob, Blame, Refs, Status, Stage, Grep, Stash. View-switch single keys: `m` main, `d` diff, `l` log, `t` tree, `f` blob, `b` blame, `r` refs, `s` status, `c` stage, `y` stash, `g` grep, `h` help. Navigation `j/k/h/l`, `PgUp/PgDn`, `Home/End`. Status bar shows: "view name, current commit ID, position (e.g., 'commit 1 of 61'), and loading time for lengthy operations." The **position indicator** is critical — power users orient by it.

### 2.4 `htop` / `btop`

Source: <https://htop.dev/>, <https://github.com/aristocratos/btop>. F-key footer is the iconic htop affordance — F1 help, F2 setup, F3 search, F4 filter, F5 tree, F6 sort, F9 kill, F10 quit. btop adds: vim keys (`h/j/k/l/g/G`), mouse on all highlighted-key UI elements, mouse scroll in lists, customizable graph symbols (`braille`, `block`, `tty`), 9 layout presets, theme system, simultaneous CPU/mem/disk-IO/network/battery/processes. **The "everything visible at once" density is the design driver** — operator dashboards live or die on it.

### 2.5 `gdu` / `dust` (disk explorers)

Source: <https://github.com/dundee/gdu>. Keybindings: `↑/k` `↓/j` move, `→/Enter/l` enter, `←/h` parent, `d` delete, `e` empty, `n`/`s` sort by name/size, `c` show counts, `?` help. **Auto-detects TTY** — "Non-interactive mode is started automatically when TTY is not detected." `-o` JSON export, `-f` re-open exported analysis, `--db` for SQLite/BadgerDB persistence. **The TTY-or-batch dual mode is the canonical hybrid CLI/TUI pattern**.

### 2.6 `fzf`

Source: <https://github.com/junegunn/fzf>. Layout flags: `--height HEIGHT[%]`, `--reverse`, `--border`, `--popup` (tmux 3.3+/Zellij 0.44+), `--preview <cmd>` ("fzf automatically starts an external process with the current line as the argument and shows the result in the split window"). Multi-select: `-m` enables it, then `TAB`/`Shift-TAB` mark. `--bind` is "a fully customizable event-action binding mechanism." **Batch mode `--filter` ranks without UI** — same binary serves both interactive and pipeline-scripted use. Fulcrum's pickers (run, task, agent, repo) should embed fzf's `--filter` mode as the default selector engine in CLI scripts and reimplement the interactive shape in TUI.

### 2.7 Helix / Vim / Neovim

Source: <https://docs.helix-editor.com/keymap.html>. Modes: Normal (default; return via `Esc`), Insert, Select. Movement `h/j/k/l/w/b/e/G`, `Ctrl-b`/`Ctrl-f` page. **Command palette `:`** (enters command mode). **Space menu** "a kludge of mappings, mostly pickers" — file open, symbol jump, diagnostics. Search `/` forward, `?` reverse, `*` use selection as pattern. Status line reflects current mode. Match mode `m`, view mode `z`, window `Ctrl-w` — chord patterns.

**Two-axis command surface — `:` for verbs, `Space` for picker — is exactly the modern TUI consensus.**

### 2.8 Charm apps (production Bubble Tea)

Source: <http://charm.land/apps/>. **Pop** — "Send emails from your terminal" (with Resend). **Mods** — "AI on the command line." **Wishlist** — "Your SSH directory" (SSH bastion + local TUI, DNS SRV + Tailscale discovery). **VHS** — "Create terminal GIFs with code!" (scripted recording — useful for Fulcrum docs/runbooks). **Soft Serve** — "The mighty, self-hostable Git server for the command line." **Glow** — "Render markdown on the command line…with pizzazz!" Used by gh-dash for PR body rendering. **Skate** — "Your personal key-value store" encrypted E2E.

### 2.9 OpenTUI

Source: <https://github.com/sst/opentui>. "A native terminal UI core written in Zig with TypeScript bindings." Provides "a component-based architecture with flexible layout capabilities." Three layers: native Zig core exposing a C ABI, `@opentui/core` imperative TS API, framework reconcilers (SolidJS, React). Powers OpenCode in production. **Fulcrum's chosen TUI lib per ADR; the React reconciler is the day-one entry point** — same mental model as Ink, but with a faster native renderer and a real reconciler upgrade path.

### 2.10 `gh-dash`

Source: <https://github.com/dlvhdr/gh-dash>. "User-defined, per-repo, PRs & issues sections" — config-driven layout. "Overridable vim-style keyboard hotkeys." YAML config file. Stack: Bubble Tea + Lipgloss + Glamour (markdown) + Cobra (CLI) + `gh` (API) + `delta` (diffs). The config-driven sections idea — declarative TUI layouts — is worth copying for Fulcrum: let users define their own dashboards in `fulcrum.toml`.

---

## 3. Synthesis — recommendations for Fulcrum

### 3.1 `fulcrum` CLI subcommand structure — organized by workflow stage

Use **two-level noun-verb hub-and-spoke** (gh/wrangler shape, not Heroku colons). Topics align to workflow stage so muscle memory matches the cognitive map.

```
# Capture
fulcrum task <list|new|view|edit|close|reopen>
fulcrum note <new|view|search|tag>
fulcrum capture <text|url|file>           # generic inbox

# Plan
fulcrum plan <list|new|view|edit|approve|reject>
fulcrum prd <new|view|sync>
fulcrum goal <list|new|view|set>

# Build
fulcrum run <new|view|cancel|retry>
fulcrum runs <feed|list|tail>             # plural reads
fulcrum agent <list|view|invoke>
fulcrum context <pack|inspect|diff>

# Review
fulcrum review <list|view|approve|request-changes>
fulcrum artifact <list|view|diff|export>

# Ship
fulcrum repo <list|status|sync>
fulcrum branch <list|switch|finish>
fulcrum pr <list|view|create>             # delegates to gh under the hood

# Operate
fulcrum doctor [--json]
fulcrum mcp <list|test|reload>
fulcrum hooks <list|enable|disable|test>
fulcrum skills <list|sync|lint>
fulcrum install [--profile minimal|rules-only|full] [--dry-run]
fulcrum compress [--check]
fulcrum config <get|set|edit|path>
fulcrum completion <bash|zsh|fish|powershell>
fulcrum version
fulcrum help [topic]
```

**Default command:** `fulcrum` alone = `fulcrum tui` (open the workbench). Discoverable and reversible — `fulcrum --help` always works (clig.dev: "Ignore any other flags and arguments that are passed—you should be able to add `-h` to the end of anything").

### 3.2 CLI JSON contract — every command echoes a stable envelope

Every command supports `--json`. The envelope is **load-bearing**: scripts depend on it.

```json
{
  "schema": "fulcrum.cli.v1",
  "trace_id": "01J7K…",
  "command": "fulcrum runs feed",
  "args": { "--watch": true, "--repo": "foo" },
  "result": { /* command-specific payload */ },
  "errors": [
    { "code": "FUL_AUTH_REQUIRED", "message": "Run `fulcrum auth login` to authenticate.", "fix": "fulcrum auth login", "doc": "https://fulcrum.dev/docs/auth" }
  ],
  "next_actions": [
    { "label": "Tail logs", "command": "fulcrum runs tail <id>" },
    { "label": "Open in TUI", "command": "fulcrum tui :run <id>" }
  ],
  "duration_ms": 142,
  "timestamp": "2026-05-17T10:00:00Z"
}
```

Mirrors clig.dev's "Catch errors and rewrite them for humans" and 12-factor's "code, title, description, fix instructions, documentation URL." `next_actions` is gh-style "suggest commands the user should run." `trace_id` is the ACP / OpenTelemetry handoff — same id surfaces in TUI status footer (3.5).

Also support `--jq` (lift from gh; bundle the gojq library) and `--template` (Go-style) for shaped output without a JSON post-processor. `--plain` strips colors and TUI characters for grep/awk.

### 3.3 CLI flag standards (cross-cutting)

| Flag | Behavior | Source |
|---|---|---|
| `--help`, `-h` | Always works, even after other flags | clig.dev |
| `--version`, `-V` | Print version | 12-factor #3 |
| `--json` / `--jq <expr>` / `--template <go-tmpl>` | Output modes | gh |
| `--plain` | Tabular text for grep/awk | clig.dev |
| `--quiet`, `-q` / `--verbose`, `-v` / `--debug` | Verbosity. `-v` counts (`-vv`) | clig.dev |
| `--no-color`, `NO_COLOR=` env, `FULCRUM_NO_COLOR=` env | Disable color | clig.dev |
| `--no-input` | Disable every prompt; fail if data missing | clig.dev |
| `--dry-run`, `-n` | Show what would happen | clig.dev |
| `--force`, `-f` | Skip confirm for moderate-danger actions | clig.dev |
| `--confirm="<name>"` | Required for severe actions (drop run, purge memory) | clig.dev |
| `--repo, -R <slug>` | Override project scope | gh |
| `--profile <name>` | Override active workspace profile | Fulcrum |
| `--output, -o {pretty|json|jsonl|yaml|table|wide|name}` | kubectl-style | kubectl |
| `--watch, -w` | Stream (until Ctrl-C) | kubectl |
| `--follow, --since 1h --until 1h --level <enum> --query <text> --limit N` | Log filter shape | vercel logs |
| `--web` | Open in browser instead of returning data | gh |

Secrets: never `--token` on argv. Accept `FULCRUM_TOKEN` env (with explicit doc that env is a process-wide leak surface) or `--token-file <path>` (preferred). See clig.dev secrets section.

Config precedence (lock to clig.dev): flags > env > project `.fulcrum.toml` / `.envrc` > `~/.config/fulcrum/config.toml` (XDG) > system `/etc/fulcrum/config.toml`.

### 3.4 CLI completion install patterns (gh-style)

```
fulcrum completion bash
fulcrum completion zsh
fulcrum completion fish
fulcrum completion powershell
```

`fulcrum install` runs `fulcrum doctor` and, when it detects a known shell, prints (not silently writes) the install line:

```
$ fulcrum install
Detected zsh. To enable completion, add to ~/.zshrc:
  source <(fulcrum completion zsh)

To install now: fulcrum completion zsh > ~/.fulcrum/completion.zsh && echo 'source ~/.fulcrum/completion.zsh' >> ~/.zshrc
```

Echoes clig.dev's "If you automatically modify configuration that is not your program's, ask the user for consent and tell them exactly what you're doing." Doctor reports completion-installed status as a row.

### 3.5 `fulcrum tui` screen list — aligned to workflow stage

OpenTUI host shell, screens implemented as React components. Each screen = a Helix-style picker plus a side detail pane.

| Stage | Screen id | Default keys (vim) |
|---|---|---|
| Capture | `:inbox` | `j`/`k` items, `Enter` open, `c` capture, `t` add tag, `n` new note |
| Plan | `:plans`, `:prds`, `:goals` | `Enter` open, `a` approve, `e` edit, `n` new |
| Build | `:runs`, `:run/<id>`, `:agents`, `:contexts` | `Enter` open, `t` tail logs, `c` cancel, `r` retry |
| Review | `:reviews`, `:artifacts`, `:diff/<id>` | `a` approve, `R` request changes, `o` open in editor |
| Ship | `:repos`, `:branches`, `:prs` | `s` sync, `o` open in browser (gh-style `--web`) |
| Operate | `:doctor`, `:mcp`, `:hooks`, `:skills`, `:logs`, `:chat` | `r` reload, `t` test, `?` help |

Plus universal navigation:

- `:` → command palette (k9s/Helix). `:run new`, `:repo sync foo`, `:agent invoke claude --task=…`.
- `/` → search/filter on current screen (k9s).
- `?` → contextual help overlay (k9s/lazygit).
- `Space` → modal picker menu (Helix space-menu) — recent / starred / "frecency" entries.
- `g g` / `G` → first/last (vim).
- `H` / `L` → previous/next screen (tab-style).
- `Ctrl-c` first press = exit current view; second press = quit ("Gracefully stopping… Ctrl+C again to force" — clig.dev).
- `q` = pop one view.

### 3.6 TUI status footer layout

Bottom strip, single line, Lipgloss-styled, monospace columns. Order (left → right):

```
[MODE] [profile] [repo:branch] [run:<id> 12/47] [agent: claude-opus-4-7] [mcp: 5/5] [trace 01J7K…] [10:42] [?] [:]
```

- **MODE** — `NORMAL`, `INSERT` (chat), `FILTER`, `COMMAND` — reverse-video tile per Helix.
- **profile** — active workspace profile (`work`, `oss`, `home`).
- **repo:branch** — current scope (Vercel/flyctl-style implicit project).
- **run:<id> 12/47** — current run id + position-of-total (tig "commit 1 of 61" pattern).
- **agent** — active agent for invocations.
- **mcp** — healthy/total MCP servers; red if degraded.
- **trace** — current `trace_id` (clickable via OSC 8 hyperlinks when terminal supports — Lipgloss `hyperlink`).
- **clock** — local time, monospace.
- **? / :** — hints that `?` opens help, `:` opens command palette.

Footer never scrolls, never disappears (htop F-key footer descendant). Color discipline: 8-color base, accent for `MODE`, semantic red only when something is wrong (mcp degraded, run failed). Adaptive light/dark via Lipgloss `HasDarkBackground()`.

### 3.7 TUI command palette — `:` modal + `Space` modeless

Two distinct surfaces, both indexed by `trace_id` (every action logs).

**`:` palette (modal, k9s/Helix).** Text-driven. Same grammar as the CLI — `:run new`, `:repo sync foo`, `:tui :runs`, `:doctor`, `:agent invoke claude`. `Esc` exits. Tab-completes against the same command tree as the CLI. **CLI ↔ TUI duality:** anything you can do in `fulcrum <cmd>` is `:<cmd>` in the TUI; the in-TUI executor wraps the same handler.

**`Space` menu (modeless, Helix).** Recency- and frecency-ranked list of recent screens, runs, tasks, repos, agents. Fuzzy-filtered (fzf-style `--filter` engine reused). Top-level groupings: `Space f` files / artifacts, `Space r` runs, `Space t` tasks, `Space a` agents, `Space g` git, `Space ?` diagnostics. Closes on Esc or selection.

### 3.8 ACP chat pane toggle — `c`

ACP (Agent Chat Pane) is a persistent right-side pane that overlays the active screen. Toggle key: `c` (single letter, no chord — chat is a first-class verb). Inside chat: standard input semantics — `Enter` to submit, `Shift-Enter` newline, `↑`/`↓` history, `Ctrl-l` clear, `Ctrl-d` close. Status footer's MODE pill flips to `CHAT` while focused.

The pane runs against the same agent surfaced in the footer (`agent: claude-opus-4-7`). Tool calls and run links inside chat are click-through to corresponding screens (`:run/<id>` etc.). Chat history persists per repo+branch, addressed by `trace_id`.

### 3.9 CLI ↔ TUI parity

**Same data, two front-ends; both stream over the same RPC.**

| CLI | TUI screen |
|---|---|
| `fulcrum runs feed --watch` | `:runs` (auto-tail on) |
| `fulcrum runs feed --json` (JSONL) | TUI subscribes to same JSONL stream |
| `fulcrum run view <id> --watch` | `:run/<id>` |
| `fulcrum runs tail <id>` | log pane inside `:run/<id>` |
| `fulcrum tasks list --filter status=open` | `:inbox` with filter prefilled |
| `fulcrum doctor --json` | `:doctor` |
| `fulcrum mcp test --json` | `:mcp` test row |
| `fulcrum agent invoke claude --task=...` | `:chat` with task seeded |

Implementation: every CLI command is a thin Cobra-style wrapper around a single in-process service call. The TUI runs the same service in-process via OpenTUI reconciler. `--watch` on the CLI subscribes to the same internal event bus the TUI consumes — guarantees the two surfaces never diverge.

### 3.10 Color discipline (cluster-wide)

8 semantic slots, no more (clig.dev "Use color with intention. Don't overuse it."):

| Slot | Use |
|---|---|
| `fg.default` | text |
| `fg.muted` | timestamps, ids, secondary |
| `fg.accent` | active mode, selected row left bar |
| `fg.success` | green — completed run, doctor green row |
| `fg.warn` | yellow — degraded, retried |
| `fg.error` | red — failed run, doctor red row |
| `fg.info` | blue — next-action suggestions, trace ids |
| `bg.selected` | selection background |

Adaptive light/dark via Lipgloss `LightDark()`. Selection: **accent left bar + dim row background** (k9s/lazygit pattern), not full reverse video. Multi-select: `Space` toggles, marker in left gutter (lazygit pattern).

### 3.11 Modal dialogs (when justified)

Only for severe-danger actions (clig.dev): purge memory, drop run history, force-push branch. Modal asks for typed confirmation (`type the run id to confirm`). Everything else uses inline confirmation in the footer: `[y/N]` press-to-confirm with a 5-second cancel window. No modal for filter, sort, or routine selection — k9s/Helix never use modals for these.

### 3.12 First-frame design — `<100ms` rule

`fulcrum tui` first paint must show shell + status footer + active screen header within 100ms. Detail panes load lazy with skeleton rows (clig.dev: "Print something to the user in <100ms"). Doctor row counts can lag — show "checking…" placeholder, not blocking.

Lipgloss's "high-performance cell-based renderer" + OpenTUI's Zig core comfortably hit this target on stock hardware.

---

## 4. Citations (≥18)

1. <https://cli.github.com/manual/> — gh subcommand grouping.
2. <https://cli.github.com/manual/gh_help_formatting> — `--json`, `--jq`, `--template`.
3. <https://cli.github.com/manual/gh_completion> — completion install per shell.
4. <https://docs.stripe.com/stripe-cli> — Stripe CLI overview.
5. <https://vercel.com/docs/cli> — Vercel CLI command list, token env-var guidance.
6. <https://vercel.com/docs/cli/logs> — `vercel logs --follow --json --level --since` shape.
7. <https://developers.cloudflare.com/workers/wrangler/commands/> — wrangler noun-verb groups.
8. <https://fly.io/docs/flyctl/> — flyctl app-scoped via `fly.toml`.
9. <https://doc.rust-lang.org/cargo/commands/index.html> — cargo color env, `--message-format json`.
10. <https://bun.com/docs/cli> — bun task-runner pattern.
11. <https://kubernetes.io/docs/reference/kubectl/> — kubectl `--output`, `--watch`, completion.
12. <https://devcenter.heroku.com/articles/heroku-cli> — heroku autocomplete, `.netrc`, colon syntax.
13. <https://clig.dev/> — Command Line Interface Guidelines (every section above).
14. <https://jdxcode.medium.com/12-factor-cli-apps-dd3c227a0e46> — 12-factor CLI apps.
15. <https://github.com/charmbracelet/bubbletea> — Bubble Tea Elm architecture.
16. <https://github.com/charmbracelet/lipgloss> — Lipgloss styles, adaptive colors.
17. <https://github.com/vadimdemedes/ink> — Ink React-for-CLI.
18. <https://k9scli.io/topics/commands/> — k9s `:` palette, key bindings.
19. <https://github.com/jesseduffield/lazygit> — lazygit panels & vim keys.
20. <https://github.com/jesseduffield/lazydocker> — lazydocker mouse + keyboard.
21. <https://jonas.github.io/tig/doc/manual.html> — tig views, navigation, status indicators.
22. <https://htop.dev/> — htop interactive process viewer.
23. <https://github.com/aristocratos/btop> — btop visual design, mouse, themes.
24. <https://github.com/dundee/gdu> — gdu TTY auto-detection, JSON export.
25. <https://github.com/junegunn/fzf> — fzf `--preview`, `--bind`, multi-select, `--filter`.
26. <https://docs.helix-editor.com/keymap.html> — Helix modes, `:`, Space menu.
27. <http://charm.land/apps/> — Charm app catalog (Glow, Wishlist, Soft Serve, Mods, VHS, Pop, Skate).
28. <https://github.com/sst/opentui> — OpenTUI native core + React reconciler.
29. <https://github.com/dlvhdr/gh-dash> — gh-dash YAML-config sections, Bubble Tea stack.
