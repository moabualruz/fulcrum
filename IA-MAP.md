# IA-MAP.md — Fulcrum Information Architecture

> Concrete route tree, screen-by-screen scope, keyboard map, ACP drawer behavior. Grounded in `.scratch/design-research/01..07`, `.scratch/prd.jsonl`, [PRODUCT.md](PRODUCT.md), [DESIGN.md](DESIGN.md).

---

## 0. Top-level scope shape

```
Workspace
└── Project (top-level or subproject via parent_id)
    └── Cycle (release window, time-boxed) | Module (epic, time-orthogonal)
        └── Work item (task / sub-task)
            └── Artifact, Run, Doc, Memory entry, Audit row
```

- 3 levels max (research-01 §4): Workspace → Project → Work item.
- Subprojects via `parent_id` with per-module inheritance (research-01 §8: ✓ inherited / ✏️ overridden / 🔒 locked chips on every setting).
- Cycles + Modules orthogonal grouping (research-07 §1.4 verbatim Plane).

---

## 1. URL shape

Pattern: `/<workspaceSlug>/<stage>[/<sub>]?...`

```
/                                                         portfolio landing (Dashboard)
/<ws>                                                     workspace home
/<ws>/projects                                            project list
/<ws>/projects/new                                        project create
/<ws>/projects/<projId>                                   project home (Capture default)

# Workflow stages
/<ws>/projects/<projId>/capture                           Capture (docs/notes/intake)
/<ws>/projects/<projId>/capture/<docId>                   single doc
/<ws>/projects/<projId>/capture/inbox                     intake queue

/<ws>/projects/<projId>/plan                              Plan (sessions list)
/<ws>/projects/<projId>/plan/<sessionId>                  live ACP planning session
/<ws>/projects/<projId>/plan/<planId>/review              plan + prototype + tasks tripane
/<ws>/projects/<projId>/plan/missions                     mission tree (Fusion-style)

/<ws>/projects/<projId>/build                             Build (default: board)
/<ws>/projects/<projId>/build/board                       board layout
/<ws>/projects/<projId>/build/list                        list layout
/<ws>/projects/<projId>/build/table                       table/spreadsheet layout
/<ws>/projects/<projId>/build/calendar                    calendar layout
/<ws>/projects/<projId>/build/gantt                       gantt layout
/<ws>/projects/<projId>/build/graph                       dependency graph (Sugiyama)
/<ws>/projects/<projId>/build/runs                        runs feed
/<ws>/projects/<projId>/build/runs/<runId>                live session pane
/<ws>/projects/<projId>/build/cycles                      cycles list
/<ws>/projects/<projId>/build/cycles/<cycleId>            cycle detail
/<ws>/projects/<projId>/build/modules                     modules list
/<ws>/projects/<projId>/build/modules/<moduleId>          module detail

/<ws>/projects/<projId>/review                            Review (review queue)
/<ws>/projects/<projId>/review/<reviewId>                 review workbench
/<ws>/projects/<projId>/review/qa                         QA reports
/<ws>/projects/<projId>/review/uat                        UAT handoff
/<ws>/projects/<projId>/review/e2e                        generated E2E runner

/<ws>/projects/<projId>/ship                              Ship (artifacts list)
/<ws>/projects/<projId>/ship/<artifactId>                 artifact detail
/<ws>/projects/<projId>/ship/reports                      reports
/<ws>/projects/<projId>/ship/memory                       memory promotion review

/<ws>/projects/<projId>/operate                           Operate (doctor default)
/<ws>/projects/<projId>/operate/doctor                    subsystems table
/<ws>/projects/<projId>/operate/runs                      runs history (cross-cycle)
/<ws>/projects/<projId>/operate/inbox                     notifications
/<ws>/projects/<projId>/operate/audit                     audit log
/<ws>/projects/<projId>/operate/error-logs                error logs (Sentry pattern)
/<ws>/projects/<projId>/operate/telemetry                 telemetry settings
/<ws>/projects/<projId>/operate/settings                  project settings (tabs)
/<ws>/projects/<projId>/operate/settings/states           states editor
/<ws>/projects/<projId>/operate/settings/labels           labels
/<ws>/projects/<projId>/operate/settings/estimates        estimates
/<ws>/projects/<projId>/operate/settings/members          members + roles
/<ws>/projects/<projId>/operate/settings/automations      automation rules
/<ws>/projects/<projId>/operate/settings/connectors       connectors
/<ws>/projects/<projId>/operate/settings/routing          routing rules
/<ws>/projects/<projId>/operate/settings/features         per-project feature toggles

# Portfolio (workspace scope, no project)
/<ws>/dashboard                                           workspace home
/<ws>/inbox                                               cross-project inbox
/<ws>/search                                              federated search
/<ws>/memory                                              global memory
/<ws>/global-docs                                         workspace-level docs
/<ws>/projects                                            project list (Linear-style)

# Docs hub (app surface; lists project + global documents)
/docs                                                     docs hub: project tree, global tree, kind + text filters, link to /docs/new
/docs/new                                                 new document form
/docs/global                                              global docs tree
/docs/<docId>                                             document viewer
/docs/<docId>/edit                                        document editor
/docs/<docId>/history                                     document version history
/docs/<docId>/planning                                    planning view tied to document
/ai-assist                                                OD reference route for AI Assist drawer with document planning context
/plan-session                                             internal design-e2e preview for persistent AI Assist planning sessions, traffic stream inspection, source/session/trace links, reload resume, and missing-ID recovery
/settings/ai-assist                                      AI Assist checkpoint mode, retention, event transport, and resolution precedence

# System (workspace scope)
/<ws>/doctor                                              workspace doctor
/<ws>/settings                                            workspace settings
/<ws>/settings/theme
/<ws>/settings/api
/<ws>/settings/flags
/<ws>/settings/secrets
/<ws>/settings/experiments
/<ws>/settings/importers
/<ws>/settings/members
/<ws>/settings/identity
/<ws>/settings/billing
/<ws>/audit                                               workspace audit
/<ws>/skills                                              skill registry
/<ws>/mcp                                                 MCP server list
/<ws>/credentials                                         credentials

# Browse (peek-overview deep link target)
/<ws>/browse/<workItemId>                                 universal peek (any entity by id)

# Trace
/<ws>/trace/<traceId>                                     trace explorer (cross-surface)

# Auth
/auth/login
/auth/signup
/onboarding                                           signup verification + workspace setup
/auth/invite/<token>
/auth/logout

# Errors
/404
/500
/offline

# Marketing (prerendered, separate /app shell)
/                                                         landing
/marketing/docs                                           public marketing docs (separate from app /docs hub)
/changelog

# System surfaces (internal previews + platform shells)
/desktop                                                  desktop-shell preview (Tauri window chrome, gated by FULCRUM_FEATURES=desktop-app)
/os-widgets                                               gallery of macOS-style OS-level surfaces (tray menu, native notification, dock badge); internal preview only; not part of web shell production routes
/build-graph                                              internal design-e2e preview for doc search, scoped filters, snippets, graph counts, and planning-context actions
/build-runs                                               internal design-e2e preview for local diff code review, line-anchored annotations, feedback export, feedback-run job logs, QA feedback exhaustion gate, and approval identity
/build-timeline                                           internal design-e2e preview for document version timeline, inline diff, restore confirmation, comments, backlinks, and planning conversion
/task-filters                                             internal design-e2e preview for persistent task filters, AND/OR logic, and saved filtered views
/palette                                                  internal design-e2e preview for permission-aware CommandPalette actions and SavedView access
/comments                                                 internal design-e2e preview for task detail side panel with inline edit, properties, comments, activity, related tasks, and runs
/comments-block-thread                                    internal design-e2e preview for inline comment marks, margin pins, hover previews, thread sidebar, resolved state, and mark deletion
/auth-flows                                               internal design-e2e preview for login form, OAuth provider POST payloads, passkey support detection, and recovery guidance
/cross-cutting-offline                                    internal design-e2e preview for offline banner, last-sync timestamp, sync-now action, and queued mutation replay state
/cross-cutting-mobile                                     internal design-e2e preview for Android status-bar/gesture-zone, iOS notch/home-indicator/bottom-nav/landscape safe-area reserves, and Tailwind sm/md/lg/xl responsive breakpoint reflow
/cross-cutting-motion                                     internal design-e2e preview for prefers-reduced-motion, parallax disablement, decorative autoplay pause, and animationSpeed settings override
/cross-cutting-perf                                       internal design-e2e preview for TanStack Virtual lists over 100 rows, overscan 10, stable 48px rows, jump-to-row, and selection persistence
/mobile-capture                                           internal design-e2e preview for mobile capture Core Web Vitals budgets, layout stability, opt-in metric delivery, and task quick-create tray behavior
/view-controls                                            internal design-e2e preview for view sort controls (header sort, asc/desc indicator, mobile sort menu, clear sort)
/                                                         public landing page surfaced via marketing build; linked from docs + downloads only; not part of authenticated web shell
```

URL invariants:
- Every route under `/app/*` is service-worker scoped (research-06 §4).
- Deep-link normalization: legacy `/tasks/<id>` → `/<ws>/browse/<id>` with HTTP 301 (research-07 §3.5).
- Trace ID survives as URL hash: every route accepts `#trace=<id>` and renders the trace badge highlighted.
- Filter state survives via query params: `?status=open&assignee=me&view=board`.

---

## 2. Stage IA detail

### 2.1 Capture

| Surface | Route | Default view | Per-step mode |
|---|---|---|---|
| Freeform editor | `/.../capture/<docId>` | Blank canvas, slash menu | manual / Play / Discuss / AI Assist |
| Docs tree | `/.../capture` (left rail) | Lazy expansion, drag reorder (Docmost shape) | n/a |
| Intake queue | `/.../capture/inbox` | Single column, snooze/accept/decline | Plane intake (modified) |
| Templates | inline | Note, Doc, Decision, Bug, Question, Intake | n/a |

Editor: TipTap-based, slash menu, mentions (`@user`, `@page`, `@TASK-123`, `@RUN-456`, `@Oct 1`), block types per DESIGN.md §3, page history, comments side rail. Real-time collaboration shows connected users, cursor overlays, connection health, last saved state, offline retry, and contributor-attributed revision history; flag-off state keeps single-user save controls without dead collaboration UI.

Exit handoff: "Hand off to Plan" button on doc header → creates planning session pre-seeded with this doc as context. Trace ID allocated here.

### 2.2 Plan

| Surface | Route | Default view |
|---|---|---|
| Planning sessions list | `/.../plan` | Most recent at top, inline "new session" |
| Live ACP session | `/.../plan/<sessionId>` | Live Session Pane (DESIGN.md §8) |
| Plan + prototype + tasks tripane | `/.../plan/<planId>/review` | Side-by-side, single approve gate |
| Mission tree | `/.../plan/missions` | Mission → Wave → Increment → Task |

Plan output (research-07 §3.3): plan markdown + prototype callout(s) + task breakdown. Review gate approves all three as one unit. Plannotator `Mod+Enter` overload: approve (if no annotations) or send feedback.

### 2.3 Build

| Surface | Route | Source |
|---|---|---|
| Board / list / table / calendar / gantt | `/.../build/<layout>` | Plane five-layout (research-07 §1.3 verbatim) |
| Dependency graph | `/.../build/graph` | Fusion Sugiyama layered (research-07 §3.2 verbatim) |
| Runs feed | `/.../build/runs` | Research-02 § Web Run Feed |
| Live session pane | `/.../build/runs/<runId>` | Verbatim ACP shape (research-02) |
| Cycles list/detail | `/.../build/cycles[/<id>]` | Plane cycles |
| Modules list/detail | `/.../build/modules[/<id>]` | Plane modules |
| Peek overview | overlay anywhere | Plane peek-overview |

Lifecycle states (research-07 §3.1 verbatim Fusion): `planning → todo → in-progress → in-review → done → archived`. Deterministic column ordering: `todo` mirrors scheduler pickup order, `done` mirrors most recent completion.

### 2.4 Review

| Surface | Route | Source |
|---|---|---|
| Review queue | `/.../review` | Plannotator review-sidebar |
| Review workbench | `/.../review/<reviewId>` | Plannotator review-editor 40-component suite verbatim |
| QA report | `/.../review/qa` | Generated QA gate |
| UAT handoff | `/.../review/uat` | Approval gate |
| E2E runner | `/.../review/e2e` | Generated E2E runner + result viewer |

Shortcuts: `Mod+Enter` approve or send-feedback overload; `Alt Alt` double-tap toggles review destination (platform PR ↔ local agent). Bottom dock: PR Comments / PR Checks / PR Summary / Live Logs / Suggestions tabs.

### 2.5 Ship

| Surface | Route | Notes |
|---|---|---|
| Artifacts list | `/.../ship` | Filter by kind: binary / spec / report / memory candidate |
| Artifact detail | `/.../ship/<id>` | Preview + download + link / Plane peek-overview pattern |
| Reports | `/.../ship/reports` | Cycle reports, generated narratives |
| Memory promotion | `/.../ship/memory` | Promote candidate → durable memory entry (provenance trail) |

Plan-share zero-knowledge URL hash sharing (AES-256-GCM, 7-day TTL) from Plannotator (research-07 §4.4 verbatim).

### 2.6 Operate

| Surface | Route | Source |
|---|---|---|
| Doctor subsystems | `/.../operate/doctor` | Research-04 §16 verbatim (npm doctor × Healthchecks) |
| Runs history | `/.../operate/runs` | Cross-cycle runs feed |
| Inbox | `/.../operate/inbox` | Notification list, filter, mark-read |
| Audit log | `/.../operate/audit` | Research-04 § Audit verbatim |
| Error logs | `/.../operate/error-logs` | Sentry fingerprint grouping verbatim |
| Telemetry | `/.../operate/telemetry` | Opt-in 3-state (off/anon/on) |
| Settings tabs | `/.../operate/settings/...` | Plane 2-level split: workspace vs project |
| Feature toggles | `/.../operate/settings/features` | Per-project: cycles/intake/modules/views/pages on/off |

---

## 3. Sidebar IA (exact)

```
SCOPE BAR (48px)
  Fulcrum · [mkh / fulcrum ▾]  branch  [stage tabs]  spacer  [trace tr_8f29…]  search  bell·  ⚙  ?  avatar

STAGE NAV (left rail)
  • Capture
  • Plan
  • Build      ← (current scope underline)
  • Review
  • Ship
  • Operate
  ─────
  ▼ System
    Settings              → settings.html (sections: General · Appearance · Keyboard · AI agents · Default routes · Privacy · Integrations · Account · Danger)
    Knowledge
    MCP servers           → operate-mcp.html (per-agent scope)
    Plugins               → operate-plugins.html (per-agent scope)

STATUS FOOTER (44px)
  [MODE pill] profile · branch · run x/y · agent · mcp · — spacer —
  trace · time · ? · ⌘K · ✨ AI Assist ⌘/   ← right-most segment is the AI Assist trigger
```

- Stage nav 220 px expanded / 56 px collapsed (icons + tooltip).
- Portfolio surfaces always visible (Plane two-tier sidebar adapted — research-07 §1.1).
- System section collapsed by default; opens on hover.
- **Settings page sub-IA** (anchors on `settings.html`): `#general · #appearance · #keyboard · #privacy · #agents · #routes · #integrations · #account · #danger`. The `#agents` panel hosts the multi-CLI agent registry; `#routes` hosts the action-kind → default-agent routing table. Both are linked from the agent picker in every AI Assist drawer.

---

## 4. Keyboard map

### 4.1 Global navigation

| Key | Action | Source |
|---|---|---|
| `g c` | Go to Capture | Linear-style |
| `g p` | Go to Plan | |
| `g b` | Go to Build | |
| `g r` | Go to Review | |
| `g s` | Go to Ship | |
| `g o` | Go to Operate | |
| `g d` | Go to Dashboard | |
| `g i` | Go to Inbox | |
| `⌘K` | Command palette | Linear/Plane/VS Code |
| `⌘/` | Toggle AI Assist drawer | Fulcrum |
| `⌘,` | Open settings | macOS convention |
| `?` | Keyboard cheatsheet | k9s/Linear |
| `g g` | First item in list | vim |
| `G` | Last item | vim |
| `Esc` | Close current overlay / drawer / palette | universal |

### 4.2 List + table navigation

| Key | Action |
|---|---|
| `j` / `↓` | Next row |
| `k` / `↑` | Prev row |
| `Enter` | Open detail (or peek if shift held) |
| `o` | Open in new tab |
| `c` | Create new in current stage |
| `f` | Filter |
| `/` | Search |
| `x` | Toggle select |
| `Shift+x` | Range select |
| `⌘A` | Select all visible |
| `e` | Edit inline |
| `Backspace` | Archive (with confirm if destructive) |

### 4.3 Per-step modes

| Key | Action |
|---|---|
| `p` | ▶ Play current step |
| `d` | 💬 Discuss current step |
| `m` | Open mode picker |
| `Shift+P` | Replay last Play |

### 4.4 Review-specific (Plannotator verbatim)

| Key | Action |
|---|---|
| `Mod+Enter` | Approve (no annotations) or send feedback |
| `Alt Alt` (double-tap) | Toggle review destination |
| `Mod+B` | Toggle file tree |
| `Mod+.` | Toggle review sidebar |
| `V` | Toggle "viewed" on file |
| `Mod+F` | Focus search |
| `Enter` / `F3` | Next search match |
| `Shift+Enter` | Prev search match |

### 4.5 Editor (Capture / Plan plan markdown)

| Key | Action |
|---|---|
| `/` | Slash menu |
| `@` | Mention |
| `⌘B / ⌘I / ⌘U` | Bold / italic / underline |
| `⌘K` (in editor) | Insert link |
| `⌘Shift+M` | Comment on selection |
| `⌘Z / ⌘Shift+Z` | Undo / redo |
| `⌘S` | Force save (autosave on by default) |

---

## 5. Right drawer — AI Assist (formerly "ACP chat panel")

Per DESIGN.md §3.1 + research-01 §11. Slides over content as an overlay with a dimmed/blurred backdrop (Cloudflare AI Assistant pattern), not push-style.

```
┌──────────────────────────────────────────┐
│ ✨ AI chat │ [CL Claude Opus 4.7 ▾] │ ⛶ ✕│  ← header: title, agent picker, expand, close
├──────────────────────────────────────────┤
│ @ scope: live planning session  · tr_8f… │  ← scope chip + trace pill (copyable)
├──────────────────────────────────────────┤
│ Suggestions for this screen              │  ← 4 context-aware suggestion buttons
│  · Summarize what's on this screen        │
│  · What should I do next?                 │
│  · Explain the controls and shortcuts     │
│  · Find similar past work                 │
├──────────────────────────────────────────┤
│   transcript (scrollable)                │
│   - user message                         │
│   - agent_message_chunk                  │
│   - tool_call card                       │
├──────────────────────────────────────────┤
│ Composer                                  │
│  [type or paste; @ to mention scope...]   │
│  @ scope · 📎 attach · 💾 Save · ▶ Send ⌘↵│
└──────────────────────────────────────────┘
```

- Width **420 px desktop / 92 vw mobile** (overlay, not push — no longer user-resizable).
- `⌘/` toggle from anywhere. Backdrop click or `Esc` closes.
- Survives stage nav; threads tabbed per agent — switching the agent picker keeps history per agent.
- Auto-scopes to current step + project + trace ID.
- **Agent picker header opens a full panel** listing every configured CLI agent (claude-code · codex · gemini-cli · opencode · pi-cli · custom), with status dot · client kind · latency · MCP count · plugin count · ring badge. Includes a filter input and `+ Add CLI agent (claude-code, codex, gemini-cli, opencode, pi-cli …)` shortcut. Footer link: `Manage agents, MCP & plugins in Settings →`.
- Entry point: the **right-most segment of the status footer** on web (`✨ AI Assist  ⌘/`), the **right-most tab** of the bottom tab bar on mobile (accent-tinted), or the **right-most segment of the terminal footer** in TUI. Never decorative; always accent-tinted left-border.
- Mobile: bottom sheet 92vw × full-height-minus-tabs.
- Session actions inside the AI Assist workbench:
  - Pause / Resume are direct form actions on the active session.
  - Abort opens reason + required-note confirmation before `?/abortWithReason`.
  - Checkpoint timeline actions post to `?/restoreCheckpoint` for newest checkpoint or `?/forkFromCheckpoint` after older-checkpoint confirmation.
  - Paused sessions show a pause-queue count so queued prompts remain visible before resume.

---

## 6. Command palette (⌘K) contents

Per research-07 §1.6 Plane Power-K + research-01 §12.

### Sections (in order)

1. **Recent** (4 entries, frecency-ranked).
2. **Workflow stage nav:** Go to Capture / Plan / Build / Review / Ship / Operate.
3. **Project switcher:** projects (with preview counts), recent, "All projects".
4. **Step actions** (only when invoked on a step):
   - ▶ Play this step
   - 💬 Discuss this step
   - ⊞ Open in AI Assist drawer
   - Copy trace ID
   - Open in audit
5. **Federated search:** docs / tasks / runs / artifacts / memory / audit rows.
6. **Settings search:** every settings field by name.
7. **Workspace + theme:** switch workspace, toggle theme, density mode.
8. **Help:** keyboard cheatsheet, docs.

Context detector reads route + active step → swaps menu set (Plane verbatim). Active context chip shown in palette header so ambiguity is impossible.

---

## 7. Status footer (web bottom + TUI bottom)

Identical layout across surfaces.

```
[NORMAL] [work] [fulcrum:mo/branch] [run:01HXYZ 12/47] [agent:claude-opus-4-7] [mcp:5/5] [trace 4f3a1c9e] [10:42] [?] [⌘K]
```

Segments left → right:
1. **MODE** (NORMAL/INSERT/FILTER/COMMAND) — reverse video accent.
2. **Profile** — work / oss / home.
3. **Repo:branch** — current scope.
4. **Run id + position** — tig-style "12 of 47".
5. **Agent** — active agent for ▶ Play.
6. **MCP** — healthy/total servers, red if degraded.
7. **Trace** — current trace ID (OSC 8 hyperlink-aware in modern terminals).
8. **Clock** — local time.
9. **Hints** — `?` opens cheatsheet, `⌘K` opens palette.

Never collapses. Never scrolls. Only mode segment changes color.

**Modes pill (trailing).** When focus enters a step that supports mode affordances, the status footer surfaces a trailing pill `[ Modes ]` containing the long-form mode-row. On TUI, the same pill renders in the footer as `[ ✋ ▶ 💬 :ai ]`.

---

## 8. CLI subcommand tree (mirrors stage nav)

Per research-05 §3.1. Two-level noun-verb hub-and-spoke (gh/wrangler shape).

```
# Capture
fulcrum doc      <list|new|view|edit|attach|history|trash|restore|delete|link|search>
fulcrum note     <new|view|search|tag>
fulcrum capture  <text|url|file>          # generic intake

# Plan
fulcrum plan     <start|list|view|edit|approve|reject|materialize|preview>
fulcrum mission  <create|list|show|activate-slice|delete>
fulcrum prototype <new|view|attach>

# Build
fulcrum task     <new|list|view|edit|move|run-preview|run|qa-review>
fulcrum cycle    <list|activate|complete>
fulcrum module   <list|new|view>
fulcrum run      <new|view|cancel|retry|attach>
fulcrum runs     <feed|list|tail>          # plural reads
fulcrum agent    <list|view|invoke>
fulcrum context  <pack|inspect|diff>

# Review
fulcrum review   <list|view|approve|request-changes>
fulcrum qa       <run|report>
fulcrum uat      <run|handoff|decision>
fulcrum e2e      <run|report>

# Ship
fulcrum artifact <list|view|diff|export>
fulcrum repo     <list|status|sync>
fulcrum branch   <list|switch|finish>
fulcrum pr       <list|view|create>        # delegates to gh
fulcrum memory   <list|promote|view>

# Operate
fulcrum doctor   [--json] [--subsystem <name>] [--probe]
fulcrum mcp      <list|register|unregister|enable|disable|test|reload>
                 [--agent <id>]               # scope MCP ops to a CLI agent
fulcrum plugin   <list|install|enable|disable|update|remove>
                 [--agent <id>] [--all-agents]
fulcrum hooks    <list|enable|disable|test>
fulcrum skills   <list|install|sync|lint|upstream>
                 install <path> [--force-conflict] [--resolve-conflict=alt-version|skip|upgrade-installed]
fulcrum install  [--profile minimal|rules-only|full] [--dry-run]
fulcrum compress [--check]
fulcrum config   <get|set|edit|path>
fulcrum audit    <list|export|--trace <id>>
fulcrum trace    <show <id>>
fulcrum ai       [--step <id>] [--agent <id>]   # opens inline AI Assist session;
                                                # --agent overrides the default route
                                                # for the step's action kind
                 start --task <id> --title <title> [--agent <id>] [--route plan|build|review]
                                                # starts task-scoped AI Assist with assembled context

# Multi-CLI agent management (no cap on configured agents)
fulcrum agent    <list|view|add|edit|remove|enable|disable|set-default|reload>
                 [--client claude-code|codex|gemini-cli|opencode|pi-cli|...]
                 [--ring preferred|stable|experimental]
fulcrum agent invoke <id> [--step <step-id>]    # run any agent against a step
fulcrum route    <list|show|set|reset>           # default agent per action kind
                 <action-kind> <agent-id> [--fallback <agent-id>]
                 # action kinds: plan.draft, plan.refine, plan.prototype,
                 # capture.discuss, build.run.step, build.run.long,
                 # review.suggest, review.summary, ship.changelog,
                 # operate.probe, operate.diagnose, ai.freeform

# Settings
fulcrum settings              # opens :settings (TUI) or settings.html (web)
fulcrum profile  <list|show|switch|new|delete>
fulcrum workspace <list|switch|new>

# Cross-cutting
fulcrum web                                 # opens web shell
fulcrum tui                                 # opens TUI (default if no args)
fulcrum version
fulcrum help [topic]
fulcrum completion <bash|zsh|fish|powershell>
```

Default: `fulcrum` alone = `fulcrum tui`. `-h/--help` always works. Every command accepts `--profile <name>` and emits `trace=<id>` in stderr envelope for cross-surface linking.

### 8.1 CLI envelope format

Every command writes a one-line trailer to stderr (so `--json` stdout stays parseable):

```
fulcrum: ok | err [exit=N] trace=<id> agent=<id> profile=<name> took=<ms>
```

Errors follow the COPY.md template: `[what failed]. [why]. [next step]. trace=<id>`. Use `fulcrum trace show <id>` to jump to the trace explorer (web auto-opens if `$FULCRUM_OPEN=1`).

---

## 9. TUI screen list (mirrors stage nav · full parity with web)

Per research-05 §3.5. OpenTUI host shell, screens implemented as components. The TUI is **feature-complete parity** with the web shell: every web destination has a TUI screen. AI is **TUI-native** (inline `:ai` pane), never a web drawer overlay.

| Stage | Screen | Default key | Notes |
|---|---|---|---|
| Capture | `:capture` (alias `:inbox`) | `j/k` items, `Enter`, `c` capture | filters / drafts / promoted in side pane |
| Capture | `:docs` | tree nav, `Enter`, `n` new | doc reader/editor |
| Capture | `:doc/<id>` | mode keys `p / d / m / :ai` | per-block mode row |
| Plan | `:plan` | sessions list | `Enter` enters live session |
| Plan | `:plan/<id>` | live planning session | 3-pane: sessions · transcript · workspace |
| Plan | `:missions` | mission tree | activate slice with `a` |
| Plan | `:prototype` | prototype gallery | live + archived |
| Plan | `:templates` | plan template library | 12 templates |
| Plan | `:prompts` | prompt library | tag filter |
| Build | `:runs` | runs feed, auto-tail | `Enter` opens `:run/<id>` |
| Build | `:run` / `:run/<id>` | live agent session | 4 panes: steps · current tool · cost/tokens · permission |
| Build | `:board` | task board (j/k/h/l) | five-layout switcher mirrors web |
| Build | `:list` | task list view | dense table |
| Build | `:timeline` | gantt | 14-day window |
| Build | `:graph` | dependency graph | status-coloured nodes |
| Review | `:review` | review queue | tabs: awaiting / changes / approved / merged |
| Review | `:review/<id>` | diff viewer | inline comments anchored to lines |
| Ship | `:ship` | releases list | cycle/channel filters |
| Ship | `:ship/<id>` | release detail | overlay panel (top-anchored sheet) |
| Ship | `:archive` | release archive | major/minor/patch pills |
| Operate | `:doctor` | subsystems | probe per row |
| Operate | `:telemetry` | charts | p50/p99 · runs-by-step · resources |
| Operate | `:alerts` | firing alerts | severity tabs |
| Operate | `:mcp` | per-agent MCP scope | scope chip switches CLI agent |
| Operate | `:plugins` | per-agent plugin scope | toggle / update / install-across |
| Operate | `:audit` | audit log | trace-linked |
| Operate | `:logs` | live log tail | follow + filter |
| System | `:ai` | inline AI Assist pane (TUI-native, inline screen swap, NOT a web drawer overlay) | TUI-native; no web drawer; auto-injected `[ :ai ]` foot seg on every screen; explicitly listed per OD pass-5 |
| System | `:agents` | CLI agent registry | unlimited entries · `a` add · `d` set default |
| System | `:routes` | default agent per action | `e` edit · `o` override · `r` reset |
| System | `:settings` | settings | 8 sections: General · Appearance · Keyboard · Privacy · Integrations · AI agents · Account · Danger |
| System | `:K` | command palette | parity with web ⌘K |
| System | `?` | keyboard cheatsheet | full key map |

Universal keys: `:` palette, `/` filter, `?` help, `Space` modeless menu, `g g / G` first/last, `H/L` prev/next screen, `q` pop view, `Ctrl-C` graceful quit. Stage chord: `g {c|p|b|B|r|s|o}` (`g b` runs feed, `g B` board). Run control: `:run`, `:pause`, `:cancel`, `:replay`. Profile: `:profile`, `:workspace`. Settings: `:set theme dark/light`, `:set density compact/cozy/comfortable`, `:set mode simple/pro`.

### 9.1 TUI footer (status spine)

Mirrors web `.foot` exactly. Left-to-right: `mode pill · profile · repo:branch · run id + step · agent · mcp health · spacer · trace · time · ? · :`. Right-most segment is `[ :ai ]` (accent-bordered), invokes `:ai` inline screen. No drawer.

### 9.2 TUI ≠ web invariants

- **No web chat drawer in TUI.** AI is the inline `:ai` screen.
- **No mouse-only affordances.** Every action has a keystroke; click is a convenience.
- **No animation.** Status changes flash one frame; no slide / fade / pulse beyond the cursor blink.
- **Status badge vocabulary identical.** `pending · running · complete · blocked · awaiting · failed · cancelled · degraded · unknown` — color + glyph + text, never color alone.
- **Trace ID on every footer.** Click (or `y` yank) copies; `:trace <id>` jumps.

---

## 10. Mobile IA (`<md`)

```
┌─────────────────────────────────────────┐
│ scope chip   trace 4f3a…   🔔   avatar  │  ← 40px scope bar
├─────────────────────────────────────────┤
│                                         │
│         CONTENT (single column)         │
│                                         │
│                                         │
├─────────────────────────────────────────┤
│  [Cap] [Plan] [Build] [Rev] [Ship] [···]│  ← bottom tab bar (6 stages)
└─────────────────────────────────────────┘
```

- Bottom tab bar 6 icons (Capture / Plan / Build / Review / Ship / Operate); first 5 always visible, Operate folds with portfolio + system under "···".
- AI Assist drawer = bottom sheet 60vh draggable.
- Modals = bottom sheets.
- Tap targets ≥44×44 px under `(pointer: coarse)` (research-06 §1, WCAG 2.5.5).
- Mobile shell reserve: Android status-bar top inset ≥24 px, Android bottom gesture inset ≥48 px, Android landscape inline gesture insets ≥48 px; iOS notched-device top inset ≥47 px, iOS home-indicator bottom inset ≥34 px, and iOS landscape notch insets ≥47 px. Bottom tab bar and mobile sheets sit above those reserves. Responsive web shell uses the Tailwind v4 `xs/sm/md/lg/xl/2xl` ladder from DESIGN.md §1.5; mobile/desktop branching uses the same `md - 1` threshold as `MOBILE_QUERY`.
- Heavy authoring (multi-pane doc edit, complex board drag) gracefully degrades to "open desktop for full edit" banner; read + approve + comment + status-update remain fully mobile.

---

## 11. Trace-spine — cross-surface link grammar

Same trace ID surfaces in 4 places (research-04 §15):

- **Web:** scope-bar pill, AI Assist drawer header, every error inline mention, audit row, every transcript chip.
- **CLI:** `--json` envelope `trace_id` field, plain-text header line, `fulcrum trace show <id>`.
- **TUI:** status footer `[trace 4f3a1c9e]` segment, `y t` to yank.
- **URL:** `/<ws>/trace/<traceId>` deep link, every primary route accepts `#trace=<id>`.

Click any of them → same trace explorer view (span tree + linked artifacts + audit slice + linked runs).

**Mode-row × trace.** Every of the 24 stage-list surfaces (post-pass-2) now carries the mode-row at step-level; the trace ID echoes into each mode-button's `aria-describedby` so screen readers announce `[mode], trace tr_8f29a4c`.

---

## 12. Sources

### 12.1 Sibling design docs

- [PRODUCT.md](PRODUCT.md) — target state, workflow stages, four-mode contract, scope chrome, agent identity, hard invariants, Transformation Discipline (carry-over inventory of every existing route, CLI command, TUI screen).
- [DESIGN.md](DESIGN.md) — tokens, typography, components, motion, trace badge spec, status vocabulary, live session pane, cross-surface invariants.
- [COPY.md](COPY.md) — voice rules, empty-state per-surface samples, error template, status label lock.
- [CLI-TUI-UX.md](CLI-TUI-UX.md) — extends §8 (CLI tree) and §9 (TUI screen list) with JSON envelope, flag standards, completion install, error codes, keyboard map, parity table.
- [OD-PROMPT.md](OD-PROMPT.md) — paste block for Open Design with all required reads.

### 12.2 Research dossiers (`.scratch/design-research/`)

- [01-workflow-nav-ia.md](.scratch/design-research/01-workflow-nav-ia.md) — drives §3 (sidebar IA), §5 (right drawer), §6 (palette), §7 (status footer). Linear / Plane / Devin / Cursor / GitHub Projects / Notion / k9s.
- [02-agent-supervision.md](.scratch/design-research/02-agent-supervision.md) — drives §2.3 (Build runs feed), §5 (ACP drawer), live session shape inside Plan/Build. Devin / Cursor / Claude Code / Codex / Aider / Replit / Linear Agents / LangSmith / Temporal / Argo / Dagster / Airflow / ACP.
- [03-knowledge-docs-memory.md](.scratch/design-research/03-knowledge-docs-memory.md) — drives §2.1 (Capture editor + tree), Plan doc surface, memory promotion in §2.5 (Ship). Notion / Docmost / Outline / Anytype / Logseq / Obsidian / Tana / Linear docs / Slack Canvas.
- [04-observability-trace.md](.scratch/design-research/04-observability-trace.md) — drives §2.6 (Operate doctor/audit/error logs/telemetry), §11 (trace-spine link grammar). Datadog / Honeycomb / Sentry / LangSmith / Grafana / OpenTelemetry / GitHub Actions / Vercel / Healthchecks / k9s / CloudTrail / Stripe / Okta / Auth0 / npm doctor.
- [05-cli-tui-design.md](.scratch/design-research/05-cli-tui-design.md) — drives §8 (CLI tree) and §9 (TUI screens), expanded in CLI-TUI-UX.md. gh / stripe / vercel / wrangler / flyctl / cargo / bun / kubectl / clig.dev / 12-factor / k9s / lazygit / tig / btop / fzf / Helix / Charm / OpenTUI / gh-dash.
- [06-mobile-a11y-perf-tokens.md](.scratch/design-research/06-mobile-a11y-perf-tokens.md) — drives §10 (mobile IA), breakpoint inheritance from DESIGN.md §1.5. Tailwind v4 / Apple HIG / Material 3 / shadcn-svelte / WCAG 2.2 AA / Bits UI / Radix.
- [07-copy-first-parity.md](.scratch/design-research/07-copy-first-parity.md) — drives §2.3 (Plane five-layout views verbatim), §2.4 (Plannotator review-editor 40-component suite verbatim), §2.6 (Plane settings two-level split), trace-spine cross-cuts. Plane / Docmost / Fusion / Plannotator / ACP-UI master adoption table.

### 12.3 PRD glossary + impeccable + goal

- [.scratch/prd.jsonl](.scratch/prd.jsonl) — 1281 PRD entries; 142 CLI + 149 TUI items inform §8 + §9, 178 `workflow parity` mentions force workflow-stage IA, 148 `traceability` force §11.
- [.claude/skills/impeccable/reference/product.md](.claude/skills/impeccable/reference/product.md).
- [.scratch/manual-smoke-2026-05-17/manual-smoke-ux-remediation-loop-goal.md](.scratch/manual-smoke-2026-05-17/manual-smoke-ux-remediation-loop-goal.md).

### 12.4 Transformation note

Every web route, CLI command, and TUI screen currently shipped in `apps/web/src/routes/**`, `apps/cli/src/commands/**`, `apps/tui/src/screens/**` is preserved under the new IA. See [PRODUCT.md § Transformation Discipline](PRODUCT.md) for the per-cluster carry-over table. Renames are 301-redirected for one minor version with deprecation banner.

> 2026-05-18 OD pass: route tree gains `/desktop`, `/os-widgets`, `/` (landing).
