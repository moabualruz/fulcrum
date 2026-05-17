# Workflow-Stage Navigation, Project Hierarchy, IA for Agent-Managed Product Work

> Research date: 2026-05-17. Sources: Linear Method + docs, Plane docs, Plannotator code, Devin docs, Cursor agents, GitHub Projects, Notion sidebar guides, k9s, dense-workbench prior art. ≥18 citations.

## 1. The two competing IA philosophies

Two dominant IA models in PM/agent tools today:

- **Workflow-stage primary (Linear, Asks, Diffs, Intake).** Sidebar groups by *what stage of work the user is in* (Inbox → Triage → Backlog → Current → Diffs → Done). Domain features collapse under the stage that needs them. The "current cycle" is the default landing.
- **Feature-bucket primary (Jira, Asana, ClickUp, Plane, Shortcut).** Sidebar groups by *type of object* (Projects / Cycles / Modules / Pages / Members). The user must mentally project their workflow onto the object tree every time they navigate.

Linear's stated principle: "Purpose-built. Productivity software needs to be designed for purpose. It's the only way the product can truly do the heavy lifting. Flexible software lets everyone invent their own workflows, which eventually creates chaos as teams scale." ([Linear Method, Principles](https://linear.app/method/introduction)). Their nav is the operational expression of that principle.

Plane chose the opposite (feature-bucket) because it markets itself as "the open-source alternative to all of them". Plane's docs land users on Projects → Cycles → Modules → Views; the user constructs their own workflow from primitives ([Plane docs / Projects](https://docs.plane.so/core-concepts/projects), [Plane docs / Cycles](https://docs.plane.so/core-concepts/cycles), [Plane docs / Modules](https://docs.plane.so/core-concepts/modules)).

**Lesson for Fulcrum.** We are not a flexibility-first product. Fulcrum has one canonical workflow (Capture → Plan → Build → Review → Ship → Operate) and one project model. Workflow-stage IA is the correct choice. Plane gives us the multi-layout view ergonomics inside Build; it does not give us the navigation.

## 2. Linear's stage IA in detail

Linear's left rail (workspace-level) — as of late 2025/early 2026:

1. **Inbox** — unread notifications, mentions, things requiring action.
2. **My Issues** — assigned to me, regardless of project.
3. **Active Cycle** — current sprint scope for the team in focus.
4. **Projects** — feature-sized work units (1–3 weeks, 1–3 people).
5. **Initiatives** — manually curated lists of projects that roll up to a company objective. Visible only at workspace level. ([Initiatives docs](https://linear.app/docs/initiatives))
6. **Views** — saved filters + layouts.
7. **Docs** — Linear's lightweight in-product docs.
8. **Team-scoped sub-sections** (per team): Triage, Active Cycle, Backlog, All Issues.

Three crucial details:

- **The current cycle is the landing surface for ICs.** "Open the app → see what you owe today." No homepage stat dashboard.
- **Triage is its own first-class queue**, not a filter. Unsorted issues from integrations or external reports have an explicit destination. ([Linear docs / Triage](https://linear.app/docs/triage))
- **Initiatives are above projects**, not parallel to them. Initiatives = goals; Projects = scoped 1–3 week units that lead to a goal; Issues = tasks inside a project. Three levels, no more. Linear deliberately rejects deeper nesting.

Linear's *Scope projects down* rule is explicit: "Design projects so that they can be completed in 1–3 weeks with a team of 1–3 people. Smaller fixes or additions should take only hours or a day." ([Linear Method, Scope Projects](https://linear.app/method/scope-projects))

## 3. Plane's hierarchical model

Plane's hierarchy as of May 2026 docs:

```
Workspace → Project → (Cycle | Module | Page | View) → Work item
```

- **Cycles** = time-bounded sprints. Default no-overlap, with optional "parallel cycles". Press `Q` from anywhere to create one. ([Plane docs / Cycles](https://docs.plane.so/core-concepts/cycles))
- **Modules** = subsystem groupings independent of time. "Smaller, focused projects … microservice, marketing campaign, milestone". Press `M` to create. ([Plane docs / Modules](https://docs.plane.so/core-concepts/modules))
- **Views** = saved filter + layout configurations. Two scopes: Project Views (per-project) and Workspace Views (cross-project, spreadsheet-layout only). Four built-in: All Issues, Assigned to Me, Created by Me, Subscribed. ([Plane docs / Views](https://docs.plane.so/core-concepts/views))
- **Work items** carry: identifier (`PROJ-123`), state group, priority, assignees, labels, parent, dependencies, custom fields.

Plane's keyboard mnemonics matter: `N → P` (new project), `C` (new work item), `Q` (new cycle), `M` (new module). Single-letter command keys minimize friction. Press-from-anywhere semantics matches Linear's `C` for new issue.

**Plane wins on:** view flexibility (board / list / table / calendar / gantt parity), single-letter shortcuts, saved-view sharing via stable URL.
**Plane loses on:** stage-first IA, density discipline (Plane's UI is closer to Jira than Linear), agent integration story (none).

## 4. Hierarchy depth — three is the limit

Across Linear, Plane, Shortcut, Notion, GitHub Projects, the practical depth limit is three (Goal/Initiative → Project → Issue) plus an orthogonal grouping (Cycle | Module | Module-of-Cycles). Tools that allow arbitrary nesting (Asana, ClickUp) report user confusion and high abandonment of deeper levels.

**Fulcrum decision.** Three levels: Workspace → Project (parent or child) → Work item. Subprojects exist via parent-id with optional inheritance per module (repo, docs, memory, automations, reports, run policy, context sources). Per-module inheritance follows Plane's data model but Fulcrum surfaces "inherited / overridden / locked" status inline, not behind a settings tab. The user always knows whether the value they see is their own or inherited.

## 5. Active-scope indicator

Where does the user know "I am in Project X / Repo Y / Cycle Z right now"?

- **Linear:** Team switcher top-left + cycle/project context bar above the issue list. Issue identifier (`ENG-123`) carries team prefix.
- **Plane:** Workspace switcher top-left + project switcher mid-sidebar. Breadcrumb at the top of each work-item view.
- **GitHub:** Owner + repo in top breadcrumb; Project v2 adds a project-selector dropdown.
- **k9s:** Persistent footer showing context, namespace, current resource. Always at-a-glance.
- **VS Code with Cline / Cursor:** Sidebar workspace name + branch indicator in status bar.

**Fulcrum recommendation.** Project + workflow stage are visible at the chrome level on every surface — *not buried in breadcrumbs*. A 24px-tall "scope bar" sits above the workflow-stage nav, showing: workspace · project (with subproject path collapsed if deep) · current stage · trace ID badge (copyable). On mobile, the scope bar collapses to workspace + project chip; trace ID lives in a swipe-down panel.

## 6. Trace-spine breadcrumbs

Every screen must show the spine for the current artifact:

```
workspace → project → repo/local path → work item → docs/context → run → artifacts/memory/follow-ups → audit
```

Plane and Linear both truncate breadcrumbs with `…` when deep. Don't truncate the active span — truncate from the middle if needed, but always show workspace + project + current node. Devin's UI keeps the active session permanent at the top: "Devin / Sessions / Session 4271 / Task 'fix login flow'". ([Devin docs / Intro](https://docs.devin.ai/get-started/devin-intro))

**Fulcrum recommendation.** Breadcrumbs always show: project name → stage → artifact name → trace ID. Truncate only the middle; never the head or the active tail. Each segment is clickable and copyable.

## 7. Portfolio vs project-scoped view switching

Linear does this via the team switcher: "All Teams" vs a specific team. Switching team rewrites the sidebar context. Plane uses a workspace-vs-project nav split (top breadcrumb = workspace, sidebar = project).

Pain points users report (forum posts, Reddit r/projectmanagement, late-2025 — observed from PRD seed agents that mined those threads):

- "Where did my project go?" — switching workspace silently drops project context.
- "I can't see all my projects" — workspace home lists projects but loses task context.
- "Filter doesn't survive switching" — every-tool problem.

**Fulcrum recommendation.** A persistent **scope chip** at top-left ("Workspace / Project") that opens a full-screen scope picker on click (similar to GitHub's repo picker). The scope picker shows recent projects, search, "All projects" portfolio mode toggle, and shows preview counts (tasks, runs, blocked) per project before commit. Filter survival: any filter set inside a project survives switching to another project that has the same filter schema; otherwise show a banner "Filter dropped because field X doesn't exist here. Restore via …".

## 8. Inherited / overridden / locked settings

Plane has nothing for this. Linear has team-level overrides only. Notion has page-level inheritance for permissions (a known confusion point).

The best prior art is **Atlassian's Forge / project schemes** and **GitHub's branch protection rules** — both show inheritance as a tree with explicit ✓ inherited / ✏️ overridden / 🔒 locked badges.

**Fulcrum recommendation.** Settings panels show each value with an inline status chip:

- ✓ **Inherited from parent** — value matches parent. Click "Override" to change locally.
- ✏️ **Overridden** — value differs from parent. Click "Reset to parent" to restore.
- 🔒 **Locked by parent** — parent policy locks this value. Editing disabled with link to parent setting.

Status chips are visible everywhere the setting appears — not in a separate "Inheritance" tab.

## 9. Empty states that move the workflow

Linear, Plane, Shortcut, and Asana all converge on one rule: empty state = next action, never decorative illustration.

Examples observed:

- Linear empty cycle: "No active issues. Create your first issue with `C` or pull from backlog." (Action button.)
- Plane empty board: "Add work items via `C` or drag from list." (Action button.)
- Devin empty session: "No sessions yet. Start one with the prompt below." (Inline prompt input, no separate page.) ([Devin Intro](https://docs.devin.ai/get-started/devin-intro))

Anti-pattern: Notion's "Create your first page" with a centred illustration and three suggestion cards. Users skip them.

**Fulcrum recommendation.** Every empty state has:
1. One sentence naming the next workflow action.
2. One primary button or inline input that performs it.
3. Optional keyboard shortcut hint ("or press `C`").
4. No illustrations. No marketing copy.

## 10. Agent-managed work as first-class participants

Linear (October 2025) released **Agents** as first-class workspace members. Cursor, GitHub Copilot, Sentry, Codex, Leela have official agent profiles. Key UX moves:

- Agents appear in the user picker. You assign issues to an agent the same way you assign to a human.
- When an agent is assigned, "the human user remains the primary assignee, while the agent is added as a contributor". Accountability stays with the human. ([Linear / for Agents](https://linear.app/agents))
- Agents post comments in the same thread as humans. Mentioning `@Cursor` triggers an agent reply.
- Agents can be configured via Linear's Asks (delegation workflows).

Devin pushes further: Devin sessions are first-class entities, addressable via Devin's UI, Slack, Teams, MCP. "Ask Devin to delegate to managed Devins" launches many sessions in parallel. Devin Review with Auto-Fix iterates on CI failures without human in the loop until done. ([Devin / When to Use Devin](https://docs.devin.ai/essential-guidelines/when-to-use-devin))

Cursor's Background Agent operates similarly — a remote session you can monitor and intervene in from the editor.

**Fulcrum recommendation.** Agents are first-class identities:
- An agent appears in every assignee picker, every mention picker, every approval-gate selector.
- Every step has a visible **▶ Play** button. Click → mode picker (which agent, which model, which policy). Default = workspace default agent.
- Every step has a visible **💬 Discuss** button → opens inline thread.
- A persistent **ACP chat drawer** is pullable from the right edge on every surface. Drawer scope auto-binds to the current step + project + trace ID. On step nav, drawer keeps history but updates scope; previous threads accessible via tabs.
- Audit log records every mode switch + every agent action with the same trace ID as the human action.

## 11. The right rail / ACP chat drawer

Patterns observed:

- **Linear right-side panel** for issue detail (closes on Esc, never modal).
- **Notion right-side comments panel** (toggleable, persists across pages).
- **VS Code right sidebar** (chat, GitHub Copilot, settings).
- **Cursor right-side composer** (chat + agent + diff).

All of these survive page navigation. None of them are modals. The drawer is the canonical pattern for "agent context that needs to be visible while you work".

**Fulcrum recommendation.** Right-side drawer is the ACP chat panel + step context. Width: 360–560px, user-adjustable. Pin/unpin button keeps it open across surfaces. Auto-collapse on mobile to bottom sheet. Survives navigation; threads tabbed by step. Trace ID badge in drawer header. Two affordances inline in drawer: "▶ Run with current input" and "💾 Save thread to docs".

## 12. Command palette as cross-cutting nav

Universal in dense workbenches: `cmd-k` in Linear, Plane (`Ctrl+K`), VS Code, GitHub, Vercel, Slack. k9s uses `:` (vim). Bloomberg uses function-key chords.

Pattern (Linear, the leader):
- `cmd-k` opens an instant fuzzy-search palette.
- Top section: recent. Then: project switch, issue search, command actions ("Create issue", "Open inbox", "Toggle theme").
- Keyboard nav only, no mouse needed. Esc closes.
- Returns to where you were.

**Fulcrum recommendation.** `cmd-k` palette opens from any surface. Contents:
- Recent (top 4).
- Workflow stage commands (`Go to Plan`, `Go to Review`, …).
- Project search.
- Doc / task / run / artifact search (federated).
- Settings search.
- "▶ Play this step" — if invoked while on a step.
- "💬 Discuss this step" — same.
- Theme + workspace switch.

TUI uses `:` (vim) for the same palette. CLI exposes the same actions as subcommands.

## 13. Density without crowding

Linear is the modern standard for density. Plane is denser than Linear in some surfaces (table view) but visually noisier (more icons, more colored states). k9s and lazygit prove operators tolerate very high density when the layout is consistent.

Observations:
- **8-px grid + 24-px row height** is the modern standard for table-heavy views (Linear, Plane, GitHub Projects).
- **Type scale: 11–13px body, 14–16px section headings.** Linear uses 13px body, 14px H3. Plane is 14–16px (less dense).
- **One accent color, used sparingly.** Linear is monochrome-ish with one purple accent. Plane uses many colors (one per state group).
- **Iconography is sparse and consistent.** Linear's Lucide icons; one icon per concept.

**Fulcrum recommendation.** Density bar: Linear-equivalent. 8-px grid, 24-px row, 13-px body, 14-px section headings. One accent color (chosen in DESIGN.md). Sparse iconography (Lucide). Density toggle in settings (compact / cozy / comfortable) with the medium being Linear-equivalent.

## 14. Workflow-stage IA proposal for Fulcrum

```
SCOPE BAR (always visible top chrome)
  Workspace · Project (subproject path) · Current stage · Trace ID badge

LEFT NAV (workflow stages)
  Capture
  Plan          ← (current example)
  Build
  Review
  Ship
  Operate
  ───
  Portfolio:
    Dashboard
    Projects
    Search
    Memory
    Inbox
  ───
  System:
    Doctor
    Settings
    Skills
    Audit

RIGHT DRAWER (pullable, ACP chat panel)
  Step context · Active thread · Trace ID

COMMAND PALETTE
  cmd-k from any surface

KEYBOARD GLOBAL
  g c → Capture       g p → Plan        g b → Build
  g r → Review        g s → Ship        g o → Operate
  c → new artifact in current stage
  ▶  → Play current step
  💬 → Discuss current step
  cmd-/ → toggle ACP drawer
  ?    → keyboard cheatsheet
```

## 15. Anti-patterns observed in PRDs that this proposal closes

- **Feature-bucket sidebar** (current Fulcrum) → replaced by workflow stages.
- **Modal-first task create** → replaced by inline create at the bottom of every list (`C` everywhere).
- **Hidden current-scope** → replaced by always-visible scope bar.
- **Trace ID in URL only** → replaced by copyable badge in scope bar + drawer header.
- **Empty cards with illustrations** → replaced by single-sentence + action.
- **Settings buried in admin** → replaced by stage-co-located settings + inheritance chips.
- **One execution mode** → replaced by manual / play / discuss / ACP per step.

## 16. Concrete recommendations for Fulcrum (web + mobile)

| Decision | Choice | Reason |
|---|---|---|
| Primary nav axis | Workflow stages | Aligns with canonical workflow; rejects feature-bucket chaos |
| Hierarchy depth | 3 (workspace → project → work-item) + optional subproject | Three is the practical limit; Linear's choice |
| Active-scope indicator | Persistent scope bar above stage nav, with trace ID badge | Chrome-level visibility, not buried |
| Project switcher | Full-screen scope picker on click; recent + search + portfolio toggle | Survives filter context |
| Settings inheritance | Inline chips (✓ / ✏️ / 🔒) on every value | Always visible, no hidden tab |
| Empty state | One sentence + one action button | No illustrations |
| Right drawer | ACP chat + step context, pullable, sticky | Canonical pattern from Linear/Cursor/VS Code |
| Command palette | `cmd-k` (web), `:` (TUI), federated subcommand list (CLI) | Universal in dense workbenches |
| Density | 8-px grid, 24-px row, 13-px body, one accent | Linear-equivalent |
| Mobile | Workflow stages collapse to bottom tab bar; drawer → bottom sheet | Standard mobile pattern |
| Agent identity | First-class assignee, contributor, mention target; audit-traced | Linear Agents model |
| Per-step modes | Manual / ▶ Play / 💬 Discuss / ACP chat | Cross-cutting affordance per PRDs |
| Keyboard mnemonics | `g <stage>` for nav, `c` create, `▶`/`💬` per step | Linear+Plane convergence |

## Sources

- [Linear Method: Principles & Practices](https://linear.app/method/introduction)
- [Linear Method: Scope Projects Down](https://linear.app/method/scope-projects)
- [Linear Method: Generate Momentum](https://linear.app/method/building-with-momentum)
- [Linear Method: Write Issues Not User Stories](https://linear.app/method/write-issues-not-user-stories)
- [Linear Docs: Projects](https://linear.app/docs/projects)
- [Linear Docs: Initiatives](https://linear.app/docs/initiatives)
- [Linear Docs: Start Guide](https://linear.app/docs/start-guide)
- [Linear for Agents (Oct 2025)](https://linear.app/agents)
- [Linear Docs: Triage](https://linear.app/docs/triage)
- [Plane Docs: Projects](https://docs.plane.so/core-concepts/projects)
- [Plane Docs: Cycles](https://docs.plane.so/core-concepts/cycles)
- [Plane Docs: Modules](https://docs.plane.so/core-concepts/modules)
- [Plane Docs: Views](https://docs.plane.so/core-concepts/views)
- [Plane Docs: Work items](https://docs.plane.so/core-concepts/issues)
- [Devin Docs: Introducing Devin](https://docs.devin.ai/get-started/devin-intro)
- [Devin Docs: When to Use Devin](https://docs.devin.ai/essential-guidelines/when-to-use-devin)
- [GitHub Projects v2 docs](https://docs.github.com/en/issues/planning-and-tracking-with-projects)
- [Notion Sidebar guide](https://www.notion.com/help/customize-and-create-pages-in-your-sidebar)
- [Atlassian Inheritance / project schemes](https://support.atlassian.com/jira-cloud-administration/docs/manage-issue-types-with-schemes/)
- [k9s docs](https://k9scli.io/)
