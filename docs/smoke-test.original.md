# Fulcrum Setup Smoke Test

## Purpose

This file serves dual purpose: it is a structured prompt that any of the five supported agents (Claude Code, Codex CLI, Gemini CLI, OpenCode, Pi CLI) can execute directly, and it is a checklist + result template for recording what passed or failed. Run it after a fresh install, after upgrading Fulcrum, or after changing agent config. "Pass" means every required check (checks 1–8) reports the expected value; optional checks (check 9) may have partial results depending on which MCPs are enabled without failing the overall verdict.

---

## How to run

### Manual

Copy the **Prompt body** section below into the agent's input and let it work through the steps in order.

### Automated

Run the agent non-interactively with this file as the prompt. Use the exact command for your agent:

```bash
# Claude Code
claude -p "$(cat docs/smoke-test.md)" --output-format json

# Codex CLI
codex "$(cat docs/smoke-test.md)"

# Gemini CLI
gemini -p "$(cat docs/smoke-test.md)" --output-format json --yolo

# OpenCode
opencode run --format json "$(cat docs/smoke-test.md)"

# Pi CLI
pi --print "$(cat docs/smoke-test.md)" --mode json --no-session
```

When run from outside the repo, replace `docs/smoke-test.md` with the absolute path to this file.

---

## Prompt body

You are running a Fulcrum setup verification. Work through each numbered step below in order. For each step, run the CHECK command (or read the CHECK path), compare the result to EXPECT, and write the outcome to the RECORD location. When a check fails, record the actual value and continue — do not abort. After all steps, write the completed result table to the RECORD path in step 10.

Prerequisite: `fulcrum` must be on PATH. If not found, try `~/.fulcrum/bin/fulcrum`. If still not found, record "fulcrum binary not found" for every check and stop.

---

### Step 1 — Doctor verdict

```
CHECK:  fulcrum doctor --json | jq -r '.verdict'
EXPECT: "ok" (or "warning" — both are acceptable; "error" is a failure)
RECORD: row 1 of result table
```

---

### Step 2 — Agent count

```
CHECK:  fulcrum doctor --json | jq '[.agents[] | select(.detected == true)] | length'
EXPECT: a number 1–5 (at least the current agent must be detected)
RECORD: row 2 of result table
```

---

### Step 3 — Tool count

```
CHECK:  fulcrum doctor --json | jq '.tools | length'
EXPECT: 47 (the canonical tool roster; fewer means doctor binary is outdated)
RECORD: row 3 of result table
```

---

### Step 4 — Caveman defaultMode

```
CHECK:  fulcrum doctor --json | jq -r '.caveman.defaultMode'
EXPECT: "ultra"
RECORD: row 4 of result table
```

---

### Step 5 — Pi MCP adapter

```
CHECK:  fulcrum doctor --json | jq '{adapterPresent: .piMcpAdapter.adapterPresent, deepwikiPresent: .piMcpAdapter.deepwikiPresent}'
EXPECT: {"adapterPresent": true, "deepwikiPresent": true} if Pi CLI is installed; {"adapterPresent": false, "deepwikiPresent": false} if Pi is absent (not a failure)
RECORD: row 5 of result table
```

---

### Step 6 — MCP section present in doctor

```
CHECK:  fulcrum doctor --json | jq 'has("mcp")'
EXPECT: true
RECORD: row 6 of result table
```

---

### Step 7 — MCP list: 16 builtin servers registered

```
CHECK:  fulcrum mcp list --json | jq 'length'
EXPECT: 16
RECORD: row 7 of result table
```

Expected builtins: github, repomix, semgrep, context7, tavily, playwright, dart, cloudflare-docs, cloudflare-workers-bindings, cloudflare-workers-builds, cloudflare-observability, cloudflare-radar, cloudflare-logpush, cloudflare-browser, cloudflare-containers, cloudflare-ai-gateway.

---

### Step 8 — MCP auth_status for each managed server

```
CHECK:  fulcrum doctor --json | jq '[.mcp.servers[] | {name, auth_status}]'
EXPECT: every entry is "ok" or "n/a" — any entry showing "missing-env:<VAR>" means the listed env var is not set
RECORD: row 8 of result table; for each missing-env entry, note the var name in Notes column
```

---

### Step 9 — Rules splice present in each detected agent

For each agent whose `detected` field is `true` in step 2, run the corresponding check:

```
CHECK (Claude Code):  grep -c 'BEGIN FULCRUM RULES' ~/.claude/CLAUDE.md
CHECK (Codex CLI):    grep -c 'BEGIN FULCRUM RULES' ~/.codex/AGENTS.md
CHECK (Gemini CLI):   grep -c 'BEGIN FULCRUM RULES' ~/AGENTS.md
CHECK (OpenCode):     grep -c 'BEGIN FULCRUM RULES' ~/.config/opencode/AGENTS.md
CHECK (Pi CLI):       grep -c 'BEGIN FULCRUM RULES' ~/.pi/agent/AGENTS.md

EXPECT: 1 for each detected agent (sentinel present exactly once)
RECORD: row 9 of result table; note which agents have 0 or >1
```

---

### Step 10 — Caveman install state per detected agent

```
CHECK:  fulcrum doctor --json | jq '[.caveman.agents[] | {label, cavemanInstalled: .installed}]'
EXPECT: every detected agent has "cavemanInstalled": true
RECORD: row 10 of result table; note any agent where cavemanInstalled is false
```

---

### Step 11 — Authored skills present (28 skills, 5 agents)

For each detected agent, verify the authored skill namespace exists:

```
CHECK (Claude Code):  jq -r '.plugins | keys[]' ~/.claude/plugins/installed_plugins.json 2>/dev/null | grep -c '^fulcrum@fulcrum$'
                      # then: ls ~/.claude/plugins/cache/fulcrum/fulcrum/*/skills 2>/dev/null | wc -l | tr -d ' '
CHECK (Codex CLI):    ls ~/.codex/skills/fulcrum/ 2>/dev/null | wc -l | tr -d ' '
CHECK (Gemini CLI):   ls ~/.gemini/extensions/fulcrum-skills/skills/ 2>/dev/null | wc -l | tr -d ' '
CHECK (OpenCode):     ls ~/.config/opencode/skills/fulcrum/ 2>/dev/null | wc -l | tr -d ' '
CHECK (Pi CLI):       ls ~/.pi/agent/skills/fulcrum/ 2>/dev/null | wc -l | tr -d ' '

EXPECT (Claude): 1 (plugin registered) + 28 skill dirs in cached plugin tree
EXPECT (others): 28 per detected agent
RECORD: row 11 of result table; note agent name and actual count for any mismatch
```

---

### Step 12 — Curated upstream skills

```
CHECK:  rg -c '^\[skills\.' skills/upstream.lock
CHECK (Claude Code):  test -d ~/.claude/skills/superpowers-using-superpowers || test -d ~/.claude/skills/playwright-cli
CHECK (Codex CLI):    test -d ~/.codex/skills/superpowers-using-superpowers || test -d ~/.codex/skills/playwright-cli
CHECK (Gemini CLI):   test -d ~/.gemini/skills/superpowers-using-superpowers || test -d ~/.gemini/skills/playwright-cli
CHECK (OpenCode):     test -d ~/.config/opencode/skills/superpowers-using-superpowers || test -d ~/.config/opencode/skills/playwright-cli
CHECK (Pi CLI):       test -d ~/.pi/agent/skills/superpowers-using-superpowers || test -d ~/.pi/agent/skills/playwright-cli

EXPECT: lock count is 19; detected agents have at least one mirrored curated skill at vendor placement
RECORD: row 12; note agent + missing representative skill for any mismatch
```

---

### Step 13 — Hooks: enabled set

```
CHECK:  fulcrum hooks list --json 2>/dev/null || fulcrum hooks list
EXPECT: output lists the hook recipes; at minimum the recipe names appear: format, lint-gate, pm-policy, test-on-edit, audit-log, index-check, index-rebuild, tool-output-router
RECORD: row 13 of result table; note which recipes are shown as enabled vs available
```

---

### Step 14 — Hook smoke: format stub

```
CHECK:  printf '{"tool":"Write","path":"/tmp/smoke.ts","content":""}' | fulcrum hook format
EXPECT: command exits 0 (may print nothing or a status line — the exit code is what matters)
RECORD: row 14 of result table; record exit code
```

---

### Step 15 — CI gate (repo root only)

Run this check only if the current working directory is the Fulcrum repo root (i.e., `package.json` contains `"name": "fulcrum"` in the current directory).

```
CHECK:  bun run ci
EXPECT: 6 stages green: install, tsc, test, build:all, skills:lint, compress:check
RECORD: row 15 of result table; for any failing stage, record the stage name
```

---

### Step 16 — Optional: HTTP MCP reachability

```
CHECK:  fulcrum doctor --json | jq '[.mcp.servers[] | select(.transport == "http") | {name, reachable}]'
EXPECT: each enabled HTTP MCP has "reachable": true; disabled MCPs may show false (not a failure)
RECORD: row 16 of result table; for each "reachable": false on an enabled MCP, note "not reachable: <name>"
```

---

### Final step — Write results

Save the completed result table below to:

```
~/.fulcrum/state/global/smoke-test/<ISO-date>.md
```

Where `<ISO-date>` is today's date in `YYYY-MM-DD` format. Create the directory if it does not exist. If a file for today already exists, append a separator (`---`) and the new table after the existing content — never overwrite. The directory itself is a log; each run is a timestamped record. If the agent sandbox blocks writes to `~/.fulcrum`, print the completed table in the final response and record that the canonical append was blocked; the supervising caller should append the table outside that sandbox.

Create the directory:
```bash
mkdir -p ~/.fulcrum/state/global/smoke-test
```

---

## Result template

Fill in `<fill>` for Got, Status, and Notes columns. Status: `✓` for pass, `✗` for fail, `?` for skip/not-applicable.

```markdown
# Fulcrum Smoke Test — <ISO-date> <HH:MM> UTC

Agent: <agent name>
Host:  <hostname>

| # | Check | Expected | Got | Status | Notes |
|---|---|---|---|---|---|
| 1 | doctor verdict | ok or warning | <fill> | <fill> | <fill> |
| 2 | detected agents | ≥1 | <fill> | <fill> | <fill> |
| 3 | tool count | 47 | <fill> | <fill> | <fill> |
| 4 | caveman defaultMode | ultra | <fill> | <fill> | <fill> |
| 5 | Pi MCP adapter | present if Pi installed | <fill> | <fill> | <fill> |
| 6 | mcp section in doctor | true | <fill> | <fill> | <fill> |
| 7 | 16 builtin MCP servers | 16 | <fill> | <fill> | <fill> |
| 8 | MCP auth_status | ok or n/a for each | <fill> | <fill> | list any missing-env vars |
| 9 | rules splice (per agent) | 1 per detected agent | <fill> | <fill> | <fill> |
| 10 | caveman installed (per agent) | true for each detected | <fill> | <fill> | <fill> |
| 11 | authored skills count | 28 per detected agent | <fill> | <fill> | <fill> |
| 12 | curated upstream skills | lock count 19 + representative skill present per detected | <fill> | <fill> | <fill> |
| 13 | hooks list | 8 recipes shown | <fill> | <fill> | <fill> |
| 14 | hook format smoke | exit 0 | <fill> | <fill> | <fill> |
| 15 | bun run ci (repo only) | 6 stages green | <fill> | <fill> | skip if not in repo root |
| 16 | HTTP MCP reachability (opt) | reachable: true (enabled) | <fill> | <fill> | <fill> |

Overall verdict: PASS / PARTIAL / FAIL
```

---

## Failure remediation

| Symptom | Where to look |
|---|---|
| `fulcrum` not found | Run `bash scripts/install.sh` from the repo root, or set `FULCRUM_RELEASE_TAG=vX.Y.Z` and re-run. See README.md §Install. |
| verdict: "error" from doctor | `fulcrum doctor` (human output) lists each failing item. See HANDOVER.md §6.0a §F for interpretation. |
| detected agent count 0 | The agent's config directory (`~/.claude`, `~/.codex`, `~/.gemini`, `~/.config/opencode`, `~/.pi/agent`) does not exist. Install the agent first. See docs/agents.md. |
| tool count < 47 | Fulcrum binary is outdated. Rebuild with `bun run scripts/build-all.ts` or fetch a newer release. |
| caveman defaultMode not "ultra" | `~/.config/caveman/config.json` is missing or has wrong value. Re-run `fulcrum install` or see docs/caveman.md. |
| Pi adapter missing | `pi install npm:pi-mcp-adapter` was not run, or Pi CLI was not installed when `fulcrum install` ran. See docs/mcp.md §3.3. |
| mcp section absent | Doctor binary predates W2. Rebuild from current source. |
| builtin MCP count < 16 | Registry file is stale or was not written. Run `fulcrum install` to re-register builtins. |
| missing-env:<VAR> in auth_status | The env var is not exported in the current shell. See docs/mcp.md §5 for per-MCP token sources; see HANDOVER.md §6.0a §C for the secrets file layout. |
| rules splice missing (grep returns 0) | `fulcrum install` was not run, or the agent's rules file was replaced after install. Re-run `fulcrum install`. See docs/context.md. |
| caveman not installed for an agent | `fulcrum install` was run before the agent was installed. Re-run `fulcrum install`. See docs/caveman.md. |
| authored skill count < 27 | `fulcrum skills sync` was not run or the agent's skills dir was removed. Run `fulcrum skills sync`. See docs/skills.md. |
| upstream skill count < 27 | `fulcrum skills upstream` failed (integrity check mismatch or network). Run `fulcrum skills upstream` with debug output. See HANDOVER.md §6.0b. |
| hooks list empty or partial | Hooks were never enabled. Run `fulcrum hooks enable <name>` for each recipe. See docs/hooks.md. |
| hook format exits non-zero | stdin envelope was malformed, or the binary is stale. See docs/hooks.md §format recipe. |
| bun run ci fails | See the failing stage in the CI output. Common: test failures (run `bun test`), compress:check (run `bun run compress`), skills:lint (run `fulcrum skills lint`). |
| HTTP MCP not reachable (enabled) | Network issue or service down. Check the MCP vendor's status page. See docs/mcp.md §3. |

---

## Result-recording protocol

Results are saved to:

```
~/.fulcrum/state/global/smoke-test/
```

File naming: `<YYYY-MM-DD>.md` (one file per calendar day). Subsequent runs on the same day **append** (with a `---` separator) — they do not overwrite. This directory is a chronological log of every verification run on the machine.

```bash
# Create directory (idempotent)
mkdir -p ~/.fulcrum/state/global/smoke-test

# Append result (replace DATE and CONTENT as appropriate)
DATE=$(date +%Y-%m-%d)
printf '\n---\n%s\n' "$CONTENT" >> ~/.fulcrum/state/global/smoke-test/${DATE}.md
```

To list all past runs:
```bash
ls -lt ~/.fulcrum/state/global/smoke-test/
```

To read the most recent:
```bash
cat ~/.fulcrum/state/global/smoke-test/$(ls -t ~/.fulcrum/state/global/smoke-test/ | head -1)
```
