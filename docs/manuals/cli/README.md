# CLI user manual (`fulcrum`)

The Fulcrum CLI is one Bun-compiled binary that boots into either a one-shot
command (`fulcrum doctor`, `fulcrum init`, …) or, soon, an interactive TUI
(see `tui/README.md`). All commands emit a canonical `fulcrum.cli.v1`
envelope under `--json`.

## Getting started

```bash
# install (per project)
fulcrum init                           # creates AGENTS.md, .claude/CLAUDE.md, .gitignore
fulcrum install --profile minimal      # splices rules + hooks + skills into each detected agent
fulcrum doctor                         # confirms everything is wired
```

## Top-level help

`fulcrum --help` prints every subcommand and its one-line summary.

![fulcrum --help](../screenshots/cli/01-help.png)

```bash
fulcrum --version
```

![fulcrum --version](../screenshots/cli/02-version.png)

## doctor — system health

`fulcrum doctor` exercises every wired-up component: agent installs, hook
mounts, MCP servers, skill budgets, caveman mode, web/server reachability.

```bash
fulcrum doctor              # human-readable
fulcrum doctor --json       # canonical fulcrum.cli.v1 envelope; pipe to jq
```

![fulcrum doctor](../screenshots/cli/03-doctor.png) ![fulcrum doctor --json](../screenshots/cli/04-doctor-json.png)

Use the JSON form in CI; pipe it into `jq '.result.checks[] | select(.status!="ok")'`
to surface failures.

## hooks — recipe registration

```bash
fulcrum hooks list                     # show every recipe + which agents have it
fulcrum hooks enable <name>            # register the recipe across detected agents
fulcrum hook <name> [args...]          # run one recipe; reads a JSON envelope on stdin
```

Recipes: `format`, `lint-gate`, `pm-policy`, `test-on-edit`, `audit-log`,
`index-check`, `index-rebuild`, `router`.

![fulcrum hooks list](../screenshots/cli/05-hooks-list.png)

## skills — authored + upstream

```bash
fulcrum skills list                    # authored skills the orchestrator can sync
fulcrum skills list --installed        # what's actually installed in each agent
fulcrum skills sync                    # mirror authored skills to each agent
fulcrum skills upstream [--update-pins]  # mirror curated third-party skills
fulcrum skills lint <path>             # validate a SKILL.md
```

![fulcrum skills list](../screenshots/cli/06-skills-list.png) ![fulcrum skills list --installed](../screenshots/cli/07-skills-installed.png)

## install — bootstrap the agent layer

`fulcrum install` splices rules, mounts hooks, syncs skills, installs caveman.

```bash
fulcrum install --profile minimal      # rules + hooks (default)
fulcrum install --profile rules-only   # rules only, no hooks or skills
fulcrum install --profile full         # historical bootstrap (everything)
fulcrum install --with-project <dir>   # also drop rules/AGENTS.md into <dir>
fulcrum install --no-skills            # skip the skills sync step
fulcrum install --enable-all-mcps      # enable every builtin MCP across all agents
```

Re-running `fulcrum install` is idempotent — the sentinel-block splice only
replaces the previously-spliced block.

![fulcrum install --help](../screenshots/cli/08-install-help.png)

## init — bootstrap a project

`fulcrum init [DIR]` writes `AGENTS.md`, `.claude/CLAUDE.md`, and a
sensible `.gitignore` into `DIR` (default: cwd). Safe to re-run.

![fulcrum init --help](../screenshots/cli/09-init-help.png)

## compress — caveman-compress markdown

```bash
fulcrum compress                       # compress default targets in-place
fulcrum compress --check               # CI: fail if anything would change
fulcrum compress <files...>            # compress specific files
```

![fulcrum compress --help](../screenshots/cli/10-compress-help.png)

## Driving the CLI in a browser (ttyd)

For demos / docs / remote sessions:

```bash
brew install ttyd
ttyd -W -p 7681 -t titleFixed=fulcrum -t rendererType=dom \
  bash -lc 'fulcrum doctor; exec bash'
open http://localhost:7681/
```

Every screenshot in this manual was taken that way via `playwright-cli` in
Microsoft Edge.

## Troubleshooting

- `fulcrum: unknown command 'tui'` — TUI is a separate process, see
  `tui/README.md`.
- `fulcrum doctor` red flags on `mcp` — re-run `fulcrum install --enable-all-mcps`
  or check the failing server's auth config.
- Skills list empty — confirm `fulcrum skills sync` ran; check
  `~/.claude/plugins/cache/fulcrum/fulcrum/<ver>/skills/`.
- `fulcrum install` "already installed" — sentinel block is present; the run
  is a no-op by design.
