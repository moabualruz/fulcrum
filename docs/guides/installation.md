# Plugin, Extension, and Installation Guide

> Install Fulcrum in the packaging model that matches the agent runtime you actually use.

Fulcrum is a local-first control plane that lives in `~/.local/bin` and stores per-project state under `$CWD/.fulcrum/`. The right onboarding path depends on the runtime:

- `plugin-first` for plugin-capable agents like Claude Code
- `extension-first` for Gemini CLI and PI
- `rules-first` for Cursor and Windsurf
- `config-first` for Codex and opencode
- `cli-only` for headless or bring-your-own-agent setups

Use the adaptive planner first:

```bash
fulcrum install plan
fulcrum install plan --json
fulcrum init --adaptive
```

---

## Prerequisites

| Tool | Version | Required for |
|------|---------|--------------|
| Node.js | 20 or newer | Running the CLI, MCP server, monitor, workers |
| pnpm | 9+ | Installing workspace dependencies |
| git | 2.40+ | Repo clone and `fulcrum-worktrees` worktree management |
| sqlite3 CLI | any | Optional — only needed to poke at `.fulcrum/fulcrum.db` by hand |

Optional agent-runtime integrations (the installer silently skips anything that isn't on `PATH`):

- **Claude Code CLI** (`claude`) — for the user-scope MCP server and PreToolUse hook
- **Gemini CLI** (`gemini`) — for the Gemini extension + BeforeTool hook
- **PI** (`pi`) — for the PI cockpit + BeforeTool hook
- **Cursor** — MCP via `.cursor/mcp.json` + always-applied rules via `.cursor/rules/fulcrum.mdc`
- **Windsurf** — MCP via `.windsurf/mcp.json` + always-applied rules via `.windsurf/rules/fulcrum.mdc`
- **Codex** — `.codex/config.json` + repo-level `AGENTS.md`
- **opencode** — `.opencode/config.json` + `.opencode/opencode.md`

Fulcrum itself never talks to the network. It runs the embedding model locally through `onnxruntime-node`, ships its own SQLite build, and optionally links against `kuzu` for the L2 graph layer.

---

## Global install (one-shot)

The fastest path — one clone, one install, one setup script:

```bash
git clone https://github.com/moabualruz/fulcrum.git
cd fulcrum
pnpm install
pnpm run setup
```

`pnpm install` downloads workspace dependencies and builds the native modules (`better-sqlite3`, `onnxruntime-node`, `kuzu`). Expect this to take 1–3 minutes on first run.

`pnpm run setup` executes `agent-integration/install.ts all` and performs these steps **end to end** — every step is idempotent, so re-running is safe:

1. **CLI binary** — symlinks `./fulcrum` (the wrapper script at the repo root) to `~/.local/bin/fulcrum`. If `~/.local/bin` isn't on `PATH` the installer prints a warning and the exact `export` line to add to your shell rc.
2. **Path verification** — runs `fulcrum --version` / `fulcrum memory --help` to confirm the binary resolves.
3. **Claude MCP server** — registers Fulcrum as a **user-scope** Claude Code MCP server via:
   ```
   claude mcp add --scope user fulcrum fulcrum serve mcp --mode filtered --runtime-capability hooks
   ```
   If the `claude` CLI is not present, the installer falls back to editing `~/.claude.json` directly and inserts the same server definition under `mcpServers.fulcrum`.
4. **PreToolUse hook** — merges a PreToolUse hook entry into `~/.claude/settings.json` so every Claude tool call is intercepted by `fulcrum hook claude` for policy enforcement.
5. **CLAUDE.md** — writes a Fulcrum section into `~/.claude/CLAUDE.md` between `<!-- fulcrum:begin -->` and `<!-- fulcrum:end -->` markers. Idempotent: re-running rewrites only the fenced region and leaves any surrounding user content intact.
6. **Gemini extension** — creates `~/.gemini/extensions/fulcrum/` with `extension.json`, `fulcrum.md` (the context file), and a `settings.json` that wires the BeforeTool hook to `fulcrum hook gemini`.
7. **PI cockpit** — if the `pi` CLI is present on `PATH`, runs `pi install <cockpit-dir>` to register the Fulcrum cockpit. Skipped silently otherwise.

The installer prints a `✓ / — / ⚠` marker on each step so you can see exactly what ran and what was skipped.

---

## Zero-friction install via npx

No clone required. If you already have one of the supported AI coding agents installed, run:

```bash
npx fulcrum-mcp@latest init
```

This detects which agents are present and configures them automatically:

| Agent | Detection | What gets written |
|-------|-----------|------------------|
| Claude Code | `~/.claude/` exists | `~/.claude/settings.json` (MCP entry + PreToolUse hook), `~/.claude/CLAUDE.md` (context block) |
| Gemini CLI | `~/.gemini/` exists | `~/.gemini/settings.json` (MCP entry), `~/.gemini/GEMINI.md` (context block) |
| Cursor | `~/.cursor/` or `.cursor/` in CWD | `.cursor/mcp.json`, `.cursor/rules/fulcrum.mdc` (alwaysApply: true) |
| Windsurf | `~/.windsurf/` or `.windsurf/` in CWD | `.windsurf/mcp.json`, `.windsurf/rules/fulcrum.mdc` (alwaysApply: true) |

All writes are idempotent — re-running is safe. Use `--dry-run` to preview what would be written:

```bash
npx fulcrum-mcp@latest init --dry-run
```

After running `init`, restart your agent IDE to load the MCP server. The Fulcrum tools will appear in your next session automatically.

## Adaptive compatibility matrix

Fulcrum now distinguishes packaging models instead of treating every runtime as the same:

| Runtime | Recommended path | Fulcrum mechanism |
|---------|------------------|-------------------|
| Claude Code | `plugin-first` | hooks, skills, rules, user-scope setup |
| Gemini CLI | `extension-first` | extension bundle + hook wiring |
| PI | `extension-first` | cockpit extension + native tools |
| Cursor | `rules-first` | project rules + local config |
| Windsurf | `rules-first` | rules + local config |
| Codex | `config-first` | `.codex/config.json` + `AGENTS.md` |
| opencode | `config-first` | `.opencode/config.json` + `.opencode/opencode.md` |

The adaptive planner reports which runtimes are detected on the current machine and which install path Fulcrum recommends for each one.

---

## Global install (from source — current working path)

If you only want Fulcrum wired into one agent runtime, use the scoped scripts:

```bash
pnpm run setup:claude   # ~/.local/bin symlink + Claude MCP + PreToolUse hook + CLAUDE.md
pnpm run setup:gemini   # ~/.local/bin symlink + Gemini extension + BeforeTool hook
pnpm run setup:pi       # ~/.local/bin symlink + pi install cockpit
fulcrum init --cursor   # .cursor/mcp.json + .cursor/rules/fulcrum.mdc
fulcrum init --windsurf # .windsurf/mcp.json + .windsurf/rules/fulcrum.mdc
fulcrum init --codex    # .codex/config.json
fulcrum init --opencode # .opencode/config.json + .opencode/opencode.md
```

Each scoped script runs the CLI-bin step first (so `fulcrum` always ends up on `PATH`) and then only the runtime-specific integration.

---

## Verify install

```bash
# 1. CLI on PATH
fulcrum --version
# → 0.0.1

# 2. Claude knows about the MCP server
claude mcp list
# → fulcrum   fulcrum serve mcp --mode filtered --runtime-capability hooks   user

# 3. Gemini extension present
ls ~/.gemini/extensions/fulcrum
# → extension.json   fulcrum.md   settings.json

# 4. CLAUDE.md contains the Fulcrum block
grep -A1 'fulcrum-mcp' ~/.claude/CLAUDE.md

# 5. Run the doctor
fulcrum doctor
# → ✓ green on every line

# 6. Auto-fix any detected issues
fulcrum doctor --fix

# 7. Inspect the agent-aware install plan
fulcrum install plan
```

If any of these fail, jump to [Troubleshooting](#troubleshooting).

---

## Per-project auto-init

This is the important bit: **you never run `fulcrum init`.** Running _any_ `fulcrum` command inside a project directory auto-creates the local state on first use.

The first time you run anything — `fulcrum task list`, `fulcrum memory status`, even `fulcrum --help` from inside a project — the CLI:

1. Creates `$CWD/.fulcrum/fulcrum.db` and runs migrations.
2. Computes a **deterministic workspace id and project id** from the current directory:
   ```text
   hash         = sha256(absolute_path)[:12]
   name         = basename(absolute_path), sanitized to [A-Za-z0-9_-], truncated to 24 chars
   workspace_id = ws_${name}_${hash}
   project_id   = proj_${name}_${hash}
   ```
   The same directory always resolves to the same IDs across runs; moving the project produces new IDs.
3. Creates the default workspace and project via the core CRUD functions (both calls are effectively idempotent — they check existence first and use `INSERT OR IGNORE`).
4. Writes `$CWD/.fulcrum.json` with those IDs plus `monitor_port: 4721`:
   ```json
   {
     "workspace_id": "ws_my_project_1a2b3c4d5e6f",
     "project_id":   "proj_my_project_1a2b3c4d5e6f",
     "monitor_port": 4721
   }
   ```
5. Prints a single `[fulcrum] initialized project "<name>" (<workspace_id>)` notice to stderr so it never corrupts MCP stdio traffic.

Because the IDs are deterministic, the MCP server, the Gemini extension, and the PI cockpit all resolve the same workspace and project without any extra coordination — they just read `.fulcrum.json`.

---

## Environment variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `FULCRUM_WORKSPACE_ID` | auto-derived | Overrides the workspace id resolved from `.fulcrum.json` |
| `FULCRUM_PROJECT_ID` | auto-derived | Overrides the project id resolved from `.fulcrum.json` |
| `FULCRUM_PORT` | `4721` | Monitor HTTP port for `fulcrum serve monitor` / `serve all` |
| `FULCRUM_VAULT_PATH` | `~/.fulcrum/vault` | L0 memory-vault directory |
| `FULCRUM_MONITOR_TOKEN` | unset | Bearer token for monitor write endpoints and TUI mutation actions |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | unset (disabled) | When set, spans dual-emit to this OTLP/HTTP endpoint (see [telemetry](./telemetry.md)) |
| `FULCRUM_AGENT_ADAPTER` | `stub` | Default adapter name for `spawnAgent()` (see [worker-adapters](./worker-adapters.md)) |
| `FULCRUM_AGENT_STUB_DIR` | unset | Directory of canned `<run_id>.json` worker results for the stub adapter |
| `FULCRUM_AGENT_SUBPROCESS_CMD` | unset | Command line that the `subprocess` adapter executes |
| `OTEL_SERVICE_NAME` | `fulcrum` | Service name reported to OTLP receivers |

Any of these can be set per-shell, per-project (via a `.envrc` / direnv file), or per-invocation.

---

## Memory vault setup

Fulcrum ships a three-layer memory stack. The `fulcrum memory init` wizard walks you through it interactively:

```bash
fulcrum memory init
```

The layers:

- **L0 — git vault.** Human-readable markdown files under `$FULCRUM_VAULT_PATH` (default `~/.fulcrum/vault`). Obsidian-compatible. This is the canonical store — L1 and L2 are rebuildable projections.
- **L1 — SQLite FTS5.** Full-text search on the vault contents, keyed by memory id and tags. Always on.
- **L2 — Kuzu graph + HNSW vector search.** Opt-in graph + semantic layer. Enable later with:
  ```bash
  fulcrum memory accelerate
  ```
  This reads every L0 memory, extracts entities, writes them into the Kuzu graph at `~/.fulcrum/kuzu`, and builds a local HNSW vector index using the ONNX embedding model.

Any time the vault gets out of sync with the derived layers, rebuild from L0:

```bash
fulcrum memory rebuild          # L1 only
fulcrum memory rebuild --both   # L1 + L2
```

Check layer status at any time:

```bash
fulcrum memory status
```

---

## Troubleshooting

### `fulcrum install plan` shows `cli-only`

No supported runtime markers were detected. Fulcrum will still work as a local CLI. Install the target agent first, then re-run `fulcrum install plan` or `fulcrum init --adaptive`.

### `fulcrum: command not found`

Your shell hasn't picked up `~/.local/bin`. Add the following to `~/.bashrc`, `~/.zshrc`, or `~/.config/fish/config.fish`:

```bash
export PATH="$HOME/.local/bin:$PATH"
```

Then either reopen your shell or `source` the rc file. `which fulcrum` should now resolve to `~/.local/bin/fulcrum`.

### `claude mcp add` fails

Two common causes:

1. **Claude CLI too old** — update it and re-run `pnpm run setup:claude`.
2. **Claude CLI missing entirely** — the installer falls back to editing `~/.claude.json` directly. Re-run `pnpm run setup` once `claude` is on `PATH`, or check `~/.claude.json` has an `mcpServers.fulcrum` entry.

You can always verify with `claude mcp list` and re-register manually:

```bash
claude mcp remove fulcrum --scope user
claude mcp add --scope user fulcrum fulcrum serve mcp --mode filtered --runtime-capability hooks
```

### Kuzu native build errors on first `pnpm install`

`kuzu` is a native dependency. If the prebuilt wheel isn't available for your platform, `pnpm install` will attempt a source build and may fail with a compiler error. The L2 layer is **opt-in** — you can ignore this and everything else still works. Fulcrum only loads Kuzu when you run `fulcrum memory accelerate`.

To suppress the build entirely:

```bash
PNPM_SKIP_BUILD_DEPS=kuzu pnpm install
```

### Embedding model download on first query

The ONNX embedding model (`bge-small-en-v1.5` by default) downloads on first use to `~/.cache/fulcrum/models/`. You'll see a one-time delay on the first `fulcrum serve mcp` / `serve monitor` / semantic-recall call. Subsequent runs load instantly from the cache.

If you're on an air-gapped machine, pre-populate the cache from a networked box and copy `~/.cache/fulcrum/models/` across.

### `[fulcrum] embedding init failed: …`

Usually means the ONNX runtime couldn't load. Re-run `pnpm install --force` to rebuild `onnxruntime-node`, or check that your Node version is 20 or newer.

### MCP server not showing up in Claude

Restart Claude Code after running the installer. User-scope MCP servers are loaded at Claude startup; a running Claude session won't pick up a newly-installed server until you relaunch it.

---

## Related

- [README.md](../../README.md) — top-level overview and architecture
- [cli-reference.md](./cli-reference.md) — every CLI command and flag
- [workflow-authoring.md](./workflow-authoring.md) — writing workflows for the runner
- [worker-adapters.md](./worker-adapters.md) — plugging in Claude / Gemini / PI worker adapters
- [telemetry.md](./telemetry.md) — span collection and OTLP export
