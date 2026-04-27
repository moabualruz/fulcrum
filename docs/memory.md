# Memory + Handover

> Cross-agent, cross-machine, human-curated knowledge layer. Built on a git-backed Obsidian vault. Task management lives in [tasks.md](tasks.md) (Plane).

## 1. Requirements

- Long-term: preferences, architectural decisions, patterns — across projects and agents
- Short-term: session state — "where we stopped", files changed, decisions made, next step
- Cross-agent portable: any agent can read the artifact
- No embedding models, no extra LLM calls, no new paid services

## 2. Settled decisions

| # | Decision | Answer |
|---|---|---|
| 1 | Vault path | `~/vault/` |
| 2 | Vault sync | Private GitHub repo (`gh repo create vault --private`), `git pull`/`push` |
| 3 | Active project | `basename "$PWD"` — cwd folder name |
| 4 | Write trust | Hybrid — `project-specific/` autonomous; `cross-project/` and `~/.claude/CLAUDE.md` route through `pending-global/` for human review |
| 5 | Stop hook trigger | Substantive sessions only — fires if any file Edit/Write **OR** any commit **OR** tool count >5. Trivial Q&A skips extraction. |
| 6 | `adr` trigger | Manual `/adr <one-line>` primary. Backup: Stop hook scans transcript for missed decisions, **proposes** with user confirmation before write. |
| 7 | `promote` trigger | SessionStart injects a one-line notice if `pending-global/` has items >24h old. User runs `/promote` when ready. |
| 8 | ADR numbering | Globally unique (`G-NNNN`). Registry at `vault/cross-project/adr-registry.md` maps numbers to project + topic. |
| 9 | `in-flight.md` write trigger | Manual `/in-flight <one-line>` primary. Backup: Stop hook heuristic — if uncommitted changes AND no ADR written AND no Plane issue closed this session, propose writing `in-flight.md` with user confirmation. |
| 10 | SessionStart git window | Stateless: `git log -20`. No marker file, no last-session tracking. Tune the number; never add state. |
| 11 | Auto-memory coexistence | **Keep both, vault is additive.** Claude Code's auto-memory at `~/.claude/projects/<slug>/memory/` continues unchanged (per-conversation, Claude-only). Vault is cross-agent + cross-machine + human-curated. Different scopes, no migration. |
| 12 | Skill name conflicts | **No prefix.** Use clean names (`adr`, not `fulcrum-adr`). Rename only if a future collision appears. |
| 13 | Cross-agent vault writes | **Single shared vault.** All agents write to `~/vault/`. Git handles concurrency via `pull --rebase` then push. Agent identity in commit messages: `session: <date> [<project>] (<agent>)`. |

## 3. Three-tier storage

Information is split by **lifecycle**, not topic. Ask: does this thing have a completion state, or is it permanently true until revised?

| Tier | Stores | Why | Access |
|---|---|---|---|
| **Plane** ([tasks.md](tasks.md)) | Issues, cycles, milestones (tasks). Pages for project-scoped working docs: feature specs, TDDs, sprint briefs, PRDs, post-mortems. | Has completion state, scoped to one project, dies with the project. | REST API |
| **Obsidian vault** (this doc) | Cross-project knowledge: conventions, patterns, anti-patterns, research findings. Project-specific: optional `in-flight.md` for mid-thought state only. | Permanently true until revised. Survives all projects. | Filesystem (markdown), `rg` for search |
| **Project repo** (git) | `AGENTS.md`, `CLAUDE.md`, `docs/decisions/` (Vibe ADRs), API contracts, schemas. | Must be versioned with the code. | Filesystem |

**Why Obsidian over Outline:** Obsidian vault is plain markdown in a directory. Agents already read/write files natively — no API, no auth, no server. Cross-machine via `git push/pull`. Cross-agent portable because every agent reads markdown. Outline's advantages (browser UI, ranked search API) don't outweigh the infrastructure overhead for a solo developer.

**Why not just Plane Pages for memory:** Pages are per-project, not workspace-global. No backlinks, no nested collections, search mixes issues and pages. Fine for project-scoped working docs; wrong tool for cross-project memory.

## 4. Search

`rg` on the vault directory. The same code-search toolchain from [capabilities.md](capabilities.md) applies — no new tool needed.

```bash
rg "redis caching" ~/vault/                  # full-text
fd "auth" ~/vault/ --extension md            # filename
rg "anti-pattern" ~/vault/cross-project/ -l  # files only
```

Semantic/concept search would require embeddings — violates the no-extra-LLM-calls constraint. Disciplined naming and consistent vocabulary compensate.

## 5. Capture rules — five resolved gray areas

These are the cases where capture discipline usually decays. Each has an explicit rule.

### 5.1 Quick decisions made in conversation — Vibe ADR

Every meaningful decision becomes one short markdown file in `docs/decisions/`, committed alongside the code that implements it. Format: context (1 sentence), decision (1 sentence), consequences (2–3 bullets). Reference the commit hash in the ADR.

**Triggers (per §2 #6):**
- Primary: user runs `/adr <one-line summary>`. Agent generates a draft, user confirms, file written and committed.
- Backup: at Stop, agent scans the transcript for missed decisions and *proposes* them. User confirms each before write. Never autonomous.

**Numbering (per §2 #8):** globally unique `G-NNNN` (e.g. `G-0042-use-postgres.md`). The registry at `vault/cross-project/adr-registry.md` maps each number to its project and one-line topic. Skills creating an ADR read the registry, claim the next number, append the entry, then write the file.

**Registry format:**

```markdown
# ADR Registry

> Globally unique ADR numbers across all projects. Append-only.
> Skills creating an ADR claim the next G-NNNN, append a row, then write the file.

| Number | Date | Project | Topic | Status | File |
|---|---|---|---|---|---|
| G-0001 | 2026-04-27 | fulcrum | use postgres for primary store | Accepted | fulcrum/docs/decisions/G-0001-use-postgres.md |
| G-0002 | 2026-04-29 | fulcrum | jwt rs256 for auth tokens | Accepted | fulcrum/docs/decisions/G-0002-jwt-rs256.md |
| G-0003 | 2026-05-03 | other-app | redis for session cache | Proposed | other-app/docs/decisions/G-0003-redis-session-cache.md |
```

**Status values:** `Proposed` · `Accepted` · `Superseded` · `Deprecated`. Updated in place when status changes.

**Concurrent-claim race:** the agent reads the registry, picks `max(N)+1`, appends the row, writes the ADR file, commits and pushes. If `git push` is rejected (another machine claimed the same number first), the agent rebases, recomputes the next number, and retries. Solo-dev cross-machine usage means this race is rare; no lock file needed.

**Discovery:** `rg "fulcrum" ~/vault/cross-project/adr-registry.md` lists all ADRs for a project. `rg "G-0042" ~/vault/cross-project/adr-registry.md` resolves a reference to its file path.

```markdown
# docs/decisions/G-0001-use-postgres.md

## Context
Need persistent storage; SQLite hits limits under concurrent writes.

## Decision
Use PostgreSQL 16.

## Consequences
- Requires Docker for local dev
- Enables row-level security later
- Migration tooling: Alembic
```

The ADR is the next session's context seed. Any agent reads it.

### 5.2 Mid-session research findings — session-end extraction

At session end (`Stop` hook or `/wrap`), the agent runs the **future-behavior test** on each candidate finding:

> *"Would knowing this change how I act next session on a different task?"*

- **Yes** → write to vault (`cross-project/` if universal, `project-specific/` if scoped).
- **No** → discard.

Always written: anything the user corrected, anti-patterns discovered, surprising tool results. Never written: intermediate reasoning, raw API response bodies, transcript excerpts.

### 5.3 Technical debt — debt ADR + TODO annotation

Two artifacts per debt item:

1. **In code:** structured TODO with rationale and ADR link.
   ```python
   # TODO(G-0015): string concat here because the ORM has a bug with
   # nested JSON on Postgres 14. Remove when upgraded to PG16.
   ```
2. **`docs/decisions/G-0015-pg14-json-workaround.md`** — full ADR with status `Proposed` while unresolved, `Superseded` once fixed.

Plane issue tracks the *task*. ADR carries the *knowledge*. When the task closes, the ADR remains in git history with full rationale.

### 5.4 Post-mortems — two-document pattern

Every post-mortem produces two artifacts:

| Document | Location | Lifetime |
|---|---|---|
| Full incident post-mortem (timeline, what broke, action items) | Plane Pages (see [tasks.md](tasks.md)) | Project-scoped, dies with project |
| 3-line "lesson extracted" note | `vault/cross-project/patterns/` | Permanent, cross-project |

The lesson note is written **immediately** when the post-mortem is filed — not in a later batch review. Forgetting decays sharply after 24 hours.

### 5.5 Information migration — confidence threshold with staging gate

At the moment of discovery, the agent classifies:

- **Clearly cross-project** (e.g. "xh beats curl for JSON APIs") → write to `vault/pending-global/`.
- **Clearly project-specific** (e.g. "this webhook endpoint needs a 100ms timeout") → write to `vault/project-specific/<project>/`.
- **Uncertain** → stays project-specific until evidence of recurrence.

`pending-global/` is a **staging area**. Human review promotes entries to `vault/cross-project/` or `~/.claude/CLAUDE.md`. No agent-autonomous writes to global memory — Gemini CLI issue #6371 documented the failure mode (global memory pollution within weeks when this gate is missing).

## 6. Vault layout

```
~/vault/
  cross-project/              # loads in any session
    patterns/                 # extracted lessons (post-mortems, recurring)
    tools/                    # universal tool preferences
    anti-patterns/            # things the user corrected
    adr-registry.md           # globally unique ADR numbers
  project-specific/
    <project-slug>/
      in-flight.md            # OPTIONAL — only when stopped mid-thought
      research/               # findings scoped to this project
  pending-global/             # staging — awaits human promotion
```

Cross-machine sync: private GitHub repo.

```bash
mkdir -p ~/vault && cd ~/vault
git init
gh repo create vault --private --source . --push
# on a second machine:
git clone git@github.com:<user>/vault ~/vault
```

Hooks `git pull` at SessionStart and `git push` at Stop when the vault changed.

**`~/vault/.gitignore`:**
```
.DS_Store
.obsidian/workspace*
.obsidian/cache
*.tmp
```

`pending-global/` and `project-specific/<project>/in-flight.md` are **committed** — they're cross-machine continuity, not local cache. Privacy of half-baked thoughts is acceptable since the repo is private.

**No mandatory handover file.** Session-resume context is *derived* at `SessionStart` from authoritative sources (see §7). A handover file would duplicate state that already lives in git, Plane, and ADRs, and would decay the moment it diverges. The only exception is `in-flight.md` — an optional, write-only-when-needed file for genuine mid-thought state that doesn't fit anywhere else (e.g. "halfway through refactor X, blocked on Y, considering Z"). Empty/missing by default. Deleted by the next session when the in-flight situation resolves.

## 7. Hooks

| Hook | Action |
|---|---|
| `SessionStart` | `git pull` vault. Synthesise "what's in flight" from authoritative sources: `git status`, `git log -20` (stateless — last 20 commits, no boundary tracking), open Plane issues assigned to me ([tasks.md](tasks.md)), recent ADRs (`docs/decisions/` mtime < 7d), `in-flight.md` if present. Inject `vault/cross-project/` index. If `vault/pending-global/` has any item with mtime >24h, inject a one-line notice: `📬 N pending-global items — /promote to review`. |
| `Stop` | **Activation gate (§2 #5):** fire only if any file Edit/Write occurred OR any commit was made OR tool count >5; else exit silently. When activated: run the future-behavior test on session activity. Route writes per §5 trust model (project-specific autonomous, cross-project staged). Scan transcript for missed decisions; *propose* (never autonomously write) Vibe ADRs. Heuristic check for mid-thought state; if present, propose writing `in-flight.md` with user confirmation. `git push` vault if changed. |

Derived synthesis at `SessionStart` means there is no separate handover artifact to keep current. The system reads what's already true.

**Design split: hooks are mechanical, skills are reasoning.**

The Stop hook *cannot* run the future-behavior test or scan the transcript — by the time it fires, the agent has already finished. That work belongs to a slash command (`/wrap`) the user invokes before stopping, or to an auto-proposal at the next SessionStart if the previous session was substantive but no `/wrap` ran. Hooks handle deterministic shell work only:
- `SessionStart`: `git pull` vault, gather files and run `git`/`gh` queries, emit context JSON.
- `Stop`: detect substantive activity, push vault, write activity marker so next SessionStart can propose `/wrap` if needed.

### 7.1 Hook script: `~/.fulcrum/hooks/session-start.sh`

```bash
#!/usr/bin/env bash
set -euo pipefail

VAULT="${VAULT:-$HOME/vault}"
PROJECT=$(basename "$PWD")
CTX=""

# Pull vault (best-effort)
[ -d "$VAULT/.git" ] && git -C "$VAULT" pull --quiet --rebase 2>/dev/null || true

# Working tree
if git rev-parse --git-dir >/dev/null 2>&1; then
  S=$(git status --short 2>/dev/null || true)
  [ -n "$S" ] && CTX+="## Working tree (uncommitted)\n\`\`\`\n${S}\n\`\`\`\n\n"
  R=$(git log -20 --oneline 2>/dev/null || true)
  [ -n "$R" ] && CTX+="## Recent commits (last 20)\n\`\`\`\n${R}\n\`\`\`\n\n"
fi

# Recent ADRs (in-repo, <7d)
if [ -d "docs/decisions" ]; then
  A=$(find docs/decisions -name "*.md" -type f -mtime -7 2>/dev/null | sort)
  [ -n "$A" ] && CTX+="## Recent ADRs (last 7 days)\n${A//$'\n'/$'\n'- }\n\n"
fi

# In-flight state
INFLIGHT="$VAULT/project-specific/$PROJECT/in-flight.md"
[ -f "$INFLIGHT" ] && CTX+="## In-flight state\n$(cat "$INFLIGHT")\n\n"

# Cross-project vault index
if [ -d "$VAULT/cross-project" ]; then
  IDX=$(find "$VAULT/cross-project" -name "*.md" -type f 2>/dev/null | sort | sed "s|$VAULT/||")
  [ -n "$IDX" ] && CTX+="## Vault cross-project index\n${IDX//$'\n'/$'\n'- }\n\n"
fi

# Pending-global stale notice (>24h)
if [ -d "$VAULT/pending-global" ]; then
  STALE=$(find "$VAULT/pending-global" -name "*.md" -type f -mtime +1 2>/dev/null | wc -l | tr -d ' ')
  [ "$STALE" -gt 0 ] && CTX+="📬 ${STALE} pending-global items >24h old — \`/promote\` to review.\n\n"
fi

# Substantive-without-wrap notice
MARKER="$HOME/.fulcrum/state/$PROJECT.last-stop"
WRAP="$HOME/.fulcrum/state/$PROJECT.last-wrap"
if [ -f "$MARKER" ] && { [ ! -f "$WRAP" ] || [ "$MARKER" -nt "$WRAP" ]; }; then
  CTX+="🪄 Previous session was substantive but \`/wrap\` was not run — consider \`/wrap\` to extract.\n\n"
fi

# Emit
[ -n "$CTX" ] && jq -n --arg c "$CTX" \
  '{hookSpecificOutput:{hookEventName:"SessionStart",additionalContext:$c}}'

exit 0
```

### 7.2 Hook script: `~/.fulcrum/hooks/session-stop.sh`

```bash
#!/usr/bin/env bash
set -euo pipefail

VAULT="${VAULT:-$HOME/vault}"
PROJECT=$(basename "$PWD")
STATE="$HOME/.fulcrum/state"
mkdir -p "$STATE"

# Activation gate (§2 #5)
DIRTY=$(git status --porcelain 2>/dev/null || true)
RECENT=$(git log --since='1 hour ago' --oneline 2>/dev/null | wc -l | tr -d ' ')
if [ -z "$DIRTY" ] && [ "$RECENT" -eq 0 ]; then
  exit 0
fi

# Mark substantive activity (SessionStart reads this to propose /wrap)
touch "$STATE/$PROJECT.last-stop"

# Push vault if it has changes
if [ -d "$VAULT/.git" ]; then
  if [ -n "$(git -C "$VAULT" status --porcelain)" ]; then
    git -C "$VAULT" add -A
    AGENT="${FULCRUM_AGENT:-claude}"  # set per-agent (claude|codex|gemini|opencode|pi) in env
    git -C "$VAULT" pull --rebase --quiet 2>/dev/null || true
    git -C "$VAULT" commit -m "session: $(date -u +%Y-%m-%dT%H:%MZ) [$PROJECT] ($AGENT)" --quiet || true
  fi
  git -C "$VAULT" push --quiet 2>/dev/null || true
fi

exit 0
```

### 7.3 Settings registration — `~/.claude/settings.json`

Combined with index hooks from [hooks.md](hooks.md):

```json
{
  "hooks": {
    "SessionStart": [
      {"hooks": [{"type": "command", "command": "~/.fulcrum/hooks/index-check.sh"}]},
      {"hooks": [{"type": "command", "command": "~/.fulcrum/hooks/session-start.sh"}]}
    ],
    "Stop": [
      {"hooks": [{"type": "command", "command": "~/.fulcrum/hooks/index-rebuild.sh"}]},
      {"hooks": [{"type": "command", "command": "~/.fulcrum/hooks/session-stop.sh"}]}
    ]
  }
}
```

The `/wrap` skill clears the marker by `touch`-ing `$STATE/$PROJECT.last-wrap` after extraction completes.

## 8. Custom skill specifications

Each skill ships as `~/.claude/skills/<name>/SKILL.md` and is mirrored into the per-agent skills directories from [skills.md](skills.md). The specs below define the contract — inputs, side effects, files touched. SKILL.md stubs follow in §9.

### `adr` — `/adr <one-line>`

- **Inputs:** one-line decision summary from user; current conversation transcript for context.
- **Reads:** `vault/cross-project/adr-registry.md` (claims next `G-NNNN`).
- **Writes:** `docs/decisions/G-NNNN-<slug>.md` in the project repo; appends row to registry.
- **Confirms:** shows draft to user before writing. Never autonomous.
- **Side effects:** `git add` + `git commit` the ADR + registry update; pushes vault.

### `wrap` — `/wrap`

- **Inputs:** current conversation transcript.
- **Process:** applies the future-behavior test (§5.2) to candidate findings. Categorises each as `cross-project`, `project-specific`, or discard.
- **Writes (autonomous):** `vault/project-specific/<project>/research/<topic>.md`.
- **Writes (staged):** `vault/pending-global/<topic>.md` for cross-project candidates.
- **Sub-routines:** scans transcript for missed decisions → invokes `adr` per item with confirmation. Checks for mid-thought state heuristic → invokes `/in-flight` if user confirms.
- **Side effects:** `touch ~/.fulcrum/state/<project>.last-wrap` so SessionStart suppresses the "previous session was substantive" notice.

### `promote` — `/promote`

- **Inputs:** none (walks `vault/pending-global/` directory).
- **Process:** for each staged item, presents content + suggested destination (`vault/cross-project/...` or `~/.claude/CLAUDE.md`). User confirms, edits, or skips per item.
- **Writes:** moves confirmed files to chosen destination; deletes (via `git rm`) the staging copy.
- **Side effects:** vault commit + push.

### `postmortem` — `/postmortem <incident-slug>`

- **Inputs:** incident slug, conversation/transcript context.
- **Writes (project-scoped):** full post-mortem to Plane Pages under the active project (or `docs/postmortems/` if Plane not running) — see [tasks.md](tasks.md).
- **Writes (cross-project):** 3-line lesson note to `vault/cross-project/patterns/<lesson-slug>.md` referencing the project post-mortem path.
- **Confirms:** both documents shown to user before write.

### `/in-flight <one-line>` — slash command (no skill reasoning needed)

- **Inputs:** one-line summary of mid-thought state.
- **Writes:** `vault/project-specific/<project>/in-flight.md` with the line, timestamp, and current `git status`.
- **Auto-deletion:** the next session's `/wrap` (or any commit that closes the in-flight scenario) removes the file.

> The `plan-to-plane` skill (`/plan-to-plane`) is in [tasks.md](tasks.md).

## 9. SKILL.md stubs

Each stub shows the YAML frontmatter and the *when-to-use* paragraph. Full prose (steps, examples, error handling) is implementation work, written into `~/.claude/skills/<name>/SKILL.md` at install time.

### `~/.claude/skills/adr/SKILL.md`

```markdown
---
name: adr
description: Capture an architectural decision as a Vibe ADR — short markdown file in docs/decisions/, globally numbered (G-NNNN), registered in vault/cross-project/adr-registry.md. Triggered by /adr <one-line>, or proposed at /wrap when the agent detects a missed decision in the transcript.
---

Use this skill when the user invokes `/adr <one-line summary>` OR when reviewing a session transcript and a clear architectural decision was made but no ADR exists. NEVER write autonomously — always confirm with the user before committing.

Workflow: read `~/vault/cross-project/adr-registry.md` → claim `G-(max+1)` → draft ADR with context (1 sentence), decision (1 sentence), consequences (2–3 bullets) → show draft → on confirmation, write `docs/decisions/G-NNNN-<slug>.md` + append registry row + commit both. Push vault.
```

### `~/.claude/skills/wrap/SKILL.md`

```markdown
---
name: wrap
description: At session end, apply the future-behavior test to candidate findings and route to the vault per the trust model. Triggered by /wrap. Also proposes any missed Vibe ADRs and an in-flight.md if mid-thought state is detected.
---

Invoke this when the user runs `/wrap` or when SessionStart shows the "previous session was substantive but /wrap was not run" notice and the user agrees to extract now.

For each candidate finding from the session, ask: "would knowing this change how I act next session on a different task?" Yes → write. No → discard. Cross-project candidates go to `~/vault/pending-global/`. Project-specific findings go to `~/vault/project-specific/<basename(PWD)>/research/`. Always written: user corrections, anti-patterns, surprising tool results. Never written: intermediate reasoning, raw API bodies.

After extraction, scan transcript for missed decisions → invoke adr per item with confirmation. Check mid-thought heuristic (uncommitted changes AND no ADR written this session AND no Plane issue closed) → if true, propose `/in-flight` with confirmation. Finally `touch ~/.fulcrum/state/<project>.last-wrap`.
```

### `~/.claude/skills/promote/SKILL.md`

```markdown
---
name: promote
description: Walk vault/pending-global/, present each staged item with a suggested destination, accept user confirm/edit/skip per item, then move confirmed files to vault/cross-project/ or ~/.claude/CLAUDE.md. Triggered by /promote.
---

Use this when the user runs `/promote`, or when SessionStart's pending-global notice prompts review.

For each `.md` file in `~/vault/pending-global/`: read it, show content, propose a destination (`vault/cross-project/<subdir>/<file>` or an append to `~/.claude/CLAUDE.md`), accept y/n/edit/skip. On confirmation: `git mv` to chosen destination (or append to CLAUDE.md and `git rm` the staged file). Commit and push vault. Never autonomous — every file requires explicit user action.
```

### `~/.claude/skills/postmortem/SKILL.md`

```markdown
---
name: postmortem
description: Two-document post-mortem — full incident write-up to Plane Pages (or docs/postmortems/ if Plane is not running), and a 3-line lesson note to vault/cross-project/patterns/. Triggered by /postmortem <incident-slug>.
---

Use this immediately after an incident or production issue. Both documents are written together — the lesson note must not be deferred to a later batch review.

Document 1 (project-scoped): full timeline, what broke, action items. POST to Plane Pages under the active project if `$PLANE_ENDPOINT` is reachable; else write to `docs/postmortems/<slug>.md` in the repo.

Document 2 (cross-project): exactly 3 lines — the lesson, the domain (e.g. "webhooks", "auth"), and a back-reference to document 1. Write to `~/vault/cross-project/patterns/<lesson-slug>.md`. Show both drafts to user, confirm, write, commit, push.
```

### `~/.claude/skills/in-flight/SKILL.md` (or slash command)

```markdown
---
name: in-flight
description: Write vault/project-specific/<project>/in-flight.md with a one-line summary of mid-thought state, timestamp, and current git status. Triggered by /in-flight <one-line>.
---

No reasoning required — this is mechanical. Take the one-line argument, the current ISO-8601 timestamp, and `git status --short`, write them to `~/vault/project-specific/$(basename $PWD)/in-flight.md`. The next session's /wrap (or any commit that closes the in-flight scenario) is responsible for deletion.
```

## 10. Cross-agent install — superpowers + custom skills

Install superpowers as the cross-agent base (see [skills.md](skills.md) §4), then mirror our custom skills into each agent's own directory.

### superpowers per agent

| Agent | Install command | Directory created |
|---|---|---|
| Claude Code | `claude plugin install obra/superpowers` | `~/.claude/plugins/superpowers/` |
| Codex CLI | clone `obra/superpowers` and copy `.codex-plugin/` contents into `~/.codex/skills/` | `~/.codex/skills/superpowers-*/` |
| Gemini CLI | clone repo, run from `gemini-extension.json` setup | `~/.gemini/extensions/superpowers/` |
| OpenCode | copy `.opencode/` contents into `~/.config/opencode/skills/` | `~/.config/opencode/skills/superpowers-*/` |
| Pi CLI | superpowers has no Pi installer — copy relevant SKILL.md files from `superpowers/skills/` to `~/.pi/agent/skills/` manually; also write a Pi extension (`~/.pi/agent/extensions/memory.ts`, §11) for hook events |

### Mirror our 5 custom skills + /in-flight

After superpowers is installed, copy each `~/.claude/skills/<name>/SKILL.md` into the agent-specific path:

| Agent | Target |
|---|---|
| Claude Code | `~/.claude/skills/<name>/` (canonical source) |
| Codex CLI | `~/.codex/skills/<name>/` |
| Gemini CLI | `~/.gemini/extensions/fulcrum-skills/skills/<name>/` (one wrapper extension holds all our skills) |
| OpenCode | `~/.config/opencode/skills/<name>/` |
| Pi CLI | `~/.pi/agent/skills/<name>/` |

A single `~/.fulcrum/scripts/sync-skills.sh` can do this — read canonical Claude Code skills, write into each agent path. Idempotent.

## 11. Pi memory extension — `~/.pi/agent/extensions/memory.ts`

Pi has no shell hooks; it has TypeScript event handlers. This extension is the bridge — it shells out to the same `~/.fulcrum/hooks/*.sh` scripts as Claude Code so behavior stays consistent.

```typescript
// ~/.pi/agent/extensions/memory.ts
// Bridges Pi events to Fulcrum shell hooks. See memory.md §7 + agents.md §4.

import { execSync } from "node:child_process";
import { homedir } from "node:os";

const HOOK_DIR = `${homedir()}/.fulcrum/hooks`;

declare const pi: {
  on: (event: string, handler: (payload: any) => any) => void;
};

// SessionStart equivalent: inject context from session-start.sh
pi.on("before_agent_start", async (payload) => {
  try {
    const out = execSync(`${HOOK_DIR}/session-start.sh`, {
      encoding: "utf8",
      cwd: process.cwd(),
    });
    if (!out.trim()) return;
    const parsed = JSON.parse(out);
    const ctx = parsed?.hookSpecificOutput?.additionalContext;
    if (ctx) {
      payload.systemPromptAppend = (payload.systemPromptAppend ?? "") + "\n\n" + ctx;
    }
  } catch (err) {
    console.error("[fulcrum] session-start hook failed:", err);
  }
});

// Stop equivalent: push vault, mark substantive activity
pi.on("session_shutdown", () => {
  try {
    execSync(`${HOOK_DIR}/session-stop.sh`, { encoding: "utf8", cwd: process.cwd() });
  } catch (err) {
    console.error("[fulcrum] session-stop hook failed:", err);
  }
});
```

Register via `~/.pi/agent/settings.json`:

```json
{
  "extensions": ["~/.pi/agent/extensions/memory.ts"]
}
```

Hot-reload after edit: `/reload` in the Pi REPL.

## 12. Bootstrap

```bash
# 1. Vault
mkdir -p ~/vault/{cross-project/{patterns,tools,anti-patterns},project-specific,pending-global}
cd ~/vault
git init
gh repo create vault --private --source . --push
echo "# ADR Registry" > cross-project/adr-registry.md
# write .gitignore from §6

# 2. Hook scripts
mkdir -p ~/.fulcrum/{hooks,state}
# write session-start.sh and session-stop.sh from §7
chmod +x ~/.fulcrum/hooks/session-start.sh ~/.fulcrum/hooks/session-stop.sh

# 3. Register hooks in ~/.claude/settings.json (per §7.3 settings block)

# 4. Skills (per Claude Code; mirror to other agents per §10)
mkdir -p ~/.claude/skills/{adr,wrap,promote,postmortem,plan-to-plane,in-flight}
# write SKILL.md per stubs in §9

# 5. /in-flight slash command — register as user command

# 6. (optional) Plane — see tasks.md
```

## 13. Open items

**Resolved:** vault path, vault sync, `.gitignore`, active-project resolution, write-trust model, Stop trigger criteria, `adr` trigger, `promote` trigger, ADR numbering, `in-flight.md` write trigger, SessionStart git window (stateless `git log -20`), auto-memory coexistence, skill name policy, cross-agent vault writes, SKILL.md stubs, cross-agent install, Pi memory extension.

**Still open — execution:**

- [ ] Run §12 bootstrap to create the actual files
- [ ] Verify superpowers install on each of the four agents
- [ ] Write `~/.fulcrum/scripts/sync-skills.sh` (idempotent skill mirror across agent paths)
