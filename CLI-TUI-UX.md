# CLI-TUI-UX.md — Fulcrum CLI + TUI UX Spec

> Concrete CLI + TUI design proposal. Grounded in local research dossier + PRDs `seed-internal-cli` (27) + `seed-internal-tui` (50) + IA-MAP.md §8/§9 + DESIGN.md §13 cross-surface invariants. Pairs with [PRODUCT.md](PRODUCT.md), [DESIGN.md](DESIGN.md), [IA-MAP.md](IA-MAP.md), [COPY.md](COPY.md).

---

## 0. Posture

- CLI + TUI are **equal-weight surfaces**, not fallbacks. Every UI action also runs as `fulcrum <verb>` and is reachable in `fulcrum tui` (research-05 §3.9 + PRODUCT.md invariant 7).
- CLI optimizes for **machine output first**, human render second. Every command emits the same JSON envelope under `--json`.
- TUI is the keyboard-first workbench. Same data + same RPC stream as CLI; different presentation.
- Both surfaces share **scope chrome + trace-ID badge + status badge vocabulary + per-step modes + ACP chat** with the web shell (DESIGN.md §13).

---

## 1. CLI subcommand tree

Workflow-stage organized. Hub-and-spoke noun-verb (gh / wrangler shape, research-05 §1.1, §1.4). Verbatim from IA-MAP.md §8 with deeper per-stage detail.

### 1.1 Capture stage commands

```
fulcrum doc list      [--project <id>] [--space <id>] [--kind decision|spec|note|runbook] [--search <q>]
fulcrum doc new       --title <t> [--project <id>] [--from <file>] [--kind <kind>]
fulcrum doc view      <id> [--format md|html|plain]
fulcrum doc edit      <id>                                    # opens $EDITOR, syncs on save
fulcrum doc attach    <id> <file>
fulcrum doc history   <id>
fulcrum doc restore   <id> --version <n>
fulcrum doc comment   <id> --body <text> [--resolve <comment-id>]
fulcrum doc link      <id> --task <task-id>
fulcrum doc search    <query> [--project <id>] [--limit <n>]

fulcrum note new      <text>                                  # short-form intake
fulcrum note list     [--tag <tag>]

fulcrum capture text  <text>
fulcrum capture url   <url>
fulcrum capture file  <path>
fulcrum capture inbox [--snooze|--accept|--decline] <id>
fulcrum capture review <id> --note <text> [--trace <id>]
fulcrum capture status <id> --status triage|review|approved [--trace <id>]
fulcrum capture action <id> --action assign|block|approve|escalate [--assignee <id>] [--reason <text>] [--trace <id>]
```

### 1.2 Plan stage commands

```
fulcrum plan start    [--from-doc <id>] [--agent <name>] [--model <m>] [--mode planning] [--permission review_each_tool]
fulcrum plan list     [--project <id>] [--status proposed|approved|materialized]
fulcrum plan view     <id> [--include-prototype] [--include-tasks]
fulcrum plan preview  --plan <id> --file <path>               # render plan + prototype + tasks tripane
fulcrum plan materialize <id>                                 # create tasks + dep edges
fulcrum plan approve  <id>
fulcrum plan reject   <id> --reason <text>

fulcrum mission create    --title <t> [--parent <id>]
fulcrum mission list      [--project <id>] [--depth <n>]
fulcrum mission show      <id>
fulcrum mission activate  --wave <id>                         # research-07 §3.3, "Wave" = Slice rename
fulcrum mission delete    <id>

fulcrum prototype new     --plan <id> --target <file-path> [--sketch <path>]
fulcrum prototype view    <id>
fulcrum prototype attach  <plan-id> <prototype-path>
```

### 1.3 Build stage commands

```
fulcrum task new          --title <t> --project <id> [--parent <id>] [--depends-on <id,id>] [--cycle <id>] [--module <id>] [--recurrence <rule>]
fulcrum task list         [--status open|in-progress|done|archived] [--assignee <id>] [--cycle <id>] [--module <id>] [--label <l>]
fulcrum task view         <id>
fulcrum task edit         <id> [--title <t>] [--status <s>] [--assignee <id>] [--priority <p>]
fulcrum task move         <id> --cycle <id>
fulcrum task bulk         <id,id,...> --status <s>
fulcrum task run-preview  <id>                                # dry-run dependency graph
fulcrum task run          <id> [--agent <a>] [--model <m>] [--prompt <text>]
fulcrum task qa-review    <id> --review-file <path>

fulcrum cycle list        [--project <id>]
fulcrum cycle activate    <id>
fulcrum cycle complete    <id>

fulcrum module list       [--project <id>]
fulcrum module new        --name <n> [--project <id>]
fulcrum module view       <id>

fulcrum run new           --task <id> [--agent <a>] [--model <m>] [--policy review_each_tool|auto_approve_safe|danger_zone]
fulcrum run view          <id>
fulcrum run cancel        <id>
fulcrum run retry         <id> [--from-step <n>]
fulcrum run attach        <id>                                # opens live TUI session

fulcrum runs feed         [--watch] [--follow] [--since <t>] [--until <t>] [--filter kind=<k>] [--session <id>] [--agent <n>] [--status <s>] [--json] [--limit <n>]
fulcrum runs list         [--cycle <id>]
fulcrum runs tail         <id> [--lines <n>]

fulcrum agent list
fulcrum agent view        <name>
fulcrum agent invoke      --agent <n> --prompt <text> [--task <id>] [--model <m>]

fulcrum context pack      --task <id> [--include-docs] [--include-runs] [--budget <tokens>]
fulcrum context inspect   --task <id>
fulcrum context diff      --task <id> --against <run-id>
```

`fulcrum task new` mirrors the quick-create tray: human output shows project, sprint, module, and cycle scope before submission; JSON output includes recurrence preview and generated-instance summary when `--recurrence` is present. Validation and duplicate-title failures preserve entered fields and emit a retry command.

TUI task create uses the same contract without a modal overlay: `:board` and `:tasks` keep the current rows visible, render project/sprint/module/cycle scope inline, preview recurrence dates before submit, block duplicate titles in scope, and keep the entered draft plus retry command after validation or submit failure.

### 1.4 Review stage commands

```
fulcrum review list       [--status open|approved|rejected] [--reviewer <id>]
fulcrum review view       <id>
fulcrum review approve    <id> [--message <text>]
fulcrum review request-changes <id> --message <text>

fulcrum qa run            --task <id>
fulcrum qa report         --task <id> [--format md|json]

fulcrum uat run           --task <id>
fulcrum uat handoff       <id>
fulcrum uat decision      <id> --decision approve|request_changes|reject [--feedback <text>]

fulcrum e2e run           --project <id> [--runner bun|playwright] [--plan-only]
fulcrum e2e report        <run-id>
```

### 1.5 Ship stage commands

```
fulcrum artifact list     [--project <id>] [--kind binary|spec|report|memory]
fulcrum artifact view     <id>
fulcrum artifact diff     <id> --against <id>
fulcrum artifact export   <id> --out <path>
fulcrum artifact download <id>

fulcrum repo list
fulcrum repo status       [--project <id>]
fulcrum repo sync         <id>

fulcrum branch list
fulcrum branch switch     <name>
fulcrum branch finish     [--merge|--rebase|--squash]

fulcrum pr list           [--repo <id>]
fulcrum pr view           <number>
fulcrum pr create         --title <t> --body <text> [--draft]    # delegates to gh

fulcrum memory list       [--project <id>] [--tier semantic|episodic|procedural|preference]
fulcrum memory promote    --candidate <id> [--tier <t>] [--ttl <duration>]
fulcrum memory view       <id>
```

### 1.6 Operate stage commands

```
fulcrum doctor            [--json] [--subsystem <name>] [--checks] [--probe]
fulcrum mcp list          [--json] [--agent <id>]
fulcrum mcp register      <name> [--http <url>|--stdio <cmd>] [--vendor <v>]
                          [--agent <id>...] [--all-agents]
fulcrum mcp unregister    <name> [--agent <id>...] [--all-agents]
fulcrum mcp enable        <name> [--agent <id>...] [--all-agents]
fulcrum mcp disable       <name> [--agent <id>...] [--all-agents]
fulcrum mcp test          <name> [--agent <id>]
fulcrum mcp reload        <name> [--agent <id>...] [--all-agents]

fulcrum plugin list       [--json] [--agent <id>]
fulcrum plugin install    <name> [--agent <id>...] [--all-agents] [--version <v>]
fulcrum plugin enable     <name> [--agent <id>...] [--all-agents]
fulcrum plugin disable    <name> [--agent <id>...] [--all-agents]
fulcrum plugin update     <name|--all> [--agent <id>...] [--all-agents]
fulcrum plugin remove     <name> [--agent <id>...] [--all-agents]

fulcrum hooks list
fulcrum hooks enable      <name>
fulcrum hooks disable     <name>
fulcrum hooks test        <name>

fulcrum skills sync       [--codex-global] [--codex-project <dir>]
fulcrum skills install    <path> [--force-conflict] [--resolve-conflict=alt-version|skip|upgrade-installed]
fulcrum skills lint       <path>
fulcrum skills list       [--installed]
fulcrum skills upstream   [--update-pins]

fulcrum install           [--profile minimal|rules-only|full] [--with-project <dir>] [--no-skills] [--no-upstream-skills] [--no-default-mcps] [--enable-all-mcps] [--dry-run]
fulcrum uninstall         [--dry-run] [--purge] [--include-caveman]
fulcrum compress          [--check] [FILES...]

fulcrum config get        <key>
fulcrum config set        <key> <value>
fulcrum config edit
fulcrum config path

fulcrum audit list        [--project <id>] [--actor <id>] [--action <ns>] [--target <ref>] [--trace <id>] [--since <t>] [--until <t>] [--export csv|jsonl]

fulcrum trace show        <id>
fulcrum ai                [--step <id>] [--agent <name>] [--thread <id>]
                          # opens TUI-native inline AI Assist pane (no web drawer);
                          # --agent overrides default route for the step's action kind
```

### 1.6.1 Multi-CLI agent management (no cap)

```
fulcrum agent list        [--json] [--client <kind>] [--ring <ring>]
fulcrum agent view        <id>
fulcrum agent add         <id> --client <kind> [--binary <path>] [--model <m>]
                          [--ring preferred|stable|experimental] [--default]
                          [--policy <file>]
fulcrum agent edit        <id> [--ring <r>] [--policy <file>] [--model <m>]
fulcrum agent remove      <id> [--force]
fulcrum agent enable      <id>
fulcrum agent disable     <id>
fulcrum agent set-default <id> [--action <kind>]
fulcrum agent reload      <id>
fulcrum agent invoke      <id> [--step <step-id>] [--policy <file>]

# clients (extensible; --client values):
#   claude-code · codex · gemini-cli · opencode · pi-cli · custom
# rings:
#   preferred · stable · experimental
```

### 1.6.2 Action routing (default agent per action kind)

```
fulcrum route list                                      [--json]
fulcrum route show        <action-kind>
fulcrum route set         <action-kind> <agent-id> [--fallback <agent-id>]
fulcrum route reset       <action-kind|--all>

# action kinds:
#   plan.draft · plan.refine · plan.prototype
#   capture.discuss
#   build.run.step · build.run.long
#   review.suggest · review.summary
#   ship.changelog
#   operate.probe · operate.diagnose
#   ai.freeform
```

### 1.6.3 Settings · profile · workspace

```
fulcrum settings                                       # opens :settings
fulcrum profile list
fulcrum profile show
fulcrum profile switch    <name>
fulcrum profile new       <name>
fulcrum profile delete    <name> --confirm <name>
fulcrum workspace list
fulcrum workspace switch  <name>
fulcrum workspace new     <name>
```

### 1.7 Cross-cutting

```
fulcrum                                  # default = fulcrum tui
fulcrum web                              # open web shell in browser
fulcrum tui                              # open TUI
fulcrum version
fulcrum help [topic]
fulcrum completion <bash|zsh|fish|powershell>
```

### 1.8 Per-agent scoping rule

Every command that mutates configuration (mcp · plugin · hooks · install · skills) accepts `--agent <id>` (repeatable) and `--all-agents`. Default scope: **active agent only** (the one set as default for the relevant action kind). Use `--all-agents` to apply across the registry once cross-agent install lands. Until then, the flag prints `note: cross-agent install is staged behind feature flag plugins.cross_agent; falling back to per-agent loop`.

---

## 2. CLI flag conventions

Cross-cutting flags work on every command. Source: research-05 §3.3.

| Flag | Behavior | Source |
|---|---|---|
| `-h`, `--help` | Always works (even after other flags) | clig.dev |
| `-V`, `--version` | Print version + commit + build date | 12-factor #3 |
| `--json` | JSON envelope output (see §3) | gh |
| `--jq <expr>` | Apply jq expression to JSON output | gh |
| `--template <go-tmpl>` | Go-template shape output | gh |
| `--plain` | Tabular text for `grep`/`awk` | clig.dev |
| `-q`, `--quiet` | Suppress non-error output | clig.dev |
| `-v`, `--verbose` | Increase verbosity (`-vv`, `-vvv` count) | clig.dev |
| `--debug` | Full debug logs to stderr | clig.dev |
| `--no-color` | Disable color (also `NO_COLOR=`, `FULCRUM_NO_COLOR=`) | NO_COLOR spec |
| `--no-input` | Disable every prompt; fail if data missing | clig.dev |
| `-n`, `--dry-run` | Show what would happen | clig.dev |
| `-f`, `--force` | Skip confirm for moderate-danger actions | clig.dev |
| `--confirm <name>` | Required for severe actions (drop run, purge memory) | clig.dev |
| `-R`, `--repo <slug>` | Override project scope | gh |
| `--profile <name>` | Override workspace profile | Fulcrum |
| `-o`, `--output <fmt>` | `pretty\|json\|jsonl\|yaml\|table\|wide\|name` | kubectl |
| `-w`, `--watch` | Stream until Ctrl-C | kubectl |
| `--follow` | Tail mode (logs) | vercel |
| `--since <t>` | Time-based filter (ISO 8601 or relative `1h`) | vercel |
| `--until <t>` | Time-based filter end | vercel |
| `--limit <n>` | Cap output rows | vercel |
| `--web` | Open in browser instead of returning data | gh |

### 2.1 Secrets handling

- **Never** read secrets from argv (`--token`). Process tables leak globally.
- Read from env: `FULCRUM_TOKEN` (documented as process-leak surface).
- Preferred: `--token-file <path>` (research-05 §3.3).
- Read from stdin: `cat token | fulcrum auth login --token-stdin`.

### 2.2 Config precedence

Locked to clig.dev. Highest → lowest:

1. Flags (argv)
2. Env vars (`FULCRUM_*`)
3. Project config `.fulcrum.toml` / `.envrc`
4. User config `~/.config/fulcrum/config.toml` (XDG)
5. System config `/etc/fulcrum/config.toml`

`FULCRUM_HOME` overrides config dir for testing.

### 2.3 Color disable conditions

Disable color when **any** of:
- stdout is not a TTY
- stderr is not a TTY (for stderr coloring)
- `NO_COLOR=` env set (any value, including empty)
- `TERM=dumb`
- `--no-color` flag
- `FULCRUM_NO_COLOR=` env set

### 2.4 Ctrl-C

Per clig.dev: exit as fast as possible. Print "Gracefully stopping… (press Ctrl+C again to force)" on first INT. Second INT skips cleanup. Long-running commands (`runs feed --watch`) on first Ctrl-C send `session/cancel` ACP notification then exit.

---

## 3. CLI JSON envelope (load-bearing contract)

Every command supports `--json`. Schema:

```json
{
  "schema": "fulcrum.cli.v1",
  "trace_id": "4f3a1c9e8b2d4a6f9c1e3a5b7d9f1c3e",
  "span_id": "8b2d4a6f9c1e3a5b",
  "run_id": "01HXYZ123ABC456DEF789GHI012",
  "project_id": "fulcrum",
  "command": "fulcrum runs feed",
  "args": { "--watch": true, "--project": "fulcrum" },
  "result": {
    /* command-specific payload */
  },
  "errors": [
    {
      "code": "FUL_AUTH_REQUIRED",
      "message": "Run `fulcrum auth login` to authenticate.",
      "fix": "fulcrum auth login",
      "doc": "https://fulcrum.dev/docs/auth"
    }
  ],
  "next_actions": [
    { "label": "Tail logs", "command": "fulcrum runs tail <id>" },
    { "label": "Open in TUI", "command": "fulcrum tui :run <id>" }
  ],
  "duration_ms": 142,
  "timestamp": "2026-05-17T10:00:00Z"
}
```

Locked invariants:

- `trace_id` always present (uppercase env: `FULCRUM_TRACE_ID` propagates).
- `errors` is an array, never null. Empty when success.
- `next_actions` is an array, never null. Empty when no follow-on suggested.
- `result` shape is command-specific but documented in `fulcrum help <command> --json-schema`.
- `--jq <expr>` operates on the result of this envelope: `fulcrum runs feed --json --jq '.result.runs[] | .id'`.
- Streaming commands (`runs feed --watch --json`) emit **JSONL** (one envelope per line). End-of-stream sentinel: `{"schema":"fulcrum.cli.v1","result":null,"end":true,"trace_id":"…"}`.

### 3.1 Error envelope shape

Per clig.dev + 12-factor #5:

```json
{
  "code": "<NAMESPACED_CODE>",
  "message": "<human-readable, name the recovery>",
  "fix": "<exact command or single-action string>",
  "doc": "<URL>",
  "trace_id": "<id>",
  "context": { /* command-specific extra debug info */ }
}
```

Error code namespace: `FUL_<DOMAIN>_<SPECIFIC>`. Examples: `FUL_AUTH_REQUIRED`, `FUL_DB_LOCK`, `FUL_AGENT_UNREACHABLE`, `FUL_PERMISSION_DENIED`, `FUL_PROJECT_NOT_FOUND`.

### 3.2 Stream output (clig.dev)

- stdout → command result (machine-friendly)
- stderr → log messages, progress, errors
- Pipe-safe: `fulcrum runs feed --json | jq '.result.events[]'`

### 3.3 Animations + progress

Per clig.dev: no animations when stdout is not a TTY. Progress goes to stderr. Spinners disabled in CI / `TERM=dumb`. Long-running ops print **status line** updates instead, one per ~500 ms throttled.

---

## 4. CLI completion install

Per research-05 §3.4. Output shape:

```
$ fulcrum completion zsh
# Fulcrum zsh completion
# Add to ~/.zshrc:
#   source <(fulcrum completion zsh)
# Or install to fpath:
#   fulcrum completion zsh > /usr/local/share/zsh/site-functions/_fulcrum

#compdef fulcrum
…
```

`fulcrum install` doctor step detects the shell and **prints** (never silently writes) the recommended install line. Echoes clig.dev "tell the user exactly what you're doing".

Shells supported: bash, zsh, fish, powershell.

---

## 5. CLI error messages (per stage)

Lifted from COPY.md §3 + research-05 §1.9 (clig.dev). Pattern: `[what failed]. [why]. [fix]. trace=<id>`. Always written to stderr.

| Code | Stderr text |
|---|---|
| `FUL_AUTH_REQUIRED` | `Authentication required.\n  Fix: fulcrum auth login\n  trace=4f3a1c9e…` |
| `FUL_DB_LOCK` | `Local database is locked by another process.\n  Fix: fulcrum doctor probe pglite. Or remove ~/.fulcrum/pglite/postmaster.pid if no Fulcrum is running.\n  trace=4f3a1c9e…` |
| `FUL_AGENT_UNREACHABLE` | `Agent claude could not be reached.\n  Fix: fulcrum mcp test claude. Or check FULCRUM_AGENTS in fulcrum config edit.\n  trace=4f3a1c9e…` |
| `FUL_PROJECT_NOT_FOUND` | `Project "foo" not found in workspace "local".\n  Fix: fulcrum projects list. Or fulcrum projects new --slug foo.\n  trace=4f3a1c9e…` |
| `FUL_MISSING_FEATURE_FLAG` | `Public API gated behind FULCRUM_FEATURES=public-api.\n  Fix: export FULCRUM_FEATURES=public-api. Or fulcrum config set features public-api.\n  trace=4f3a1c9e…` |
| `FUL_PERMISSION_DENIED` | `Agent codex requested permission to run shell command. You can approve in the TUI session pane.\n  Fix: fulcrum runs attach 01HXYZ…\n  trace=4f3a1c9e…` |

---

## 6. TUI screen list

Per IA-MAP.md §9 + research-05 §3.5 + the `tui-runs.html` prototype (16 screens shipped). OpenTUI host, screens as components. **Feature parity with web shell is mandatory** — every web destination has a TUI screen. Default screen on `fulcrum tui` boot = `:inbox` if any unread, else last-visited screen.

| Stage | Screen id | Description |
|---|---|---|
| **Capture** | `:capture` (alias `:inbox`) | Intake queue; filters · drafts · promoted in side pane; snooze/accept/decline |
| | `:docs` | Tree view, lazy expansion, drag reorder |
| | `:doc/<id>` | Doc reader; per-block mode row `p / d / m / :ai`; slash menu via `/` |
| | `:notes` | Short-form note list |
| **Plan** | `:plan` (alias `:plans`) | Planning sessions list |
| | `:plan/<id>` | Live ACP session (3-pane: sessions · transcript · workspace) |
| | `:plan/<id>/review` | Plan + prototype + tasks tripane with inline comments |
| | `:missions` | Mission tree |
| | `:mission/<id>` | Mission detail with sub-waves |
| | `:prototype` | Prototype gallery (live + archived) |
| | `:templates` | Plan template library (12 templates) |
| | `:prompts` | Prompt library, tag filter |
| **Build** | `:runs` | Runs feed with auto-tail toggle |
| | `:run` / `:run/<id>` | Live agent session detail (4 panes: steps · current tool · cost/tokens · permission) |
| | `:board` | Task board (j/k/h/l between cards + columns; five-layout switcher) |
| | `:list` (alias `:tasks`) | List view (dense table) |
| | `:timeline` | Gantt, 14-day window |
| | `:table` | Spreadsheet layout |
| | `:graph` | Dependency graph (Sugiyama via OpenTUI canvas) |
| | `:cycles` | Cycle list |
| | `:cycle/<id>` | Cycle detail |
| | `:modules` | Module list |
| | `:module/<id>` | Module detail |
| **Review** | `:review` | Review queue (tabs: awaiting · changes · approved · merged) |
| | `:review/<id>` | Diff viewer (file tree, diff, annotation sidebar; inline comments anchored to lines) |
| | `:qa/<task-id>` | QA report |
| | `:uat` | UAT handoff queue |
| **Ship** | `:ship` (alias `:artifacts`) | Release list / artifact list; cycle/channel filters |
| | `:ship/<id>` (alias `:artifact/<id>`) | Release detail — top-anchored sheet overlay |
| | `:archive` | Release archive, major/minor/patch pills |
| | `:repos` | Repo list with branch + status column |
| | `:repo/<id>` | Repo detail |
| | `:memory` | Memory entries |
| **Operate** | `:doctor` | Subsystem table (research-04 verbatim) |
| | `:telemetry` | p50/p99 charts · runs-by-step bars · resources |
| | `:alerts` | Firing alerts with severity tabs |
| | `:audit` | Audit log; filter via `/` |
| | `:logs` | Live log tail with severity color |
| | `:errors` | Error logs (Sentry-grouped) |
| | `:mcp` | MCP server list, **scope chip switches CLI agent** (per-agent config) |
| | `:plugins` | Plugin list, per-agent scope, toggle/update/install-across |
| | `:hooks` | Hook list |
| | `:skills` | Skill list |
| | `:trace/<id>` | Trace explorer |
| **System** | `:ai` | **TUI-native inline AI Assist pane** (NOT a web drawer); thread + composer; auto-injected `[ :ai ]` segment on every footer; reachable via `:ai` cmd, `:ai` tab, or footer-seg click |
| | `:agents` | CLI agent registry (unlimited entries): `a` add · `e` edit · `d` set default · `D` delete · `m` mcp scope · `p` plugin scope |
| | `:routes` | Default agent per action kind: `e` edit · `o` toggle override · `r` reset to defaults |
| | `:settings` | 8 sections: General · Appearance · Keyboard · Privacy · Integrations · AI agents · Account · Danger |
| | `:K` | Command palette (parity with web ⌘K) |
| | `?` | Keyboard cheatsheet (full key map) |

### 6.1 What is intentionally NOT in the TUI

- **No web chat drawer.** The web slides a chat drawer from the right (Cloudflare AI Assist pattern). That overlay does not belong in a terminal. AI lives as the inline `:ai` screen, with `[ :ai ]` as the right-most footer segment of every other screen. Invoking it switches the visible screen; it does not draw an overlay panel over terminal content.
- **No mouse-only affordances.** Every action has a keystroke; click is a convenience.
- **No animation.** Status changes flash one frame; no slide / fade / pulse beyond the cursor blink.
- **No modal overlays for routine actions.** Modals only for confirm-irreversible (`:agent remove`, `:profile delete --confirm`).

---

## 7. TUI keyboard map

Per research-05 §3.5 + Helix/k9s/lazygit conventions.

### 7.1 Global

| Key | Action |
|---|---|
| `:` | Open command palette (modal, k9s grammar) |
| `Space` | Open modeless menu (Helix space-menu) |
| `/` | Search/filter current screen (k9s) |
| `?` | Help overlay (contextual) |
| `q` | Pop view (close current screen) |
| `Ctrl-c` | First: graceful exit current view. Second: force quit. |
| `Esc` | Cancel current input/filter/command |
| `H` / `L` | Previous / next screen (tab-style) |
| `g g` | Jump to first |
| `G` | Jump to last |

### 7.2 Stage navigation (chord)

| Key | Action |
|---|---|
| `g c` | Go to Capture |
| `g p` | Go to Plan |
| `g b` | Go to Build (runs feed) |
| `g B` | Go to Build · board view |
| `g r` | Go to Review |
| `g s` | Go to Ship |
| `g o` | Go to Operate |
| `:run` | Open current run detail |
| `:ai`  | Open inline AI Assist pane (any screen) |

### 7.3 List navigation

| Key | Action |
|---|---|
| `j` / `↓` | Next row |
| `k` / `↑` | Prev row |
| `Enter` | Open detail |
| `o` | Open in new screen split |
| `c` | Create new in current stage |
| `e` | Edit inline |
| `x` | Toggle select |
| `V` | Enter visual select mode (range) |
| `Shift+x` | Range select |
| `Ctrl-a` | Select all visible |
| `Backspace` | Archive (with confirm) |

### 7.4 Per-step modes

| Key | Action |
|---|---|
| `p` | ▶ Play current step (opens mode picker popover) |
| `d` | 💬 Discuss current step (inline thread) |
| `m` | Open mode picker without committing |
| `Shift+P` | Replay last Play |

### 7.5 AI Assist pane (TUI-native, NOT a web drawer)

| Key | Action |
|---|---|
| `:ai` | Open inline AI Assist pane (`:ai` screen) |
| Click `[ :ai ]` | Same as `:ai` (right-most footer segment, accent-bordered) |
| `:ai` tab | Same as `:ai` (top tab strip) |
| Inside `:ai` | `Enter` submit, `Shift+Enter` newline, `↑`/`↓` history, `Ctrl-l` clear, `Ctrl-s` save thread, `Esc` blur |
| `q` | Pop back to previous screen |

The AI pane **does not overlay** other screens. It is an inline screen reachable via tab swap. This is intentional: the web shell overlays AI Assist on top of content (Cloudflare AI Assist pattern); the TUI keeps the terminal a terminal.

### 7.6 Trace clipboard

| Key | Action |
|---|---|
| `y t` | Yank trace ID to clipboard |
| `y r` | Yank run ID |
| `y s` | Yank span ID |
| `y p` | Yank project path |

### 7.7 Review screen (Plannotator verbatim)

| Key | Action |
|---|---|
| `Mod+Enter` | Approve (no annotations) or send feedback |
| `Alt Alt` | Toggle review destination (double-tap) |
| `Mod+B` | Toggle file tree |
| `Mod+.` | Toggle review sidebar |
| `V` | Mark file viewed |
| `a` | Accept hunk |
| `r` | Reject hunk |
| `h` / `Mod+]` | Next hunk |
| `Mod+[` | Prev hunk |

### 7.8 Drag-and-drop alternative (WCAG 2.5.7)

For board cards:

| Key | Action |
|---|---|
| `Space` | Grab card |
| `j` / `k` | Move within column |
| `h` / `l` | Switch column |
| `Enter` | Drop card |
| `Esc` | Cancel grab |

---

## 8. TUI status footer (mirror of web footer)

Per DESIGN.md §13 + research-04 §16 + research-05 §3.6. Identical to web footer. Bottom strip, single line, Lipgloss-styled monospace columns.

Layout (left → right):

```
[MODE] [profile] [repo:branch] [run:<id> 12/47] [agent:claude-opus-4-7] [mcp:5/5] [trace:4f3a1c9e] [10:42] [?] [:]
```

| Segment | Width | Source |
|---|---|---|
| `MODE` | 8 ch | Reverse-video. CAPTURE / PLAN / RUNS / BOARD / REVIEW / SHIP / DOCTOR / :AI / :AGENTS / :MCP / :PLUGINS / :ROUTES / :SET / : K / ? |
| `profile` | 8 ch | Active workspace profile (work / oss / home) |
| `repo:branch` | flex | Implicit-scope (Vercel/flyctl style) |
| `run:<id> 12/47` | 16 ch | Run ID + position-of-total (tig pattern) |
| `agent` | 24 ch | Active agent for invocations |
| `mcp:5/5` | 8 ch | Healthy/total MCP. Red if degraded. |
| `trace:4f3a1c9e` | 18 ch | Current trace ID. Click via OSC 8 hyperlink. |
| `10:42` | 6 ch | Local time |
| `? :` | 4 ch | Hints |

Color discipline: 8-color base, accent for `MODE`, semantic red only when something is wrong (mcp degraded, run failed). Adaptive light/dark via Lipgloss `HasDarkBackground()`. Never collapses. Never scrolls.

---

## 9. TUI command palette (`:`)

Per research-05 §3.7 + IA-MAP.md §6. Two surfaces, both indexed by `trace_id`:

### 9.1 `:` palette (modal, k9s/Helix grammar)

- Text-driven. Same grammar as CLI.
- `:run new`, `:repo sync foo`, `:doctor`, `:agent invoke claude`.
- Tab-completes against CLI command tree.
- **CLI↔TUI duality:** anything you can do in `fulcrum <cmd>` is `:<cmd>` in the TUI.
- `Esc` exits without running.

### 9.2 `Space` menu (modeless, Helix grammar)

- Recency- and frecency-ranked list (fzf `--filter` engine).
- Top groupings: `Space f` files / artifacts, `Space r` runs, `Space t` tasks, `Space a` agents, `Space g` git, `Space ?` diagnostics.
- Closes on Esc or selection.
- Action-oriented; never modal.

---

## 10. AI Assist pane (TUI) — TUI-native, NOT a web drawer

> **Why this is not a drawer:** the web shell slides AI Assist in from the right (Cloudflare AI Assist pattern). That overlay does not belong in a terminal — sliding a panel over terminal content fights every assumption the user has about a TTY (scroll-back, focus, copy/paste, alt-buffer). The TUI keeps AI as a **first-class inline screen** reachable in one keystroke from anywhere via three equivalent affordances.

### 10.1 Invocation (three equivalent ways)

1. Type `:ai` on any command bar.
2. Press `:ai` tab in the top tab strip.
3. Click `[ :ai ]` segment in the footer (auto-injected as the right-most segment of every other screen, accent-bordered).

All three swap the visible screen to `:ai`. Mode footer flips to `:AI` while focused. `q` pops back to the previous screen.

### 10.2 Screen layout

```
┌──── fulcrum · :ai · inline AI pane (TUI-native) ──── agent: claude-opus-4-7 ──┐
│ ─── thread · auth-rewrite ──────────────────────────────────────────────────  │
│                                                                               │
│ you 14:02                                                                     │
│   Rotate sessions on every issuance, record issuance metadata,                │
│   add a kill-switch by kid.                                                   │
│                                                                               │
│ claude 14:02                                                                  │
│   ▸ read_file src/auth/session.ts · 0–240            done                     │
│   ▸ edit_file src/auth/session.ts · 3 hunks          done                     │
│                                                                               │
│      @@ -42,7 +42,12 @@                                                       │
│      - const t = signToken(req.user);                                         │
│      + const t = signToken(req.user, { rotate: true });                       │
│      + recordIssuance(t.kid, req.ip);                                         │
│                                                                               │
│   ⚠ permission shell.run  pnpm test --filter auth                             │
│      [ Allow once ]  [ Deny ]  [ Always allow shell.run ]                     │
│                                                                               │
│ ─── composer ─────────────────────────────────────────────────────────────── │
│ › _                                                                           │
│ @scope mention · /cmd slash · ⌘↵ run · ⌘s save thread                        │
├───────────────────────────────────────────────────────────────────────────────┤
│ :AI  profile:dev  auth/rewrite  thread·auth-rewrite  agent:claude  mcp:7/7   │
│ trace:tr_8f29a4c…  14:11  ?  :  [ :ai ]                                       │
└───────────────────────────────────────────────────────────────────────────────┘
```

### 10.3 Scope rules

Auto-scopes to: current project + active step (if any) + last-visited trace ID. Survives screen nav (thread state preserved). Reopens with last thread. Trace badge in header is yank-able (`y t`). Use `--thread <id>` on `fulcrum ai` to attach to a specific thread.

### 10.4 Agent selection

Default agent comes from the routing table (`fulcrum route show ai.freeform`). Override per-turn with `:agent <id>` typed into the composer, or persistently with `fulcrum route set ai.freeform <agent-id>`. The `:agents` screen lists all configured CLI agents; `:ai` always uses the routed agent unless overridden.

---

## 11. TUI status badge vocabulary

Identical to web (DESIGN.md §4.9). 8 states. Color + glyph + label. Never color-only.

| State | Color | Glyph | Label |
|---|---|---|---|
| `pending` | slate | `◌` | PENDING |
| `running` | accent (pulse) | `●` | RUNNING |
| `complete` | success | `✓` | COMPLETE |
| `blocked` | warn | `⏸` | BLOCKED |
| `awaiting` | warn | `⌛` | AWAITING |
| `failed` | danger | `✗` | FAILED |
| `cancelled` | fg-muted | `⊘` | CANCELLED |
| `degraded` | warn | `⚠` | DEGRADED |

---

## 12. TUI density modes

Per DESIGN.md §7. Settings → Display.

| Mode | Row height | Body size |
|---|---|---|
| Compact | 1 line | 12px equivalent (terminal cell base) |
| Cozy (default) | 1 line + 1 line meta | 13px equivalent |
| Comfortable | 2 lines | 14px equivalent |

Toggle via `:` palette: `:density compact|cozy|comfortable`.

---

## 13. CLI ↔ TUI parity table

Per research-05 §3.9. **Same data, two front-ends; both stream over the same RPC.**

| CLI | TUI screen |
|---|---|
| `fulcrum runs feed --watch` | `:runs` (auto-tail on) |
| `fulcrum runs feed --json` (JSONL) | TUI subscribes to same JSONL stream |
| `fulcrum run view <id> --watch` | `:run` / `:run/<id>` |
| `fulcrum runs tail <id>` | log pane inside `:run/<id>` |
| `fulcrum task list --filter status=open` | `:list` with filter prefilled |
| `fulcrum task list --view board` | `:board` |
| `fulcrum task list --view timeline` | `:timeline` |
| `fulcrum task list --view graph` | `:graph` |
| `fulcrum task list --sort <field>:<asc|desc>` | `:list` `s` opens sort menu; field/direction shown in header |
| `fulcrum doctor --json` | `:doctor` |
| `fulcrum audit list --trace <id>` | `:audit` with filter prefilled |
| `fulcrum trace show <id>` | `:trace/<id>` |
| `fulcrum ai --step <id>` | `:ai` scoped to current step (inline pane) |
| `fulcrum ai --thread <id>` | `:ai` re-attached to thread |
| `fulcrum doc edit <id>` | `:doc/<id>` then `e` |
| `fulcrum agent list` | `:agents` |
| `fulcrum agent add <id> --client <kind>` | `:agents` → `a` add |
| `fulcrum agent set-default <id> --action <kind>` | `:routes` → `e` edit |
| `fulcrum route list` | `:routes` |
| `fulcrum route set <kind> <agent>` | `:routes` → `e` edit |
| `fulcrum mcp list --agent <id>` | `:mcp` with scope chip = `<id>` |
| `fulcrum mcp enable <name> --agent <id>` | `:mcp` → toggle row |
| `fulcrum plugin list --agent <id>` | `:plugins` with scope chip = `<id>` |
| `fulcrum plugin update <name> --agent <id>` | `:plugins` → `u` update |
| `fulcrum settings` | `:settings` |
| `fulcrum profile switch <name>` | `:set profile <name>` or `:settings` → General |
| `fulcrum workspace switch <name>` | `:set workspace <name>` |
| `fulcrum ship list` | `:ship` |
| `fulcrum ship view <id>` | `:ship/<id>` (top-anchored sheet) |
| `fulcrum review list --tab awaiting` | `:review` with tab=awaiting |
| `fulcrum doctor --probe <subsystem>` | `:doctor` → row probe |
| `fulcrum operate telemetry --tail` | `:telemetry` |
| `fulcrum operate alerts list` | `:alerts` |

Invariants:
- **Every CLI command is one keystroke away in the TUI palette.**
- **Every TUI screen has a CLI verb that opens it directly.**
- **Both surfaces emit + consume the same JSON envelope.**

---

## 14. Agent-native parity (cross-surface invariant)

Per PRODUCT.md invariant 7. Every UI action also runs as `fulcrum <verb>` and `POST /api/v1/...`. Concretely:

| User action (web) | CLI equivalent | API endpoint |
|---|---|---|
| Click "Create project" | `fulcrum projects new --name <n>` | `POST /api/v1/projects` |
| Drag card to "Done" | `fulcrum task edit <id> --status done` | `PATCH /api/v1/tasks/<id>` |
| Hit ▶ Play on a step | `fulcrum task run <id> --agent <id>` | `POST /api/v1/runs` |
| Hit 💬 Discuss on a step | `fulcrum ai --step <id>` (inline pane) | `POST /api/v1/ai/threads` |
| Open AI Assist drawer (web `⌘/`) | `:ai` (TUI inline) / `fulcrum ai` | `POST /api/v1/ai/threads` |
| Add a CLI agent | `fulcrum agent add <id> --client <kind>` | `POST /api/v1/agents` |
| Set default agent for action | `fulcrum route set <kind> <agent>` | `PUT /api/v1/routes/<kind>` |
| Enable MCP on an agent | `fulcrum mcp enable <name> --agent <id>` | `PUT /api/v1/agents/<id>/mcp/<name>` |
| Install plugin on an agent | `fulcrum plugin install <name> --agent <id>` | `POST /api/v1/agents/<id>/plugins` |
| Toggle theme | `fulcrum config set theme dark` | `PUT /api/v1/settings/theme` |
| Approve a review | `fulcrum review approve <id>` | `POST /api/v1/reviews/<id>/approve` |
| Open Doctor | `fulcrum doctor --json` | `GET /api/v1/doctor` |
| Copy trace ID | env: `FULCRUM_TRACE_ID` | response header `X-Trace-Id` |

If a UI action lacks a CLI verb, the CLI is broken (research-05 §3.9 + PRDs `seed-services` invariant).

---

## 15. CLI startup performance budget

Per research-05 §1.10 (12-factor #9). 100–500 ms startup. Achieved via:

- Lazy command loading (only the dispatched subcommand is imported).
- Bun runtime native startup.
- No network calls during help (`-h`, `--help`).
- Config cache at `~/.cache/fulcrum/config.json` (5-min TTL).

Measured under `fulcrum --version` and `fulcrum help` (no project context required).

---

## 16. TUI first-frame budget

Per research-05 §2.1. <100 ms first-frame after `fulcrum tui` invocation. Achieved via:

- OpenTUI native Zig core (research-05 §2.9).
- Skeleton paint immediately; data populates async.
- No PGlite open until first stage screen is opened.

If first frame takes >200 ms, the boot is broken.

---

## 17. Sources

### 17.1 Sibling design docs

- [PRODUCT.md](PRODUCT.md) — target state, four-mode-per-step, hard invariants 7+11, Transformation Discipline carry-over of every CLI command + TUI screen.
- [DESIGN.md](DESIGN.md) §13 — cross-surface invariants, status badge vocabulary (this file's §11 mirrors it).
- [IA-MAP.md](IA-MAP.md) §8 (CLI tree shape), §9 (TUI screen list).
- [COPY.md](COPY.md) §3 (error template), §10 (permission prompts), §13 (telemetry first-run prompt).
- [OD-PROMPT.md](OD-PROMPT.md) — Open Design context block.

### 17.2 Research dossiers (local research dossier)

- [05-cli-tui-design.md](#) — 4725 words, 29 sources; drives every section of this file.
- [02-agent-supervision.md](#) — drives §3 (JSON envelope), §6 (live session TUI screen), §10 (ACP chat pane), §14 (agent-native parity). ACP `session/*` methods, tool-call lifecycle.
- [04-observability-trace.md](#) — drives §3 (trace_id key), §5 (error codes), §8 (status footer trace segment), §11 (status badges).
- [01-workflow-nav-ia.md](#) — drives §1 (workflow-stage subcommand grouping), §7.2 (chord nav `g c/p/b/r/s/o`), §9 (palette grammar).
- [06-mobile-a11y-perf-tokens.md](#) — drives §7.8 (drag-and-drop a11y alternative — WCAG 2.5.7), §15/§16 (performance budgets).
- [07-copy-first-parity.md](#) — drives §7.7 (Plannotator Review shortcuts verbatim: `Mod+Enter`, `Alt Alt`, `V`, `Mod+B`, `Mod+.`).

### 17.3 External references

- [clig.dev](https://clig.dev/) — every CLI rule.
- [12-Factor CLI Apps](https://jdxcode.medium.com/12-factor-cli-apps-dd3c227a0e46).
- [gh manual](https://cli.github.com/manual/) — `--json` / `--jq` / `--template` / `--web` triad.
- [vercel logs](https://vercel.com/docs/cli/logs) — log-filter flag shape.
- [k9s commands](https://k9scli.io/topics/commands/) — `:` palette grammar.
- [Helix keymap](https://docs.helix-editor.com/keymap.html) — `Space` modeless menu.
- [Bubble Tea](https://github.com/charmbracelet/bubbletea) / [Lipgloss](https://github.com/charmbracelet/lipgloss) / [Ink](https://github.com/vadimdemedes/ink).
- [OpenTUI](https://github.com/sst/opentui).
- [ACP](https://agentclientprotocol.com/protocol/overview).

### 17.4 PRD glossary + impeccable

- local PRD glossary — 142 CLI + 149 TUI PRD entries; top critique themes for these surfaces: `exit codes` 96, `machine output` 96, `error copy` 94, `keyboard ux` 82, `selected state` 82, `status clarity` 80, `terminal density` 80.
- [~/.claude/skills/impeccable/reference/product.md](~/.claude/skills/impeccable/reference/product.md) — product register laws.
- local UX remediation goal.

### 17.5 Transformation note

The 30 commands in `apps/cli/src/commands/**` and 50+ screens in `apps/tui/src/screens/**` are all preserved. The workflow-stage grouping in §1 + §6 is a regrouping with stage aliases, not a removal. Existing entrypoints stay valid; new stage-prefixed verbs are added as additional aliases. See [PRODUCT.md § Transformation Discipline](PRODUCT.md) for the per-command carry-over inventory.
