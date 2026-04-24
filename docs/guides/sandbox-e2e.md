# Sandboxed E2E

Fulcrum ships a Dagger-driven Docker harness for full integration and E2E checks without
writing to the developer repo or original agent configuration.

```bash
pnpm run sandbox:e2e:plan
pnpm run sandbox:e2e -- --smoke
pnpm run sandbox:e2e
```

The sandbox uses the pinned Playwright image `mcr.microsoft.com/playwright:v1.59.1-noble`,
copies the source snapshot from `/src` into `/work/fulcrum`, and runs all mutable work
there. The harness exports only `sandbox-reports/dagger-e2e`.

## Isolation Model

- Host repo enters Dagger as an explicit directory snapshot with `.git`, `node_modules`,
  runtime DBs, local Fulcrum state, reports, and `.env*` files excluded.
- `/src` is made read-only in the container, then copied to `/work/fulcrum`.
- Root-local agent config paths such as `.claude`, `.codex`, `.cursor`, and `.windsurf`
  are excluded from the source snapshot, then explicitly remounted read-only and copied
  into `/work/fulcrum` when they exist in the original repo. Generated artifacts under
  `agent-integration/` stay present for installer tests.
- `$HOME`, `XDG_CONFIG_HOME`, `XDG_DATA_HOME`, `FULCRUM_DATA_DIR`, `FULCRUM_VAULT_PATH`,
  and `FULCRUM_AGENT_STUB_DIR` all point under `/sandbox`.
- Original agent config paths are mounted read-only under `/host-config`, then copied
  into sandbox `$HOME` so CLIs can mutate disposable copies.
- Shared agent support paths are mounted read-only under `/host-support-config`, then
  copied into sandbox `$HOME`: `~/.agents`, `~/.raise`, `~/.gitconfig`,
  `~/.config/gh`, `~/.local/share/gh`, and `~/.cache/gh` when present. This carries
  skills, rules, profile state, and GitHub CLI auth into the sandbox copy.
- Project-local agent config paths are mounted read-only under `/host-project-config`,
  then copied into `/work/fulcrum`: `.claude`, `.claude.json*`, `.codex`, `.cursor`,
  `.gemini`, `.opencode`, `.pi`, `.windsurf`, and `.pi-lens` when present.
- Environment credentials are injected as Dagger secrets only when a live-agent path is
  enabled and that runtime is eligible.
- Container writes do not return to the host unless the harness exports reports.

## Command Matrix

Default full mode runs:

```bash
pnpm install --frozen-lockfile
pnpm build
pnpm test
pnpm run check:cycles
pnpm --dir scripts test -- surface-inventory config-integrity sandbox-e2e
pnpm --dir scripts test -- sandbox-scenarios
pnpm --dir packages/cli exec vitest run src/tests/install-verify.test.ts src/tests/install-verify-mode-version-pr148.test.ts src/tests/init-cursor.test.ts src/tests/install-fanout-utilization.test.ts
pnpm run setup:dry
FULCRUM_SETUP_NO_GATE=1 pnpm run setup
pnpm run setup:check
./fulcrum install apply --all
./fulcrum install verify --agent cursor
./fulcrum install verify --agent windsurf
./fulcrum install verify --agent codex
./fulcrum install verify --agent opencode
./fulcrum install verify --agent copilot
pnpm run e2e:sandbox-scenarios
pnpm run e2e:agent-chat
pnpm run e2e:monitor
```

`--smoke` keeps `pnpm build`, install/setup/project-agent/monitor checks, but skips broad
`pnpm test` and `check:cycles`.

## Scenario Crawler

`pnpm run e2e:sandbox-scenarios` runs human-style CLI scenarios through a PTY when
`script(1)` is available. It discovers the current CLI/action surface from
`fulcrum --help`, `fulcrum action list --json`, and `fulcrum tool list --json`; runs
stable core scenarios; screenshots root command help; probes read-like action and tool
compatibility paths as crawl-only scenarios; and reports write/gated surfaces as
candidates that need seeded payloads before codification. Subcommand help is reported
but not executed because some Fulcrum subcommands currently treat trailing `--help` as
real execution.

Artifacts are written under `${FULCRUM_E2E_REPORT_DIR:-sandbox-reports}/cli-scenarios/`:

- `scenario-results.json` — machine-readable pass/fail, exit code, command, and paths.
- `codification-recommendations.json` — per-scenario `codify`, `crawl-only`, or
  `investigate` decisions, including newly discovered surfaces.
- `scenario-report.md` — summary plus codify/crawl-only/investigate recommendations.
- `review.html` — Backstop-like review gallery with terminal screenshots, checkboxes,
  and browser-local notes.
- `review-notes.md` — markdown note-taking template for follow-up fixes.

## Approval and Gold Baseline

The HTML review pages are for visual inspection and note-taking. Durable approval is a
separate explicit step that copies the current CLI and UI screenshots into
`tests/golden/sandbox/`, writes hashes, and creates a gold review gallery:

```bash
pnpm run sandbox:approve -- \
  --from sandbox-reports/dagger-e2e-smoke-latest \
  --approved-by "$USER" \
  --note "accepted sandbox smoke"
```

Gold artifacts:

- `tests/golden/sandbox/approval.json` — approved screenshot list with SHA-256 hashes.
- `tests/golden/sandbox/review.html` — approved gold gallery.
- `tests/golden/sandbox/cli-scenarios/screenshots/*.png` — CLI terminal gold shots.
- `tests/golden/sandbox/ui-crawl/*.png` — monitor UI gold shots.

Compare a later run against the approved gold:

```bash
pnpm run sandbox:gold:check -- --from sandbox-reports/dagger-e2e-smoke-latest
```

Compare artifacts are written into the report directory:

- `gold-compare.json`
- `gold-compare.md`
- `gold-compare.html`

The check uses exact screenshot hashes. Treat failures as a review queue: approve the
new run when the visual change is intended, or fix the regression and rerun.

## Live Agent CLI Path

Live agent installs are off by default. Enable them only when credentials may be used:

```bash
FULCRUM_SANDBOX_LIVE_AGENTS=1 pnpm run sandbox:e2e -- --smoke
# or
pnpm run sandbox:e2e -- --live-agents --smoke
```

Each runtime is installed only when the sandbox sees copied config plus credentials or
credential-bearing config:

| Runtime | Config copied from host | Credential env | Default install |
|---------|--------------------------|----------------|-----------------|
| Claude | `~/.claude`, `~/.claude.json*`, `~/.config/Claude*`, `~/.local/share/claude*`, `~/.local/state/claude`, `~/.cache/claude*` | `ANTHROPIC_API_KEY`, `CLAUDE_API_KEY` | `npm install -g @anthropic-ai/claude-code` |
| Gemini | `~/.gemini`, `~/.config/gemini`, `~/.local/share/gemini`, `~/.local/state/gemini`, `~/.cache/gemini` | `GEMINI_API_KEY`, `GOOGLE_API_KEY` | `npm install -g @google/gemini-cli` |
| Codex | `~/.codex`, `~/.config/Codex`, `~/.local/state/codex`, `~/.cache/codex*` | `OPENAI_API_KEY` | `npm install -g @openai/codex` |
| PI | `~/.pi`, `~/.config/pi`, `~/.local/share/pi`, `~/.local/state/pi`, `~/.cache/pi`, `~/.pi-lens` | `PI_API_KEY` | set `FULCRUM_SANDBOX_INSTALL_PI` |
| opencode | `~/.config/opencode`, `~/.opencode`, `~/.local/share/opencode`, `~/.local/state/opencode`, `~/.cache/opencode`, desktop config/data/cache | `OPENCODE_API_KEY`, `ANTHROPIC_API_KEY`, `OPENAI_API_KEY` | `npm install -g opencode-ai` |
| Copilot | `~/.config/github-copilot`, `~/.copilot`, `~/.cache/copilot` | `GITHUB_TOKEN`, `GH_TOKEN` | `npm install -g @github/copilot` |
| Cursor | `~/.cursor`, `~/.config/Cursor`, `~/.local/share/Cursor`, `~/.cache/Cursor` | config-only | set `FULCRUM_SANDBOX_INSTALL_CURSOR` |
| Windsurf | `~/.windsurf`, `~/.config/Windsurf`, `~/.local/share/Windsurf`, `~/.cache/Windsurf` | config-only | set `FULCRUM_SANDBOX_INSTALL_WINDSURF` |

Missing config, missing binary, missing credentials, or missing install command is a
skip. A selected CLI that reaches the binary with copied auth/config and then reports
invalid or missing auth is a failure. The skip/fail matrix is written to
`sandbox-reports/dagger-e2e/live-agents.md` and `agent-chat/agent-chat-report.md`.

When live agents are enabled, the harness also sets `FULCRUM_SANDBOX_AGENT_CHAT=1`
and runs `pnpm run e2e:agent-chat`. Each supported installed CLI receives the same
short prompt:

```text
Run exactly: bash sandbox-agent-fixture/agent-task.sh <agent>
Then reply exactly: FULCRUM_AGENT_CHAT_DONE <agent>
```

The fixture script invokes Fulcrum skills, tool/action discovery, `write_memory`, every
Fulcrum hook runtime, sample code tests, DB validation, and monitor `/status`, `/tasks`,
and `/memory/stats` checks. Artifacts are written under
`${FULCRUM_E2E_REPORT_DIR:-sandbox-reports}/agent-chat/`.

Agent chat writes a redacted auth audit for every selected CLI: copied config paths,
file names, sizes, and present credential env names only; secret values are never
printed. Missing binaries are skipped. A selected CLI that reaches the binary and
reports invalid or missing auth is a failure. Live-agent sandbox runs set
`FULCRUM_AGENT_CHAT_REQUIRE_AUTH=1` by default so auth failures fail the run; set it
to `0` only when collecting exploratory evidence. Set `FULCRUM_AGENT_CHAT_STRICT=1`
to make any reported agent-chat failure fail the run.

## Monitor E2E

The Playwright checks can run directly:

```bash
pnpm run e2e:monitor
```

It starts `fulcrum serve monitor` with fake home/data/vault paths under
`${FULCRUM_E2E_REPORT_DIR:-sandbox-reports}/`, checks `/status`, verifies the dashboard
shell renders, and crawls visible interactive controls. The UI crawl writes screenshots,
`ui-crawl.json`, `ui-review.md`, and a note-taking `ui-review.html` gallery under
`ui-crawl/`. Traces, videos, and full-page failure screenshots are kept by Playwright.
