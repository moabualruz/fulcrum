# Fulcrum

> **Fulcrum is a local-first CLI Agent OS for supervising repositories, tasks, agent runs, context, memory, and artifacts.**

That is the destination. This branch (`feat/agent-foundation-clean`) is the foundation work — the cross-agent install layer, hooks, skills, rules, output policy, and CLI orchestrator that everything else sits on top of. The agent runtime, task system, memory store, and plugin/extension layer are placeholders, not implementations. See [`AGENTS.md`](AGENTS.md) for the full trajectory and [`HANDOVER.md`](HANDOVER.md) for the current state.

---

## What's shipped today (foundation)

| Layer | What it does | Where it lives |
|---|---|---|
| **Context** | Always-on rules and conventions, sentinel-spliced into each agent's primary rules file | `rules/AGENTS.md`, `fulcrum install` |
| **Automation** | Eight hook recipes (`format`, `lint-gate`, `pm-policy`, `test-on-edit`, `audit-log`, `index-check`, `index-rebuild`, `tool-output-router`) registered per-agent | `src/hooks/`, `fulcrum hooks enable` |
| **Capability** | 28 skills authored in-repo, content-verified against upstream, with 20-entry trigger evals each | `skills/`, `fulcrum skills sync` |
| **Capabilities** | Bring-your-own CLI tools, verified by `fulcrum doctor` | `docs/capabilities.md`, `fulcrum doctor` |
| **Output policy** | Per-tool output strategy (raw / status / summary / file) driving `tool-output-router` | `config/tool-output-policy.toml` |
| **Managed MCPs** | DeepWiki + context-mode routing; MCP registry CLI (`fulcrum mcp list/register/enable`) with 16 builtin servers registered default-disabled: github, repomix, semgrep, context7, tavily, playwright, cloudflare-* ×9, dart | `docs/mcp.md`, `src/cli/mcp-registry.ts`, `src/cli/mcp-builtins.ts`, `src/cli/mcp-cmd.ts` |
| **Orchestration** | One Bun-compiled cross-platform binary (`init`, `install`, `uninstall`, `hooks`, `skills`, `doctor`, `compress`, `hook`) | `src/`, `dist/fulcrum-<plat>` |
| **Cross-agent reach** | Same setup wired into Claude Code, Codex CLI, Gemini CLI, OpenCode, Pi CLI | `docs/agents.md`, `shims/` |

The orchestrator and all hook recipes are TypeScript subcommands of one Bun-compiled binary (60–120MB per platform; cross-compiled via `bun build --compile`). No bash, jq, yq, or Python required at runtime.

## What's not shipped yet (placeholders)

These are the layers the foundation is preparing for. They are **not built**; do not depend on them. They appear here so the trajectory is legible.

- **Repository supervisor** — multi-repo awareness, work-tree state, branch posture.
- **Task system** — durable units of work tracked across agent sessions.
- **Agent runs** — first-class agent invocations with inputs, transcripts, retries.
- **Context engine** — selecting and assembling what each run sees.
- **Memory** — persistent facts, decisions, references across sessions.
- **Artifacts** — outputs of runs (diffs, plans, reports) tracked and queryable.
- **Plugins / extensions** — third-party drop-ins under each agent's native namespacing convention.

---

## Principles

- **CLI and skills over MCP.** MCPs spawn long-running processes and consume 55k–100k tokens at startup with 5+ servers active — before your first message. A CLI + skill achieves the same with zero overhead.
- **Managed MCPs stay narrow.** Fulcrum manages DeepWiki for repo docs and context-mode for context routing/session continuity. The MCP registry (`fulcrum mcp`) ships 16 builtin entries default-disabled (github, repomix, semgrep, context7, tavily, playwright, cloudflare-* ×9, dart) — opt-in with `fulcrum mcp enable <name>`.
- **Capabilities are bring-your-own tools.** Install the workstation toolchain yourself, then use `fulcrum doctor` to verify what is present.
- **Behavioral rules, not knowledge.** Rules change what the agent *does*, not what it *knows*. `"Use ruff, never flake8"` works. `"Write clean code"` does nothing.
- **Agent-friendly tools output JSON.** `--json` / `--format json` is the selection criterion for every CLI in this stack.
- **Skill content correctness is not implied by lint.** Author against upstream `--help`, not memory.

---

## Skill namespacing — the `fulcrum:` prefix

Skills install under a `fulcrum/` subfolder in each agent's skills directory:

```
~/.claude/skills/fulcrum/<name>/SKILL.md
~/.codex/skills/fulcrum/<name>/SKILL.md
~/.config/opencode/skills/fulcrum/<name>/SKILL.md
~/.pi/agent/skills/fulcrum/<name>/SKILL.md
~/.gemini/extensions/fulcrum-skills/skills/<name>/SKILL.md   # extension is the namespace
```

This sets up the `fulcrum:<skill-name>` address space and matches the prefixing convention used by most plugin / extension systems. When that layer ships, the install shape already conforms.

---

## Documents

| Doc | Topic |
|---|---|
| [AGENTS.md](AGENTS.md) | Project-level instructions and trajectory |
| [HANDOVER.md](HANDOVER.md) | Current state, outstanding work, recent decisions |
| [docs/user-guide.md](docs/user-guide.md) | End-user guide — install, daily usage, hooks, skills, MCPs, FAQ |
| [docs/developer-guide.md](docs/developer-guide.md) | Developer guide — repo layout, architecture, adding hooks/MCPs/skills, testing, release |
| [docs/contributing.md](docs/contributing.md) | Contributing — commit format, branch policy, CI, compression contract, code style |
| [docs/context.md](docs/context.md) | Context layer — `CLAUDE.md`, `AGENTS.md` conventions |
| [docs/hooks.md](docs/hooks.md) | Automation layer — full event surface + 8 shipped recipes |
| [docs/tool-output-policy.md](docs/tool-output-policy.md) | Per-tool output strategies driving `tool-output-router` |
| [docs/capabilities.md](docs/capabilities.md) | Capability layer — bring-your-own CLI tool catalogue |
| [docs/skills.md](docs/skills.md) | Skills — paths, authoring template, fork policy, verification |
| [docs/skill-smoke-test.md](docs/skill-smoke-test.md) | Manual cross-agent verification checklist |
| [docs/mcp.md](docs/mcp.md) | MCP policy — managed DeepWiki/context-mode, opt-in extras, Pi adapter notes |
| [docs/agents.md](docs/agents.md) | Cross-agent translation — Codex, Gemini, OpenCode, Pi |
| [skills/SOURCES.md](skills/SOURCES.md) | Skill registry and authoring queue |

---

## Install

Two paths, both produce `~/.fulcrum/bin/fulcrum`:

**From a clone (builds locally; needs [Bun](https://bun.sh)):**

```bash
curl -fsSL https://bun.sh/install | bash      # if Bun isn't installed
git clone https://github.com/moabualruz/fulcrum ~/code/fulcrum
cd ~/code/fulcrum
bash scripts/install.sh                       # builds, installs, splices rules, syncs skills
bash scripts/install.sh --with-project ~/code/myproject   # also bootstrap a project
bash scripts/install.sh --dry-run --no-skills # preview only; skip skill sync (forwards flags to `fulcrum install`)
```

**From a published release (no Bun needed; only `curl`):**

```bash
FULCRUM_RELEASE_TAG=v0.1.0 bash <(curl -fsSL https://raw.githubusercontent.com/moabualruz/fulcrum/main/scripts/install.sh)
```

> **Older Macs / Apple Silicon:** binaries are native per-arch (`darwin-x64`, `darwin-arm64`). No Rosetta needed. If the auto-detect picks the wrong arch on an unusual setup, set `FULCRUM_BIN=/path/to/fulcrum-<plat>` explicitly.

After install, common commands:

```bash
fulcrum init <dir>            # bootstrap project: AGENTS.md + .claude/CLAUDE.md +
                              # vendor integrations (graphify, caveman, ast-grep, tavily
                              # via npx skills add; pi-mcp-adapter init for Pi)
fulcrum init --dry-run <dir>  # preview without writing
fulcrum init reindex <dir>    # run repomix --compress in <dir> (no --output override)

fulcrum doctor                # bun, agent dirs, tool presence, policy health
fulcrum install --dry-run     # preview rules, skills, DeepWiki, and project bootstrap
fulcrum install --no-skills   # skip all skill sync
fulcrum install --no-upstream-skills  # skip curated upstream skill sync
fulcrum hooks list            # show available hook recipes
fulcrum hooks enable format   # register native agent hook configs + print snippet
fulcrum skills sync           # re-sync skills/ to each agent's skills/fulcrum/ folder
fulcrum skills upstream       # sync curated third-party skills at vendor placement
fulcrum skills list           # enumerate authored skills with eval coverage
fulcrum skills lint <path>    # validate frontmatter + body section structure
fulcrum hook <name>           # run a hook recipe (called by agent runtimes via stdin)
fulcrum uninstall --dry-run   # preview removal of Fulcrum-managed install artifacts
```

### Verify

```bash
bun run ci                    # install → tsc → test → build:all → skills lint
fulcrum doctor                # post-install environment check
fulcrum uninstall --dry-run   # preview what Fulcrum would remove
```

### Author + release

```bash
bun run changelog             # regenerate CHANGELOG.md (needs git-cliff)
bun run release vX.Y.Z        # gated release: clean tree → ci → changelog → tag → build
bun run release vX.Y.Z --gh   # also create the GitHub release and upload dist/*
```

---

## Skills authored

27 in-repo skills (`fulcrum skills list` enumerates them with eval coverage). All content-verified against upstream READMEs and docs:

```
bat   biome   dart-toolchain   difftastic   direnv   eza   flarectl   fzf
git-cliff   gitleaks   google-java-format   hyperfine   jq   just   ktlint
lizard   mise   osv-scanner   pmd   ruff   sd   spotbugs   usql
watchexec   xh   yq   zoxide
```

(`gh` skill archived — superseded by the github MCP server; see `skills/_archive/gh-authored/`.)

See [`skills/SOURCES.md`](skills/SOURCES.md) for the registry and the long-tail authoring queue.

---

## Reading order for a fresh install

1. **[capabilities.md](docs/capabilities.md)** — bring your own CLI tools, then verify them with `fulcrum doctor`.
2. **[context.md](docs/context.md)** — write your global rules and per-project `AGENTS.md`.
3. **[hooks.md](docs/hooks.md)** — enable the recipes you want; `fulcrum hooks enable` edits native agent configs and prints each snippet for review.
4. **[skills.md](docs/skills.md)** — install superpowers as the cross-agent base; author skills via the template.
5. **[mcp.md](docs/mcp.md)** — managed DeepWiki/context-mode policy, MCP registry CLI, and opt-in server boundaries.
6. **[agents.md](docs/agents.md)** — replicate the setup on Codex, Gemini, OpenCode, Pi as needed.
