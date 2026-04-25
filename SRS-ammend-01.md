## 1. Copilot CLI correction

I incorrectly treated Copilot CLI as `gh copilot`. That is wrong for the current GitHub Copilot CLI product.

The correct integration target is the standalone **`copilot`** CLI. GitHub’s docs show installation via:

```bash
npm install -g @github/copilot
brew install copilot-cli
winget install GitHub.Copilot
```

and first use via:

```bash
copilot
```

They also document non-interactive usage with:

```bash
copilot -p "..."
```

so Fulcrum should treat it as a first-class standalone agent command, not as a GitHub CLI subcommand. ([GitHub Docs][1])

The SRS should replace this:

```yaml
copilot:
  command: "gh copilot"
```

with this:

```yaml
copilot:
  command: "copilot"
  package: "@github/copilot"
  type: "cli-agent"
  install:
    npm: "npm install -g @github/copilot"
    brew: "brew install copilot-cli"
    winget: "winget install GitHub.Copilot"
  supports_noninteractive_prompt: true
  noninteractive_prompt_flag: "-p"
  supports_mcp: true
  supports_plugins: true
  supports_skills: true
  supports_subagents: true
  supports_session_persistence: true
```

GitHub’s feature page also says Copilot CLI operates independently in the terminal, supports MCP server integrations, skills, plugins, subagents/multi-agent workflows through `/fleet`, session persistence, and approval before file changes or command execution. ([GitHub][2])

So the updated Fulcrum agent list should be:

```yaml
agents:
  copilot:
    command: "copilot"
    type: "cli"
    role: "worker"
    enabled: true

  claude:
    command: "claude"
    type: "cli"
    role: "worker"
    enabled: true

  codex:
    command: "codex"
    type: "cli"
    role: "worker"
    enabled: true

  gemini:
    command: "gemini"
    type: "cli"
    role: "worker"
    enabled: true

  opencode:
    command: "opencode"
    type: "cli"
    role: "worker"
    enabled: true

  aider:
    command: "aider"
    type: "cli"
    role:
      - "worker"
      - "repo_map_provider"
    enabled: true
```

One more important note: GitHub also documents a **bundled Copilot CLI** path through the Copilot SDK, including examples for TypeScript, Python, Go, and .NET. That means Fulcrum could either call the user-installed `copilot` binary or eventually bundle/control a known Copilot CLI binary version. For v0, I would **not bundle it**; just detect the installed `copilot` command through `fulcrum doctor`. ([GitHub Docs][3])

---

## 2. Best language recommendation for Fulcrum

My recommendation is:

```text
Write Fulcrum core in Go.
Use TypeScript/React only if you later build a rich local web cockpit.
Do not choose Rust for v0 unless you personally want Rust more than delivery speed.
```

### Why Go is the best fit

Fulcrum is mostly:

```text
CLI
local daemon
MCP server
subprocess supervisor
SQLite state
git worktree manager
filesystem/index cache manager
JSON/JSONL API
TUI eventually
integration glue
```

That is Go’s sweet spot.

The strongest reason is MCP: the official MCP SDK page currently lists **Go as Tier 1**, while **Rust is Tier 2**. The Go SDK repository says it implements the official Go SDK for MCP clients and servers, and its examples include stdio server/client transports, which is exactly what Fulcrum needs. ([Model Context Protocol][4])

The second reason is the TUI ecosystem. Bubble Tea is a Go TUI framework based on the Elm Architecture, suitable for simple and complex terminal apps, and its README says it is used in production with renderer, keyboard, mouse, clipboard, and component support. That fits Fulcrum’s future terminal dashboard very well. ([GitHub][5])

The third reason is integration speed. Fulcrum is not trying to implement a compiler, code indexer, or memory engine from scratch. It is orchestrating existing tools: Plane, memsearch, Engram, git, Aider, Repomix, ripgrep, ast-grep, Copilot CLI, Claude Code, Codex, Gemini CLI, OpenCode, and quality gates. Go gives you a practical balance of reliability, speed, low runtime overhead, and simple deployment.

### Why not Rust as the default?

Rust is excellent, and it would be my second choice. It has Ratatui for fast, lightweight terminal UIs, and Ratatui is a strong option if you really want a Rust-native TUI. ([Ratatui][6])

But for Fulcrum v0, Rust has downsides:

```text
Pros:
  memory safety
  performance
  excellent native binaries
  good TUI with Ratatui
  good future desktop path with Tauri

Cons:
  slower iteration
  more async/process-management complexity
  more compile-time friction
  MCP Rust SDK currently Tier 2, not Tier 1
  overkill for a glue/control-plane product
```

Rust becomes more attractive if Fulcrum later becomes a polished native desktop app. Tauri would be a reasonable future route because it supports cross-platform apps with a Rust backend and any frontend framework. ([Tauri][7])

### Why not TypeScript as the core?

TypeScript is good for web UI, Plane API integration, and fast prototyping. It also has a Tier 1 MCP SDK. ([Model Context Protocol][4])

But I would not use TypeScript as the Fulcrum **core** because Fulcrum is a local operations tool. It needs robust subprocess handling, cross-platform paths, signal handling, SQLite, filesystem safety, long-running local state, and simple distribution. Node can do those, but Go is cleaner for a local control-plane binary.

TypeScript is still the right choice for a future cockpit UI:

```text
Core:
  Go

TUI:
  Go + Bubble Tea

Local web cockpit, if needed:
  TypeScript + React/Svelte/Vue

Native desktop, if needed much later:
  Either Tauri with Rust shell
  or local web app served by Go
```

---

## Updated SRS language section

I would add this to the SRS:

````md
## Implementation Language Recommendation

Fulcrum core should be implemented in Go.

### Decision

Use Go for:

- CLI
- local daemon
- MCP server/client
- agent wrappers
- subprocess supervision
- SQLite state
- git worktree management
- artifact/log management
- doctor
- quality gate runner
- JSON/JSONL output
- future TUI

Use TypeScript only for:

- optional rich web cockpit
- frontend UI
- optional SDK/plugin helpers where TypeScript ecosystem is clearly better

Use Rust only if:

- a native Tauri desktop app becomes central
- the team decides native performance/safety is more important than iteration speed
- the MCP Rust SDK and surrounding ecosystem become preferable for Fulcrum’s needs

### Rationale

Fulcrum is primarily an integration/control-plane product, not a custom code-intelligence engine. Go offers the best tradeoff for fast delivery, simple local binaries, subprocess orchestration, MCP integration, SQLite state, and terminal UI development.

The official MCP SDK tiering currently places Go in Tier 1 and Rust in Tier 2, which makes Go the lower-risk choice for an MCP-heavy product.

### Language Split

```text
Fulcrum Core:
  Go

Fulcrum TUI:
  Go + Bubble Tea

Fulcrum MCP:
  Go official MCP SDK

Fulcrum DB:
  SQLite via Go driver

Fulcrum Web Cockpit:
  Optional TypeScript frontend later

Fulcrum Native Desktop:
  Optional Tauri/Rust later, not v0
```
````

### Non-goals

Fulcrum v0 should not be a Rust-first systems project unless required by a concrete performance or safety bottleneck.

Fulcrum v0 should not be a Node-first app unless the product shifts toward a web-app-first architecture.

````

## Updated agent integration section

And replace the Copilot part with:

```md
## GitHub Copilot CLI Integration

Fulcrum shall treat GitHub Copilot CLI as a standalone CLI agent.

Correct command:

```bash
copilot
````

Correct install examples:

```bash
npm install -g @github/copilot
brew install copilot-cli
winget install GitHub.Copilot
```

Non-interactive prompt mode:

```bash
copilot -p "<prompt>"
```

Fulcrum shall not assume Copilot CLI is invoked through `gh copilot`.

### Fulcrum config

```yaml
agents:
  copilot:
    command: "copilot"
    type: "cli"
    install:
      npm: "npm install -g @github/copilot"
      brew: "brew install copilot-cli"
      winget: "winget install GitHub.Copilot"
    capabilities:
      noninteractive_prompt: true
      mcp: true
      plugins: true
      skills: true
      session_persistence: true
      subagents: true
    prompt:
      mode: "flag"
      flag: "-p"
```

### Doctor checks

Fulcrum doctor shall check:

```text
- copilot binary exists
- copilot version can be read
- user is authenticated or login is required
- Copilot CLI policy is enabled for the user/org if detectable
- MCP config is present if Fulcrum MCP integration is enabled
- non-interactive prompt mode works
```

So yes: correction accepted. **Copilot CLI is standalone `copilot`, and Fulcrum core should be Go.**

### References

[1]: https://docs.github.com/copilot/how-tos/set-up/install-copilot-cli "Installing GitHub Copilot CLI - GitHub Docs"
[2]: https://github.com/features/copilot/cli "GitHub Copilot CLI · GitHub"
[3]: https://docs.github.com/en/copilot/how-tos/copilot-sdk/set-up-copilot-sdk/bundled-cli "Using a bundled CLI with Copilot SDK - GitHub Docs"
[4]: https://modelcontextprotocol.io/docs/sdk "SDKs - Model Context Protocol"
[5]: https://github.com/charmbracelet/bubbletea "GitHub - charmbracelet/bubbletea: A powerful little TUI framework  · GitHub"
[6]: https://ratatui.rs/ "Ratatui | Ratatui"
[7]: https://v2.tauri.app/ "Tauri 2.0 | Tauri"
