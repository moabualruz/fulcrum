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

**Checkpoint**:
An AI Assist recovery point shown in the workbench timeline with kind, label, turn index, created time, and current marker.
_Avoid_: save point, restore blob, protocol checkpoint.

**Restore**:
The inline action that resumes the newest checkpoint in the current AI Assist session.
_Avoid_: rewind, rollback, reset.

**Fork**:
The confirmation-gated action that starts a new AI Assist session from an older checkpoint.
_Avoid_: clone chat, duplicate ACP session.

**Abort Reason**:
The required `user-cancel`, `dangerous-output`, `wrong-context`, or `cost-cap` value plus note captured before stopping active AI Assist work.
_Avoid_: cancel reason, stop note without enum.

**Pause Queue**:
The visible count of prompts waiting while AI Assist is paused; resume drains the queue through live session state.
_Avoid_: hidden backlog, pending chat count.

**AiAssistSettingsRoute**:
The `/settings/ai-assist` route that edits checkpoint mode, checkpoint retention, and event transport while showing session > user > org > built-in resolution.
_Avoid_: ACP settings page, hidden preference editor, protocol config.

**SettingsSystemSurface**:
The workspace-scoped `/settings` surface matching OD `settings.html` — a sticky section-nav rail plus nine stacked panels (General, Appearance, Keyboard, Privacy & safety, AI agents, Default routes, Integrations, Account, Danger zone) with a settings search filter, tight mode affordance per panel, segmented and toggle safe-edit controls, and confirm-gated danger actions. The pre-existing `/settings/*` sub-routes (theme, routing, connectors, api, flags, secrets) stay reachable as deep links from the panels — no feature loss.
_Avoid_: settings dashboard, runtime control plane, settings card grid, preferences page.

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

**TypeRole**:
The DESIGN.md §2 semantic web typography roles: `type-display`, `type-h1`, `type-h2`, `type-h3`, `type-body`, `type-caption`, and `type-code`. These map to the Tailwind v4 text tokens in `apps/web/src/app.css` and are the only source of truth for font size, line-height, weight, font family, and zero letter spacing in OD-referenced surfaces.
_Avoid_: raw heading utilities (`text-lg`, `text-xl`, `text-2xl`) used as hierarchy in new Workbench or shell code.

**MotionContract**:
The DESIGN.md §5 timing and easing budget for state-change motion: drawer slide 200ms, modal scale/opacity 180ms, toast slide-in 180ms, run-feed line entry 120ms, tool-call expansion 150ms, and permission prompt slide-in 200ms. It is positive-motion proof, separate from the reduced-motion collapse in DESIGN.md §1.6; it bans decorative loops, bounce, parallax, and autoplay as communication-free motion.
_Avoid_: animation polish, decorative motion, page-load choreography, bounce, parallax.

**StagePeek**:
The overlay used to open any entity by id (`/<ws>/browse/<id>`) without leaving the current Stage — surfaces a Step's detail without losing list/board context.
_Avoid_: Modal, preview, sidebar peek, detail flyout.

**WorkspaceSwitcher**:
The popover next to the brand mark that switches between Workspaces and exposes `+ New workspace`; portfolio surfaces hang off the same scope root.
_Avoid_: Org switcher, account dropdown, team picker.

**Workbench**:
A Stage-specific dense layout (Plan tripane, Build board/list/table/calendar/gantt/graph, Review diff workbench, Ship artifacts list, Operate doctor table). Every Workbench is a render of service data, never a holder of it.
_Avoid_: Page, screen, dashboard, view (when referring to the Stage-specific layout).

**BuildTimelineWorkbench**:
The Build-stage 14-day Gantt Workbench — one lane per work item, a day-header row with the current day highlighted, a positioned status-colored bar per lane, a current-day `.now` line, and a status legend. The user-facing layout name is **Timeline**; the canonical route segment is `gantt` (`/<ws>/projects/<projId>/build/gantt`). The web Gantt mirrors the TUI `:timeline` screen (`apps/tui/src/screens/task-timeline.ts`) data shape so the two surfaces stay in parity.
_Avoid_: Roadmap, schedule view, calendar (Calendar is a separate Build layout).

**PortfolioSurface**:
A workspace-scope route with no active Project — Dashboard, Projects list, Global Docs, Search, Memory, Inbox.
_Avoid_: Home, overview, global page.

**OnboardingFlow**:
The first-run boot path at `/onboarding`, rendered to the OD `onboarding.html` design (DESIGN.md §11, COPY.md §7). Three phases, no multi-step wizard: a single workspace-name field → a one-sentence project prompt → the Capture-stage doc surface. The Capture phase is the OD `onboarding.html` state itself — a `.doc` body with a `.scrim` dimming everything except one lit `.anchor` block, the **first-run coachmark** (the one-time `▶ Play` teaching popover with a 5-dot indicator, Skip-tour and Got-it actions), and the **first TraceBadge pulse** (the first trace ID surfaces and pulses once). The `.anchor` carries the universal four-mode **ModeAffordance** row; first `▶ Play` dismisses the coachmark + scrim and hands off to Plan. Honors DESIGN.md §12 anti-references — no hero illustration, no persistent welcome banner. Not a tutorial overlay system; subsequent sessions never re-enter it.
_Avoid_: Tour, walkthrough, getting started, wizard, signup stepper.

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
- Every **Workbench**, **StageRail**, **ScopeBar**, **StatusFooter**, **TraceBadge**, and **AcpDrawer** renders hierarchy through **TypeRole** tokens so dense operator screens preserve the OD type scale across desktop, mobile, and forced-colors modes.
- A **PortfolioSurface** has no Project Scope; the **StageRail** collapses or swaps to portfolio nav when active.
- The **OnboardingFlow** starts at `/onboarding`, keeps one trace through workspace + project setup into the Capture surface, where the first-run **coachmark** teaches the first `▶ Play` and the first TraceBadge pulse fires once; subsequent sessions never re-enter it.
- The **MotionContract** applies to every **AcpDrawer**, modal/dialog, toast, run-feed entry, tool-call expansion, and permission prompt; **AcpDrawer** still collapses through the global reduced-motion guard, but normal motion must remain inside the positive OD duration budget.
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
- "Timeline" vs "Gantt" — resolved: they name the same Build layout from two angles. **Timeline** is the user-facing layout name in the Build view switcher (OD `build-timeline.html`, TUI `:timeline` screen); `gantt` is the canonical route segment (`IA-MAP.md §2.3` — `/<ws>/projects/<projId>/build/gantt`). The Workbench that renders it is the **BuildTimelineWorkbench**. The route folder `build-timeline` keeps its name (it is the pre-canonical-routing flat preview path, mapped to the `build` stage in `route-map.ts`); the canonical project-scoped URL uses `gantt`. Not to be confused with **DocVersionReview** — the document-history "version timeline" — which is a Capture/docs surface and was the content this route previously rendered before `prd-cross-mislabeled-route-content-migration` re-homed it to `/docs`.
- "Heading size" vs "component size" — resolved: **TypeRole** owns hierarchy (`type-h1`, `type-h2`, etc.). Component-local sizing utilities such as `text-sm` or `text-xs` are acceptable inside mature ui-kit primitives, but new OD-referenced Workbench and shell slices must not use raw `text-lg` / `text-xl` / `text-2xl` as page hierarchy.
