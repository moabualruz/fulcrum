# Fulcrum Setup Smoke Test

## Purpose

Dual-purpose file: structured prompt any of 5 agents (Claude Code, Codex CLI, Gemini CLI, OpenCode, Pi CLI) can execute directly, and checklist + result template. Run after fresh install, upgrade, or config change. "Pass" = every required check (1–8 in prompt body, rows 1–15 in table) reports expected value. Optional checks (row 16) may be partial without failing overall verdict.

---

## How to run

### Manual

Copy **Prompt body** section into agent input; let it work through steps in order.

### Automated

Run agent non-interactively with this file as prompt. Exact command per agent:

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

When run from outside repo, replace `docs/smoke-test.md` with absolute path to this file.

---

## Prompt body

You are running Fulcrum setup verification. Work through each numbered step in order. For each step: run CHECK command (or read CHECK path), compare to EXPECT, write outcome to RECORD. When check fails, record actual value and continue — do not abort. After all steps, write completed result table to RECORD path in step 16.

Prerequisite: `fulcrum` must be on PATH. If not found, try `~/.fulcrum/bin/fulcrum`. If still not found, record "fulcrum binary not found" for every check and stop.

---

### Step 1 — Doctor verdict

```
CHECK:  fulcrum doctor --json | jq -r '.verdict'
EXPECT: "ok" or "warning" (both acceptable); "error" is failure
RECORD: row 1 of result table
```

---

### Step 2 — Agent count

```
CHECK:  fulcrum doctor --json | jq '[.agents[] | select(.detected == true)] | length'
EXPECT: 1–5 (at least current agent must be detected)
RECORD: row 2 of result table
```

---

### Step 3 — Tool count

```
CHECK:  fulcrum doctor --json | jq '.tools | length'
EXPECT: 47 (canonical tool roster; fewer = outdated doctor binary)
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
EXPECT: {"adapterPresent": true, "deepwikiPresent": true} if Pi installed; {"adapterPresent": false, "deepwikiPresent": false} if Pi absent (not failure)
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
CHECK:  fulcrum mcp list --json | jq '[.[] | select(.builtin == true)] | length'
EXPECT: 16
RECORD: row 7 of result table
```

Expected builtins: github, repomix, semgrep, context7, tavily, playwright, dart, cloudflare-docs, cloudflare-workers-bindings, cloudflare-workers-builds, cloudflare-observability, cloudflare-radar, cloudflare-logpush, cloudflare-browser, cloudflare-containers, cloudflare-ai-gateway.

---

### Step 8 — MCP auth_status per managed server

```
CHECK:  fulcrum doctor --json | jq '[.mcp.servers[] | {name, auth_status}]'
EXPECT: every entry "ok" or "n/a"; any "missing-env:<VAR>" = env var not set
RECORD: row 8 of result table; for each missing-env entry, note var name in Notes
```

---

### Step 9 — Rules splice in each detected agent

For each agent where `detected == true` in step 2:

```
CHECK (Claude Code):  grep -c 'BEGIN FULCRUM RULES' ~/.claude/CLAUDE.md
CHECK (Codex CLI):    grep -c 'BEGIN FULCRUM RULES' ~/.codex/AGENTS.md
CHECK (Gemini CLI):   grep -c 'BEGIN FULCRUM RULES' ~/AGENTS.md
CHECK (OpenCode):     grep -c 'BEGIN FULCRUM RULES' ~/.config/opencode/AGENTS.md
CHECK (Pi CLI):       grep -c 'BEGIN FULCRUM RULES' ~/.pi/agent/AGENTS.md

EXPECT: 1 per detected agent (sentinel present exactly once)
RECORD: row 9; note agents with 0 or >1
```

---

### Step 10 — Caveman install per detected agent

```
CHECK:  fulcrum doctor --json | jq '[.agents[] | select(.detected == true) | {id, cavemanInstalled: .caveman.installed}]'
EXPECT: every detected agent has "cavemanInstalled": true
RECORD: row 10; note any agent where false
```

---

### Step 11 — Authored skills (27 per detected agent)

```
CHECK (Claude Code):  ls ~/.claude/skills/fulcrum/ 2>/dev/null | wc -l | tr -d ' '
CHECK (Codex CLI):    ls ~/.codex/skills/fulcrum/ 2>/dev/null | wc -l | tr -d ' '
CHECK (Gemini CLI):   ls ~/.gemini/extensions/fulcrum-skills/skills/ 2>/dev/null | wc -l | tr -d ' '
CHECK (OpenCode):     ls ~/.config/opencode/skills/fulcrum/ 2>/dev/null | wc -l | tr -d ' '
CHECK (Pi CLI):       ls ~/.pi/agent/skills/fulcrum/ 2>/dev/null | wc -l | tr -d ' '

EXPECT: 27 per detected agent
RECORD: row 11; note agent + actual count for any mismatch
```

---

### Step 12 — Upstream skills (27 per detected agent)

```
CHECK (Claude Code):  ls ~/.claude/skills/fulcrum-upstream/ 2>/dev/null | wc -l | tr -d ' '
CHECK (Codex CLI):    ls ~/.codex/skills/fulcrum-upstream/ 2>/dev/null | wc -l | tr -d ' '
CHECK (Gemini CLI):   ls ~/.gemini/extensions/fulcrum-upstream-skills/skills/ 2>/dev/null | wc -l | tr -d ' '
CHECK (OpenCode):     ls ~/.config/opencode/skills/fulcrum-upstream/ 2>/dev/null | wc -l | tr -d ' '
CHECK (Pi CLI):       ls ~/.pi/agent/skills/fulcrum-upstream/ 2>/dev/null | wc -l | tr -d ' '

EXPECT: 27 per detected agent
RECORD: row 12; note agent + actual count for any mismatch
```

---

### Step 13 — Hooks: enabled set

```
CHECK:  fulcrum hooks list --json 2>/dev/null || fulcrum hooks list
EXPECT: 8 recipes listed: format, lint-gate, pm-policy, test-on-edit, audit-log, index-check, index-rebuild, tool-output-router
RECORD: row 13; note which are enabled vs available
```

---

### Step 14 — Hook smoke: format stub

```
CHECK:  printf '{"tool":"Write","path":"/tmp/smoke.ts","content":""}' | fulcrum hook format
EXPECT: exit 0 (may print nothing or status line — exit code is what matters)
RECORD: row 14; record exit code
```

---

### Step 15 — CI gate (repo root only)

Run only if cwd is Fulcrum repo root (`package.json` has `"name": "fulcrum"`):

```
CHECK:  bun run ci
EXPECT: 6 stages green: install, tsc, test, build:all, skills:lint, compress:check
RECORD: row 15; note any failing stage name; skip with "?" if not in repo root
```

---

### Step 16 — Optional: HTTP MCP reachability

```
CHECK:  fulcrum doctor --json | jq '[.mcp.servers[] | select(.transport == "http") | {name, reachable}]'
EXPECT: enabled HTTP MCPs have "reachable": true; disabled may show false (not failure)
RECORD: row 16; for each "reachable": false on enabled MCP, note "not reachable: <name>"
```

---

### Final step — Write results

Save completed result table to:

```
~/.fulcrum/state/global/smoke-test/<YYYY-MM-DD>.md
```

Create dir if absent. If file for today exists, append `---` separator + new table — never overwrite.

```bash
mkdir -p ~/.fulcrum/state/global/smoke-test
```

---

## Result template

Fill `<fill>` for Got, Status, Notes. Status: `✓` pass, `✗` fail, `?` skip/N-A.

```markdown
# Fulcrum Smoke Test — <YYYY-MM-DD> <HH:MM> UTC

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
| 8 | MCP auth_status | ok or n/a each | <fill> | <fill> | list missing-env vars |
| 9 | rules splice (per agent) | 1 per detected | <fill> | <fill> | <fill> |
| 10 | caveman installed (per agent) | true each detected | <fill> | <fill> | <fill> |
| 11 | authored skills count | 27 per detected | <fill> | <fill> | <fill> |
| 12 | upstream skills count | 27 per detected | <fill> | <fill> | <fill> |
| 13 | hooks list | 8 recipes shown | <fill> | <fill> | <fill> |
| 14 | hook format smoke | exit 0 | <fill> | <fill> | <fill> |
| 15 | bun run ci (repo only) | 6 stages green | <fill> | <fill> | skip if not in repo |
| 16 | HTTP MCP reachability (opt) | reachable: true (enabled) | <fill> | <fill> | <fill> |

Overall verdict: PASS / PARTIAL / FAIL
```

---

## Failure remediation

| Symptom | Where to look |
|---|---|
| `fulcrum` not found | Run `bash scripts/install.sh` from repo root, or set `FULCRUM_RELEASE_TAG=vX.Y.Z` and re-run. See README.md §Install. |
| verdict: "error" | `fulcrum doctor` human output lists each failing item. See HANDOVER.md §6.0a §F. |
| detected agent count 0 | Agent config dir absent (`~/.claude`, `~/.codex`, `~/.gemini`, `~/.config/opencode`, `~/.pi/agent`). Install agent first. See docs/agents.md. |
| tool count < 47 | Binary outdated. Rebuild with `bun run scripts/build-all.ts` or fetch newer release. |
| caveman defaultMode not "ultra" | `~/.config/caveman/config.json` missing or wrong. Re-run `fulcrum install`. See docs/caveman.md. |
| Pi adapter missing | `pi install npm:pi-mcp-adapter` not run, or Pi absent at install time. See docs/mcp.md §3.3. |
| mcp section absent | Doctor predates W2. Rebuild from current source. |
| builtin count < 16 | Registry stale or not written. Run `fulcrum install` to re-register. |
| missing-env:<VAR> | Env var not exported. See docs/mcp.md §5 for per-MCP token sources; HANDOVER.md §6.0a §C for secrets file layout. |
| rules splice missing | `fulcrum install` not run, or rules file replaced after install. Re-run `fulcrum install`. See docs/context.md. |
| caveman not installed for agent | Agent installed after `fulcrum install`. Re-run `fulcrum install`. See docs/caveman.md. |
| authored skill count < 27 | Run `fulcrum skills sync`. See docs/skills.md. |
| upstream skill count < 27 | `fulcrum skills upstream` failed (integrity mismatch or network). Re-run with debug. See HANDOVER.md §6.0b. |
| hooks list empty/partial | Enable with `fulcrum hooks enable <name>`. See docs/hooks.md. |
| hook format exits non-zero | Malformed stdin envelope or stale binary. See docs/hooks.md §format recipe. |
| bun run ci fails | Check failing stage output. Common: `bun test`, `bun run compress`, `fulcrum skills lint`. |
| HTTP MCP not reachable (enabled) | Network issue or service down. See docs/mcp.md §3. |

---

## Result-recording protocol

Results saved to:

```
~/.fulcrum/state/global/smoke-test/
```

Naming: `<YYYY-MM-DD>.md` (one file per day). Subsequent runs same day **append** with `---` separator — never overwrite. Directory is chronological log of every verification run.

```bash
# Create dir (idempotent)
mkdir -p ~/.fulcrum/state/global/smoke-test

# Append result
DATE=$(date +%Y-%m-%d)
printf '\n---\n%s\n' "$CONTENT" >> ~/.fulcrum/state/global/smoke-test/${DATE}.md
```

List past runs:
```bash
ls -lt ~/.fulcrum/state/global/smoke-test/
```

Read most recent:
```bash
cat ~/.fulcrum/state/global/smoke-test/$(ls -t ~/.fulcrum/state/global/smoke-test/ | head -1)
```
