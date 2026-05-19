# Web Shell (apps/web)

The SvelteKit invocation/visualization surface for Fulcrum. It renders workflow-stage navigation, scope chrome, command palette, AI Assist drawer, and per-stage workbenches. It owns zero business logic and zero persistence — every action calls a service via tRPC or HTTP. Domain rules, validation, and storage live in `services/**`; this app only translates user intent into service calls and service responses into pixels.

## Language

**WorkflowStage**:
One of the six left-to-right segments (Capture, Plan, Build, Review, Ship, Operate) that the user navigates through and that the StageRail surfaces.
_Avoid_: Phase, section, area, tab, feature bucket, module.

**Step**:
A single addressable unit inside a Stage that exposes the four ModeAffordances (one doc, one task, one review item, one artifact, one subsystem row).
_Avoid_: Item, entry, row, card (when referring to the mode-bearing unit).

**Scope**:
The active `(workspace, project, stage, step, trace)` tuple the surface is bound to. Every query, palette result, and AI Assist session is filtered by it.
_Avoid_: Context, filter, selection (when referring to the chrome-level scope).

**StageRail**:
The 220px (collapsed 56px) left-rail navigator that lists WorkflowStages and the System group; the primary axis of navigation.
_Avoid_: Sidebar, nav, menu (when referring to this specific rail).

**ScopeBar**:
The 48px top chrome strip that holds the brand mark, WorkspaceSwitcher, stage tab strip, TraceBadge, palette/notifications/display/help/account icons.
_Avoid_: Header, topbar, navbar, toolbar.

**StatusFooter**:
The 44px bottom strip mirroring the TUI footer; carries mode pill, profile, branch, run id, agent, MCP health, TraceBadge, clock, and the right-most AI Assist trigger segment.
_Avoid_: Status bar, footer (without "Status"), bottom dock.

**AndroidSafeArea**:
The shared mobile viewport reserve that keeps shell chrome out of Android status bars, bottom gesture zones, and landscape side gesture zones.
_Avoid_: Device padding, notch padding, spacer.

**AcpDrawer**:
The 420px right-side slide-over (Cloudflare-overlay pattern) that hosts the live AI Assist session scoped to the current Step. Mobile becomes a bottom sheet.
_Avoid_: AI panel, chat panel, ACP panel, sidebar drawer, assistant pane.

**TaskQuickCreateTray**:
An inline Build-stage task creation surface that preserves board, backlog, table, or planning scope while showing required title, sprint, module, cycle, recurrence preview, validation, duplicate prevention, and retry state.
_Avoid_: task create modal, hidden project scope, create dialog, cleared draft on failure.

**DocVersionReview**:
The document history surface that combines selectable revisions, labelled inline diff, restore confirmation, visible comment thread states, backlinks with source context, and planning conversion.
_Avoid_: one-click restore, color-only diff, hidden comments icon, backlinks without source.

**CommandPalette**:
The `⌘K` modeless palette that resolves Scope-aware actions (recent, stage nav, step actions, federated search, settings search, workspace/theme, help).
_Avoid_: Quick-open, search bar, launcher, omnibar.

**TraceBadge**:
The copyable monospace pill (10-char prefix + ellipsis + copy icon) that surfaces the active trace id on every primary surface and hyperlinks to `/<ws>/trace/<id>`.
_Avoid_: Trace pill, trace label, run id badge.

**ModeAffordance**:
The inline `[▶ Play] [💬 Discuss] [⊞ Drawer] [⋮ More]` row attached to every Step header that switches between manual / Play / Discuss / AI Assist execution modes.
_Avoid_: Mode buttons, action row, agent buttons.

**StagePeek**:
The overlay used to open any entity by id (`/<ws>/browse/<id>`) without leaving the current Stage — surfaces a Step's detail without losing list/board context.
_Avoid_: Modal, preview, sidebar peek, detail flyout.

**WorkspaceSwitcher**:
The popover next to the brand mark that switches between Workspaces and exposes `+ New workspace`; portfolio surfaces hang off the same scope root.
_Avoid_: Org switcher, account dropdown, team picker.

**Workbench**:
A Stage-specific dense layout (Plan tripane, Build board/list/table/calendar/gantt/graph, Review diff workbench, Ship artifacts list, Operate doctor table). Every Workbench is a render of service data, never a holder of it.
_Avoid_: Page, screen, dashboard, view (when referring to the Stage-specific layout).

**PortfolioSurface**:
A workspace-scope route with no active Project — Dashboard, Projects list, Global Docs, Search, Memory, Inbox.
_Avoid_: Home, overview, global page.

**OnboardingFlow**:
The first-run boot path: user signup → email verification → workspace name/slug reservation → first project prompt → Capture editor with cursor on blank doc, plus the two coachmarks (first Play, first TraceBadge pulse). Not a tutorial overlay system.
_Avoid_: Tour, walkthrough, getting started, wizard.

## Relationships

- A **Workspace** contains many **Projects**; a **Project** is the parent of every Stage URL `/<ws>/projects/<projId>/<stage>`.
- The **StageRail** surfaces six **WorkflowStages**; clicking one navigates to that Stage's default **Workbench**.
- The **ScopeBar** owns the **WorkspaceSwitcher**, the stage tab strip (mirrors StageRail), and the **TraceBadge**; it sets the active **Scope**.
- A **Workbench** renders many **Steps**; each **Step** carries one **ModeAffordance** row.
- A **ModeAffordance**'s `⊞ Drawer` button opens the **AcpDrawer** auto-scoped to the current **Step** + **Trace**.
- The **CommandPalette** resolves **Scope**-aware actions; its result set changes when **Scope** changes.
- The **StatusFooter**'s right-most segment also opens the **AcpDrawer** (`⌘/` from anywhere); both entry points share one drawer instance.
- **AndroidSafeArea** reserves wrap mobile shell chrome; **StatusFooter**, mobile bottom navigation, and sheets render above gesture zones.
- The **TraceBadge** appears in **ScopeBar**, **StatusFooter**, **AcpDrawer** header, every error inline, every audit row — same id, four surfaces.
- A **PortfolioSurface** has no Project Scope; the **StageRail** collapses or swaps to portfolio nav when active.
- The **OnboardingFlow** starts at `/onboarding`, keeps one trace through signup and workspace setup, then terminates at the Capture **Workbench**; subsequent sessions never re-enter it.
- Every **Workbench**, **AcpDrawer** action, and **CommandPalette** entry calls a service (tRPC client → NestJS service in `services/**`); this app holds no domain state beyond ephemeral UI state in `$lib/stores`.

## Example dialogue

> **Dev:** "When the user clicks `▶ Play` on a Build task, does the **Workbench** dispatch the agent run directly?"
> **Domain expert:** "No — the **ModeAffordance** calls `work-management.runs.start` via tRPC. The **Workbench** only renders the streamed `agent_message_chunk` events the **AcpDrawer** also subscribes to. Both share the active **Scope** so the **TraceBadge** stays identical."
> **Dev:** "And if the user switches Workspaces mid-stream?"
> **Domain expert:** "The **WorkspaceSwitcher** clears the **Scope**, which pauses the **AcpDrawer** session (does not abort it). The run keeps streaming server-side. Returning to the original **Scope** reopens the **AcpDrawer** with thread history intact."

## Flagged ambiguities

- "Stage" vs "Page" vs "Route" — resolved: **WorkflowStage** is a navigation segment (one of six); "page" is not used; "route" is the SvelteKit URL implementing a Stage's **Workbench**. The Stage owns the conceptual surface, the route is the URL that renders it.
- "Scope" vs "Project" vs "Workspace" — resolved: **Workspace** is the top organizational container, **Project** is one level down, **Scope** is the live `(workspace, project, stage, step, trace)` tuple the chrome currently binds to. Project is a noun; Scope is the runtime selection.
- "Drawer" vs "Panel" vs "Sheet" — resolved: **AcpDrawer** is the right-side AI Assist overlay on web (bottom sheet on mobile). "Panel" is reserved for embedded Workbench panes (e.g. Plan tripane). Sheets are bottom-anchored modals on mobile only.
- "ACP" vs "AI Assist" — resolved: the user-visible name is always **AcpDrawer** in code / "AI Assist" in copy. ACP (Agent Client Protocol) is one transport; the drawer is protocol-agnostic and must never expose protocol names in chrome.
- "Sidebar" — banned as a term: the left rail is **StageRail**, the right overlay is **AcpDrawer**, embedded rails inside a Workbench are panes.
- "Dashboard" vs "Home" vs "Workspace home" — resolved: **PortfolioSurface** is the umbrella; the specific landing at `/<ws>/dashboard` is the Dashboard surface. "Home" is not a term.
- "Mode" (UI mode) vs "Mode" (vim-style NORMAL/INSERT in **StatusFooter**) — resolved: **ModeAffordance** refers to manual / Play / Discuss / AI Assist execution mode; the **StatusFooter** mode pill is the input mode (NORMAL/INSERT/FILTER/COMMAND) inherited from the TUI. Two unrelated concepts; never conflated.
- "Step" vs "Task" vs "Item" — resolved: **Step** is the universal mode-bearing unit across every Stage. A Build Task is one Step type; a Capture Doc is another Step type. "Item" is avoided; "task" is reserved for Build-stage tasks only.
