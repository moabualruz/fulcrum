# COPY.md — Fulcrum UI Copy Voice

> Voice samples for every common state. Grounded in [PRODUCT.md](PRODUCT.md) tone rules + research-04 error/empty-state patterns. Operators read fast. No marketing copy in-product. No em dashes.

---

## 1. Voice rules

1. **Direct. Technical. No fluff.** Treat the operator as a peer engineer.
2. **Name the recovery action, not the problem.** `Settings could not load. Retry, or open trace 4f3a1c9e… in Audit.` Never `Something went wrong. Please try again later.`
3. **Echo trace ID in every error.** Always reachable via clipboard.
4. **No exclamation points.** No emoji confetti. No `✨ AI-powered`.
5. **No marketing copy.** No "Welcome to Fulcrum!". No "Get started!". No `🎉`.
6. **No em dashes.** Use periods, colons, commas, parentheses.
7. **Names describe responsibility / value / behavior.** Never phase numbers, never `new flow`, never `revamped` or `improved`.
8. **First-person plural is banned.** Never "We couldn't…". Use "Fulcrum couldn't…" or third-person.
9. **Buttons are imperative verbs.** "Create project", "Approve plan", not "Click here" or "Get started".
10. **Say "AI Assist", not "ACP" or "chat".** "ACP" is a transport protocol and must never leak into the chrome. The drawer is **AI Assist**; the right-most footer segment is **AI Assist**; the slash-command equivalent in CLI is `fulcrum ai`. Inside an agent picker, the per-agent client kind is shown as plain metadata (`claude-code`, `codex`, `gemini-cli`, `opencode`, `pi-cli`, `custom`) but never as the primary affordance label.
11. **Top-right system icons get human-language tooltips.** Not "Bell" but "Notifications · 3 unread". Not "Cog" but "Display, density, mode, theme". Not "?" alone but "Keyboard shortcuts · ?". Not "mk" but "Account · sign out, switch workspace".

### Top-right icon tooltips (canonical)

| Trigger      | Tooltip                                  | Opens                                          |
| ------------ | ---------------------------------------- | ---------------------------------------------- |
| `search`     | `Command palette · ⌘K`                   | ⌘K palette overlay                             |
| `bell`       | `Notifications · N unread`               | Notifications popover (tabbed: All / Mentions / Runs / Ship) |
| `settings`   | `Display, density, mode, theme`          | Display popover (Theme / Density / Mode / Motion / Sidebar) |
| `?`          | `Keyboard shortcuts · ?`                 | Keyboard cheatsheet overlay                    |
| avatar (`mk`)| `Account · sign out, switch workspace`   | Account popover (workspaces · API keys · CLI agents · MCP · Plugins · Docs · Sign out) |

---

## 2. Empty states (template + per-surface)

### Template

```
[icon, fg-muted, 24px]

One sentence naming the next workflow action.

[ Primary button: do the action ]   Press <key> to do it via keyboard.
```

### Canonical HTML shape

```
<H2>{What's missing}</H2>
<P>{Why it's empty}. {What to do next}.</P>
<button>{Primary action}</button>
<button>{Secondary action}</button>
```

### Worked examples per stage list (matches empty-states.html pattern)

- **capture-drafts**:
  - H2: `No drafts yet.`
  - P: `Drafts collect half-formed ideas. Press c to capture, or hand off from intake.`
  - Buttons: `New draft`, `Open inbox`
- **plan-prototypes**:
  - H2: `No prototypes yet.`
  - P: `Prototypes appear when a planning session ships a draft. Start one to seed this list.`
  - Buttons: `Start planning`, `Open templates`
- **build-list**:
  - H2: `No tasks yet.`
  - P: `Materialize an approved plan, or press c to create a task directly.`
  - Buttons: `Materialize plan`, `New task`
- **review-queue**:
  - H2: `No reviews waiting.`
  - P: `Items appear here when a task moves to in-review. Push something forward.`
  - Buttons: `Open board`, `View completed`
- **ship-archive**:
  - H2: `No releases shipped.`
  - P: `Approved reviews send artifacts here. Cut a release once review is green.`
  - Buttons: `Open Ship`, `View artifacts`
- **operate-alerts**:
  - H2: `No alerts firing.`
  - P: `Doctor is quiet. Re-probe to refresh, or open telemetry for trends.`
  - Buttons: `Re-probe`, `Open telemetry`

### Per-surface copy

**Capture (no docs yet):**
> Nothing captured in this project yet.
>
> [ New doc ]   Press `c` to capture.

**Plan (no sessions yet):**
> No planning sessions yet.
>
> [ Start planning ]   Press `n` or hand off from a doc in Capture.

**AI Assist (no saved sessions yet):**
> No saved sessions yet.
>
> Create a new session to Begin.
>
> [ Create Session ]

**Build / board (no tasks yet):**
> No tasks in this cycle.
>
> [ Add task ]   Press `c`, or materialize an approved plan from Plan.

**Build / task quick create:**
> Title is required. Scope, sprint, module, cycle, and recurrence stay intact.
>
> Duplicate task blocked. Open the existing task or change the title.
>
> Create failed. Draft preserved; retry when the connection recovers.

**Docs / version review:**
> Restore requires confirmation. A new version will record the restore event.
>
> Comment save failed. Draft preserved for retry.
>
> Permission denied. Ask an editor to grant comment access.

**Build / runs feed (no runs yet):**
> No runs yet in this project.
>
> [ Dispatch first run ]   Or press ▶ Play on any task.

**Review (no review items):**
> Nothing waiting for review.
>
> Items appear here when a task moves to in-review.

**Ship (no artifacts):**
> No artifacts yet.
>
> Artifacts are produced by runs in Build. Approved reviews send them here.

**Operate / doctor (all green):**
> All subsystems healthy.
>
> Last checked 12s ago. [ Re-probe ]

**Inbox (no notifications):**
> Inbox clear.
>
> Mentions, review requests, and run alerts will appear here.

**Search (no query):**
> Type to search across docs, tasks, runs, artifacts, memory, and audit.

**Search (no results):**
> No results for `<query>`.
>
> [ Search all projects ]   Or try a different term.

**Mobile heavy-editor fallback:**
> This view is read-only on mobile. Open on desktop to edit.
>
> [ Copy desktop link ]

---

## 3. Errors

### Template

```
[what failed]. [why, if non-obvious]. [exact next step]. trace=<id>
```

### Examples

**API 5xx:**
> Fulcrum couldn't reach the local API. The server may be restarting.
>
> [ Retry ]   Open trace `4f3a1c9e…` in Audit.

**API 403:**
> You don't have access to this project.
>
> Ask `admin@local` to add you. trace=4f3a1c9e…

**API 404:**
> This artifact no longer exists.
>
> It may have been archived. [ View archive ]   trace=4f3a1c9e…

**PGlite lock contention:**
> Fulcrum couldn't open the local database.
>
> A previous process is still holding the lock. Try `fulcrum doctor probe pglite`, or remove `~/.fulcrum/pglite/postmaster.pid` if no other Fulcrum process is running.
> trace=4f3a1c9e…

**Migration mismatch:**
> Database schema is out of date.
>
> Run `fulcrum db migrate`. trace=4f3a1c9e…

**Agent run failed:**
> Run `01HXYZ…` failed at step "build". Tool `bash` exited 1.
>
> [ View transcript ]   [ Retry from step ]   trace=4f3a1c9e…

**Permission denied during agent tool call:**
> Agent `claude` asked for permission to run `rm -rf node_modules`. You denied.
>
> [ Allow once ]   [ Allow always ]   [ Cancel run ]

**Offline + queued mutation:**
> You're offline. This change is queued and will sync when you reconnect.
>
> [ View queued changes ]

**Form validation:**
> Project name is required.
>
> *(field-level error, no toast)*

**Confirm destructive:**
> Delete project `fulcrum`?
>
> This removes the project, every task, run, artifact, and audit row in it. Type `fulcrum` to confirm.
>
> [ I understand. Delete project ]   [ Cancel ]

**Document trash impact:**
> Move `Release readiness` to trash?
>
> Review affected child pages, backlinks, attachments, ContextBundles, and artifacts before moving it. Restore returns the Document to its original parent when possible.
>
> [ Move to trash ]   [ Cancel ]

**Permanent document delete blocked:**
> Permanent delete blocked.
>
> Requires Knowledge admin permission and typed document title confirmation.

### Hard bans on error copy

- "Something went wrong" → banned.
- "Oops!" → banned.
- "Please try again" → banned (use imperative "Retry").
- "Contact support" without a recovery action → banned.
- Stack traces in user-facing copy → banned (link to audit instead).
- Toasts for errors → banned (errors live inline at the surface where they happen).

---

## 4. Confirmations

### Save / autosave

- Inline timestamp under title: `Saved 8s ago` (fg-muted, 11 px).
- Saving: `Saving…` with spinner inline. Never a toast.
- Failed save: inline danger banner above editor with `Retry` + `Discard changes`.

### Destructive without text confirm

- Single inline confirm step: button reveals confirmation in the same spot.
> Click "Archive" → button becomes "Confirm archive? (3)"  countdown 3-2-1 → "Archived".
- `Esc` cancels.
- No modal unless action is irreversible.

### Destructive with text confirm

- Modal (see error template above). Type the name. Type-exact match enabled, no `--force` analog visible.

### Skill conflict resolution

- Title: `Resolve skill conflict`.
- Lead sentence names both sides: `<installed skill> <version> conflicts with <requested skill> <version>`.
- Reason sentence is specific: incompatible tool/API requirements, missing capability, or version mismatch.
- Option copy stays consequence-first: `Use alt version`, `Skip`, `Upgrade installed first`, `Force`.
- `Force` is hidden or disabled unless safety is proven, and always paired with explicit warning acknowledgement.
- Persisted one-time choices say `Session choice saved`; do not imply future installs inherit it.

---

## 5. Mode affordance copy

### Three forms (per-step row)

- **Long** (per-card / per-row primary): `✋ Manual / ▶ Play / 💬 Discuss / ⊞ AI Assist` (full labels — keep verbatim).
- **Compact** (dense lists, board cards, timeline lanes): glyph-only with `title="<long-name>"`. Examples: `title="✋ Manual"`, `title="▶ Play (handoff to AI)"`, `title="💬 Discuss"`, `title="⊞ AI Assist"`.
- **Tight** (settings rows, doc surfaces): `▶ Suggest / 💬 Discuss` only. Drop Manual/Assist where they would be noise.

### ▶ Play picker popover

The picker is dynamic — it lists every CLI agent the user has configured, with the default-routed agent for this action kind marked. There is no separate "model" line because the agent registry already pairs each agent with its model.

```
Run with                                  · default for build.run.step

[CL] Claude Opus 4.7      claude-code · 142ms       ⌘1
[CL] Claude Sonnet 4.6    claude-code · 88ms        ⌘2        ← default for this action kind
[GP] GPT-5.4              codex · 210ms             ⌘3
[GE] Gemini 3 Pro         gemini-cli · 124ms        ⌘4
[OC] OpenCode · Llama-3   opencode · 305ms
[CX] Codex · GPT-4o       codex · 540ms · degraded
+ Pick another agent…                                          ← jumps to Settings > AI agents

Policy
( ) Ask on write   ( ) Auto   ( ) Read-only

[ ▶ Play ↵ ]   [ 💾 Preset ]   [ ⇄ Set default route ]
```

Copy rules:
- Never say "model"; the agent's name carries the model. Never say "ACP"; say "AI Assist" or the client kind (`claude-code` / `codex` / `gemini-cli` / `opencode` / `pi-cli`).
- The default-routed agent for this action kind is marked but not pre-selected; user always confirms with `↵`.
- `+ Pick another agent…` is link-styled (accent color) and routes to `settings.html#agents`.
- `⇄ Set default route` opens `settings.html#routes` for the current action kind.

### 💬 Discuss thread header

```
💬 Discuss this <step type>
agent: [CL Claude Opus 4.7 ▾]    trace tr_8f29a4c1…

This thread is anchored to <step title>.
```

### AI Assist drawer header (formerly "ACP drawer header")

```
✨ AI chat     [CL Claude Opus 4.7 ▾]     ⛶ ✕
@ scope: <step title>                trace tr_8f29a4c1…
```

The agent picker in the drawer header opens a full-panel agent registry inline (filter input, every configured agent with status + latency + MCP + plugin counts + ring badge, `+ Add CLI agent` shortcut, footer link to `settings.html#agents`). Switching agents mid-thread keeps history per agent — one tab per agent.

### Coachmark on first ▶ Play (one-time)

> ▶ Play hands this step to an agent. Pick which agent and which policy. You can switch back to manual at any time. Press `?` for the full keyboard map.
>
> [ Got it ]

### Coachmark on first trace ID surface (one-time)

> Trace 4f3a1c9e… runs through every surface. Click to copy. Paste in the CLI or TUI to jump back here.
>
> [ Got it ]

---

## 6. Status labels (canonical vocabulary)

Lock these strings. No synonyms.

| State | Label | Past tense |
|---|---|---|
| `pending` | Pending | Was pending |
| `running` | Running | Ran |
| `complete` | Complete | Completed |
| `passed` | Passed | Passed |
| `blocked` | Blocked | Was blocked |
| `awaiting` | Awaiting input | Was awaiting input |
| `failed` | Failed | Failed |
| `cancelled` | Cancelled | Was cancelled |
| `archived` | Archived | Was archived |
| `degraded` | Degraded | Was degraded |
| `unknown` | Unknown | Was unknown |

Never `In Flight`, `WIP`, `Doing`, `Stuck`, `Done!`. Never localize the verb inflection inconsistently.

> Lowercase, hyphenated. Any non-canonical synonym is a copy bug. Secondary descriptors live in `<span class="desc">` after the canonical pill. Canonical 8-state vocab: `queued / running / waiting-input / passing / failing / completed / cancelled / blocked`.

---

## 7. Onboarding (first-run) copy

Workspace input:
> What's your workspace called?
>
> Use anything. You can rename later. `local` works fine.
>
> [ Continue ]

Project input:
> What are you building?
>
> One sentence. Become the project description.
>
> [                                                                  ]
>
> [ Create project ]

First Capture surface:
> *(cursor on blank canvas)*
>
> Type or paste anything. Press `⌘/` to ask an agent.

No tour. No multi-step wizard. The interface is the tutorial.

---

## 8. Doctor copy

### Subsystem row

| Column | Example |
|---|---|
| Subsystem | `mcp.github` |
| Status | Degraded |
| Last checked | 12s ago |
| Detail | `auth_token expired 2h ago` |
| Recovery | [ Probe ] [ Copy: `fulcrum mcp test github` ] |

### Doctor banner — all healthy

> All subsystems healthy. Last full check 12s ago. [ Re-probe ]

### Doctor banner — degraded

> 1 subsystem degraded: `mcp.github` (auth_token expired).
>
> [ Probe `mcp.github` ]   [ View doctor ]

---

## 9. Audit row copy

```
2026-05-17 10:42:13   admin@local   task.update   TASK-471   ok   source=ui   trace=4f3a1c9e…
```

- Time absolute (hover relative).
- Actor: `user:<id>` or `agent:<id>`.
- Action namespaced verb: `task.create`, `run.cancel`, `permission.grant`.
- Target: typed ref `TASK-471`, `RUN-01HXYZ…`, `DOC-doc_42`.
- Outcome: `ok` or `error`.
- Source: `ui` / `cli` / `tui` / `api`.
- Trace: clickable.

---

## 10. Permission prompt copy (ACP)

Per ACP `session/request_permission` (research-02 §13).

```
Agent claude wants to run:
  $ rm -rf node_modules

Working dir: /Users/mkh/projects/fulcrum
Risk: destructive

[ Allow once ]   [ Allow always for `claude` in this project ]   [ Deny ]
```

- Three buttons, never two. "Allow once" is default focused.
- `Esc` = deny.
- Inline in transcript, not modal (unless action is irreversible).
- Persists `Allow always` decisions per-(agent, tool-pattern, project).

---

## 11. Notification copy

| Trigger | Notification text |
|---|---|
| Mention in doc | `@you mentioned in "Plan: auth refactor"` |
| Review requested | `Review requested by claude on TASK-471` |
| Agent run completed | `Run 01HXYZ… completed (12 of 47 tasks done)` |
| Agent run failed | `Run 01HXYZ… failed at step "build". [ View ]` |
| Permission requested | `claude requests permission to run shell command. [ Review ]` |
| New artifact shipped | `Artifact "release-v2.tgz" ready in Ship` |
| Cycle ending soon | `Cycle "May sprint" ends in 2 days. 4 tasks in progress.` |

No emoji. No `🎉`. No `❗`. Recovery action in `[ ]` brackets when one fits.

---

## 12. Settings labels

Each setting has: name, current value, inline status chip (✓ inherited / ✏️ overridden / 🔒 locked), help text 11 px fg-muted.

### Inheritance chip copy

- ✓ **Inherited from parent project `<name>`.** [ Override ]
- ✏️ **Overridden.** Parent value: `<value>`. [ Reset to parent ]
- 🔒 **Locked by parent project `<name>`.** [ View in parent ]

---

## 13. Telemetry first-run prompt (research-04 §14)

```
Fulcrum is local-first. All telemetry is opt-in.

Choose one:
( ) On                 Anonymous usage metrics + crash reports.
                       Helps tune defaults.
( ) Anonymous only     Crash reports without command-level events.
(x) Off                Default. No data leaves your machine.

Set later via `fulcrum config telemetry on|anon|off` or
`FULCRUM_TELEMETRY=off` env var. `DO_NOT_TRACK=1` is respected.

[ Continue ]
```

---

## 14. Sources

### 14.1 Sibling design docs

- [PRODUCT.md](PRODUCT.md) §Tone & Voice — voice rules, anti-references, hard bans.
- [DESIGN.md](DESIGN.md) §4.9 — 8-state status label vocabulary (this file locks the strings).
- [IA-MAP.md](IA-MAP.md) §11 — trace-spine link grammar (this file's error template echoes `trace=<id>`).
- [CLI-TUI-UX.md](CLI-TUI-UX.md) §5 — CLI error code namespace `FUL_<DOMAIN>_<SPECIFIC>` (this file's error samples cite those codes).
- [OD-PROMPT.md](OD-PROMPT.md).

### 14.2 Research dossiers (`.scratch/design-research/`)

- [01-workflow-nav-ia.md](.scratch/design-research/01-workflow-nav-ia.md) §9 — empty-state template (one sentence + one action, no illustration).
- [02-agent-supervision.md](.scratch/design-research/02-agent-supervision.md) §10–13 — permission prompt copy (inline transcript, never modal for non-destructive).
- [04-observability-trace.md](.scratch/design-research/04-observability-trace.md) §10/§14/§16 — error template, telemetry first-run prompt, doctor row shape.
- [07-copy-first-parity.md](.scratch/design-research/07-copy-first-parity.md) §4.1 — Plannotator `Mod+Enter` overload copy semantics.

### 14.3 PRD glossary + impeccable

- [.scratch/prd.jsonl](.scratch/prd.jsonl) — 94 `error copy` mentions, 113 `empty state` mentions, 119 `error recovery` mentions in critique_focus.
- [.claude/skills/impeccable/reference/ux-writing.md](.claude/skills/impeccable/reference/ux-writing.md).
- [.claude/skills/impeccable/reference/clarify.md](.claude/skills/impeccable/reference/clarify.md).
- [.claude/skills/impeccable/reference/product.md](.claude/skills/impeccable/reference/product.md) — product register copy rules.

### 14.4 Transformation note

The copy templates above are **additive**: every existing user-facing string in the codebase (`apps/web/src/lib/**`, `apps/cli/src/**`, `apps/tui/src/**`) is reviewed against these templates and replaced if it violates them. Strings that match are kept. No feature is removed; the words around the features are sharpened.

> 2026-05-18 OD pass: status vocab enforced across all 35 OD frames; empty-state template applied across 15 stage lists; mode affordance copy promoted to 3 forms.
