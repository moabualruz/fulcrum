# 07 — Copy-First Parity Audit (Plane · Docmost · Fusion · Plannotator · ACP-UI)

> Deep parity research for the Fulcrum UX redesign across the five upstream codebases cloned locally under
> `/Users/mkh/workspace/fulcrum/.scratch/upstream-product-replacement/repos/`. Every feature is annotated with
> what it is, how the upstream implements it (route / shortcut / component), a citation (local path or upstream URL),
> a Fulcrum adoption verdict (verbatim / modified / rejected), and a workflow-stage placement
> (Capture / Plan / Build / Review / Ship / Operate). Ends with a master adoption table and a Top-30 copy list.

---

## 1. Plane — `/Users/mkh/workspace/fulcrum/.scratch/upstream-product-replacement/repos/plane/`

Plane is "modern project management for all teams" — workspaces, projects, cycles, modules, work items, multi-layout
views, intake, pages, analytics ([README L40-L74](repos/plane/README.md); `https://plane.so/`,
`https://docs.plane.so/`). Built on React Router (`apps/web/app/routes.ts`), Django, MobX/observer stores, with a
hard AGPL-3.0 boundary across every file we audited (e.g. `apps/web/core/components/power-k/global-shortcuts.tsx`
copyright header).

### 1.1 Information architecture

- **Workspace-scoped URL slug.** Every route is mounted under `apps/web/app/(all)/[workspaceSlug]/…`; route groups
  partition the app into `(projects)` (work surfaces) and `(settings)` (governance). The slug becomes the IA scope
  indicator. Adopt **verbatim** at Capture/Plan/Operate: Fulcrum already prefers `/<workspaceSlug>/…` and this
  pattern survives multi-tenant + multi-repo cleanly. Citation: `apps/web/app/routes/core.ts`,
  `apps/web/app/(all)/[workspaceSlug]/(projects)/layout.tsx`.
- **Two-tier sidebar.** A primary sidebar (`_sidebar.tsx`, `sidebar.tsx`) lists workspace-level pivots (Home,
  Inbox/Notifications, Projects, Workspace Views, Active Cycles, Analytics, Drafts, Stickies). An
  **extended/secondary sidebar** (`extended-sidebar.tsx`, `extended-project-sidebar.tsx`) opens on hover/click of a
  project row and shows the project's Issues / Cycles / Modules / Views / Pages / Intake. Adopt **modified** at
  Plan: Fulcrum collapses to a single sidebar today; the extended-sidebar pattern fixes the "where am I in this
  project?" problem without the giant nested tree Linear uses. Citation:
  `apps/web/app/(all)/[workspaceSlug]/(projects)/extended-sidebar.tsx`.
- **Top "Power-K" command bar.** `apps/web/core/components/navigation/top-nav-power-k.tsx` mounts a global ⌘K bar
  that is context-aware: `core/context-detector.ts` reads the route params to decide which command set is active
  (workspace, project, cycle, module, view, members, labels, settings). Adopt **verbatim** at Capture/Plan/Build/
  Review/Ship/Operate — this is the single most leveraged primitive Plane has. Citation:
  `apps/web/core/components/power-k/core/context-detector.ts`,
  `apps/web/core/components/power-k/projects-app-provider.tsx`.

### 1.2 Hierarchy + primary surfaces

The deep route tree (from `apps/web/app/(all)/[workspaceSlug]/(projects)/projects/(detail)/[projectId]/…`) gives
the canonical product shape:

```
/[ws]/projects                     list
/[ws]/projects/(detail)/[id]       project home
/[ws]/projects/(detail)/[id]/cycles/(list|detail)
/[ws]/projects/(detail)/[id]/modules/(list|detail)
/[ws]/projects/(detail)/[id]/views/(list|detail)
/[ws]/projects/(detail)/[id]/issues/(list|detail)
/[ws]/projects/(detail)/[id]/pages/(list|detail)
/[ws]/projects/(detail)/[id]/intake
/[ws]/projects/(detail)/[id]/archives/(issues|cycles|modules)
/[ws]/workspace-views/[globalViewId]
/[ws]/active-cycles
/[ws]/analytics/[tabId]
/[ws]/browse/[workItem]            global work-item peek
/[ws]/drafts                       personal drafts
/[ws]/stickies                     personal notes
/[ws]/profile/[userId]/[profileViewId]
```

Adopt **modified** at Plan/Build: keep workspace ↔ project ↔ {cycles, modules, views, issues, pages, intake,
archives}. Rename "issues" → Fulcrum "work items / tasks" (Fulcrum is repo+task-centric, not bug-tracker). Drop
"stickies" (out of scope for foundation). Citation: list above is the literal `find` output of
`apps/web/app/(all)/[workspaceSlug]/(projects)`.

### 1.3 View types and density

Plane ships five **issue layouts** for every issue collection (project view, cycle view, module view, saved view,
workspace view): `apps/web/core/components/issues/issue-layouts/{kanban,list,spreadsheet,gantt,calendar}`. Each
layout has its own `roots/`, `filters/`, `quick-add/`, `empty-states/`, and `quick-action-dropdowns/`. Plane also
exposes a **bulk-operations** harness (`issue-layouts/.../bulk-operations`) and a **peek-overview** modal
(`peek-overview/`) so any layout can launch the same issue detail without a route change. Adopt **verbatim** at
Plan/Build/Review: Fulcrum's task surfaces today only have list+board; spreadsheet/gantt/calendar are required for
parity with Jira/Linear/Plane. Peek-overview is the "open detail without losing context" pattern Fulcrum's
multi-repo board needs.

### 1.4 Cycles, modules, work items, dependencies

- **Cycles** = time-boxed sprints; live under `projects/[id]/cycles` with their own list+detail. Active cycle has
  a workspace-level `/active-cycles` pivot. Adopt **modified** at Plan/Ship: Fulcrum's "release window" maps here.
- **Modules** = scope/epic grouping orthogonal to cycle (`projects/[id]/modules`). Adopt **verbatim** at Plan.
- **Sub-issues + parent + dependencies + relations** = `issues/issue-detail-widgets/{sub-issues,relations,links,
  attachments}` — first-class IA, not a hidden link field. Adopt **verbatim** at Plan/Build.
- **Intake** = inbound triage queue (`projects/[id]/intake`) where unsorted issues land. Adopt **modified** at
  Capture (Fulcrum's "inbox" should look like this — single column, snooze/accept/decline, source attribution).

### 1.5 Settings panels

`apps/web/app/(all)/[workspaceSlug]/(settings)/settings/…` has a clean two-level split:

- **Workspace settings**: general, members, integrations, webhooks, exports, billing
  (`(workspace)/{members,integrations,webhooks,exports,billing}`).
- **Project settings**: per-project at `settings/projects/[projectId]/{labels,states,estimates,members,
  automations,features}` with a feature-flag panel `features/{cycles,intake,modules,views,pages}` that lets each
  project turn the corresponding pivot on/off. Adopt **verbatim** at Operate — Fulcrum lacks this granularity and
  it's the cheapest win in the audit.

### 1.6 Power-K shortcut model

`apps/web/core/components/power-k/` is a self-contained command-palette + global-shortcut subsystem:

- `core/registry.ts` — registry of `TPowerKCommandConfig`.
- `core/context-detector.ts` — derives `TPowerKContext` from URL params; commands declare which contexts they
  appear in.
- `core/shortcut-handler.ts` — global `keydown` listener.
- `config/{commands,account-commands,preferences-commands,help-commands,miscellaneous-commands}.ts` — per-group
  command sets.
- `menus/{settings,projects,workspaces,cycles,views,members,modules,labels,empty-state,builder}.tsx` — per-context
  drill-down menus inside the palette. So ⌘K is not a flat search; it is a stateful palette with stacks. Adopt
  **verbatim** at every stage. This is the single largest UX-leverage win in the entire audit.

### 1.7 Saved views

Two scopes: **project views** (`projects/[id]/views/(list|detail)/[viewId]`) and **workspace views**
(`workspace-views/[globalViewId]`). The latter is a saved, shareable cross-project query — Linear-style. Adopt
**verbatim** at Plan/Review. Citation: `apps/web/app/(all)/[workspaceSlug]/(projects)/workspace-views/[globalViewId]/page.tsx`.

### 1.8 Pages

`projects/[id]/pages` — TipTap-style rich text pages with AI capabilities (README L66-L70). Sub-route detail at
`pages/(detail)/[pageId]`. Adopt **rejected** for Fulcrum at the page-tree level (Docmost is a better source —
see §2); adopt the integration **modified**: a project should be able to attach pages, but pages live in Docmost
mode, not Plane mode.

### 1.9 Anti-patterns / rejected

- **MobX everywhere.** `observer`, store hooks, side-effects in components — Fulcrum is moving to TanStack Query +
  signals/Svelte stores. **Rejected** wholesale.
- **AGPL contamination.** Every audited file (e.g. `global-shortcuts.tsx` L1-L5) bears the AGPL header; Fulcrum
  cannot copy code verbatim — only the IA + interaction model.
- **No CLI/TUI surface.** Plane is web-only; Fulcrum has CLI/TUI/web — IA must read in a terminal.
- **Heavy modal stacks.** Issue create, view create, cycle create all open as nested modals; Linear's inline-detail
  pattern is better. **Rejected.**
- **Workspace-vs-project mode-switch ambiguity.** Power-K context-detector has a `workspace`/`project` split that
  occasionally surfaces the wrong menu when the URL is `/browse/[workItem]` — copy the detector but add a
  "scope chip" in the palette header so the active context is explicit.

---

## 2. Docmost — `/Users/mkh/workspace/fulcrum/.scratch/upstream-product-replacement/repos/docmost/`

Docmost is "open-source collaborative wiki and documentation software" — Notion-clone with TipTap editor, spaces,
permissions, real-time, comments, page history, drawio/excalidraw/mermaid (README L18-L30; `https://docmost.com/docs`).
AGPL-3.0 core + commercial EE under `apps/client/src/ee/**`.

### 2.1 Workspace / spaces / page tree

Two-level hierarchy: **Workspace → Spaces → Pages (tree)**. Routes from `apps/client/src/pages/`:

```
/dashboard/home
/spaces                                page tree per space, lazy-expanded
/space/space-home, space/space-trash
/page/page.tsx, page-redirect
/share/shared-page, share-redirect
/favorites/favorites-page
/label/label-page
/settings/workspace/{workspace-settings,workspace-members}
/settings/account/{account-settings,account-preferences}
/settings/group/{groups,group-info}
/settings/space/spaces
/settings/shares/shares
```

Page tree is implemented in `apps/client/src/features/page/tree/` with its own atoms/hooks/styles/components/utils
— infinite-depth, drag-reorder, lazy children. Adopt **verbatim** at Plan: Fulcrum docs/memory needs this tree.

### 2.2 Rich editor

`apps/client/src/features/editor/page-editor.tsx` + `packages/editor-ext/src/lib/` extensions:
`drawio`, `excalidraw`, `mermaid` (via `embed.ts` + `embed-provider.ts`), `mention`, `status`, `highlight`,
`indent`, `link`, `selection`, `resizable-nodeview`, `trailing-node`. Slash-menu lives at
`features/editor/components/slash-menu/command-list.tsx`; per-node menus for `video`, `pdf`, `excalidraw`,
`subpages`, `image`, `callout`, `audio`, `drawio`. Adopt **verbatim** at Plan/Build/Review: this is the spec/PRD/
runbook surface for Fulcrum.

### 2.3 Slash menu + mentions + attachments

Slash-menu is keyboard-first (typed `/`), each command lives in `features/editor/components/slash-menu/`. Mentions
come from `editor-ext/src/lib/mention.ts` plus `features/comment/` and `features/user/`. Adopt **verbatim** at every
stage that has a doc surface.

### 2.4 Page history / sharing / export

`features/page-history/` exposes a per-page timeline; `pages/share/shared-page.tsx` renders a public read-only
view; `ee/pdf-export/`, `ee/page-permission/`, `ee/page-verification/` extend to enterprise sharing. Adopt **modified**:
shared page (encrypted-link Docmost style) is **rejected** in favor of plannotator's zero-knowledge URL-hash
sharing (see §4.4); page-history adoption is **verbatim**.

### 2.5 Search

Algolia-backed (README L62) plus full-text fallback. Adopt **modified**: keep deterministic full-text — per
project rule "Documentation retrieval deterministic by default" — drop Algolia, use SQLite FTS5 or pgvector-free
Postgres FTS.

### 2.6 Comments, real-time, websocket

`features/comment/`, `features/websocket/`, `apps/client/src/components/layouts/global/global-app-shell.tsx`
(top-menu, aside, sidebar, header all separate files). Yjs/Hocuspocus for real-time. Adopt **modified**: real-time
comments **verbatim** at Review; full Yjs co-editing **rejected** for foundation (too heavy).

### 2.7 Settings + groups + permissions

`apps/client/src/pages/settings/` covers workspace, account, group, space, shares. `features/group/` models groups
distinct from members — needed for fine-grained doc ACL. Adopt **verbatim** at Operate. EE has SCIM, MFA,
audit, billing, AI chat — adopt the **shape** (routes, sidebar entries) **modified**: implement only what
Fulcrum's local-first license allows.

### 2.8 AI / agent surfaces

`apps/client/src/ee/ai-chat/` and `ee/ai/` host an AI chat sidebar over the current page. Adopt **modified** at
Plan/Build/Review: implement as a tRPC-driven side panel that targets the active page/task context, not a separate
"AI" tab.

### 2.9 Anti-patterns / rejected

- **EE folder split** — production code under `apps/client/src/ee/**` co-located but license-fenced; **rejected**
  for Fulcrum (single OSS license).
- **NestJS server already** — Docmost matches Fulcrum's NestJS+TypeORM target (AGENTS.md "Single NestJS/TypeORM
  server target"), so the **server structure under `apps/server/`** is a copy candidate. Adopt **verbatim** the
  module shape; replace class-validator with Zod per Fulcrum rule.

---

## 3. Fusion — `/Users/mkh/workspace/fulcrum/.scratch/upstream-product-replacement/repos/fusion/`

Fusion is a multi-node AI agent orchestrator: "From rough idea to production code — automatically"
(README L9-L40; `https://runfusion.ai`). Packages: `@fusion/core` (domain + SQLite), `@fusion/engine` (scheduler,
planning, executor, merger, recovery), `@fusion/dashboard` (Express API + React SPA), `@runfusion/fusion` (CLI +
TUI), `@fusion/desktop` (Electron), `@fusion/mobile` (Capacitor + PWA), `@fusion/plugin-sdk`. MIT-licensed.

### 3.1 Lifecycle + board

Fusion's spine is a task lifecycle: `planning → todo → in-progress → in-review → done → archived` (`docs/
architecture.md` L13). The **Board view** (`packages/dashboard/app/components/Board.tsx`,
`Column.tsx`) is a kanban with drag-and-drop between lifecycle columns; column visibility controls; inline quick
entry; live PR/issue badges; agent-created provenance badges; deterministic column ordering rules per column
(`docs/dashboard-guide.md` "Column ordering semantics" — `todo` mirrors scheduler pickup order, `done` ordered by
most recent completion). Adopt **verbatim** at Plan/Build/Review/Ship — this is the answer to "what does a task
look like across its life?" in Fulcrum.

### 3.2 List, Graph, Chat

- **List view** — sectioned table grouped by lifecycle column, sortable, bulk selection + bulk delete with
  dependency-conflict force-delete confirmation (`docs/dashboard-guide.md` "List View"). Adopt **verbatim**.
- **Graph view** — Sugiyama layered auto-layout of task dependencies; reuses same `TaskCard` UI as board/list;
  drag-reposition with 4px movement threshold; persists positions per project in `localStorage` key
  `kb:${projectId}:fusion-plugin-dependency-graph:positions`; keyboard zoom (`Ctrl/Cmd+=`, `Ctrl/Cmd+-`, `Ctrl/Cmd+0`,
  `Ctrl/Cmd+Shift+F`, `Escape`); upstream/downstream chain highlight (`docs/dashboard-guide.md` "Graph View").
  Adopt **verbatim** at Plan/Build — Fulcrum cross-task/cross-repo dependencies need exactly this picture.
- **Chat view** — project-scoped conversations with agents; `/new` and `/clear` reset thread; durable in-flight
  message replay across refresh; mailbox tools (`fn_send_message`, `fn_read_messages`) when engine MessageStore
  available; **Chat Rooms** (multi-agent group rooms) gated behind experimental flag (`docs/dashboard-guide.md`
  "Chat View" / "Chat Rooms"). Adopt **modified** at Build/Operate.

### 3.3 Missions (hierarchical planning)

`Mission → Milestone → Slice → Feature → Task` (`docs/missions.md` L9-L25). Auto-generated assertions from
`acceptanceCriteria` → `feature.description` → fallback. Slice activation gates execution. Autopilot rolls progress
up. CLI parity: `fn mission create/list/show/activate-slice/delete`. Adopt **modified** at Plan: rename Slice →
"Wave" (Fulcrum project term) and Feature → "Increment"; otherwise verbatim.

### 3.4 Worktree isolation + smart merge

"Each task runs in its own branch and worktree (`fusion/{task-id}`). Parallel tasks. Zero conflicts."
(README L62-L66). Plan → Review → Execute → Review per step. Adopt **verbatim** at Build/Review — Fulcrum's
multi-agent execution needs this exact pattern; the CLI naming `fulcrum/{task-id}` is a free win.

### 3.5 Multi-node mesh + deep links

Canonical shell-host bootstrap at `packages/dashboard/app/shell-host.ts` with a discriminated union over
`{ kind: "browser" | "desktop-shell" | "mobile-shell" }` — same SPA, three native shells (`docs/architecture.md`
L33-L75). Deep links: `/tasks/<TASK_ID>` (legacy) → `/?task=<TASK_ID>` (canonical) with HTTP 301 redirect and
`history.replaceState` normalization (`docs/dashboard-guide.md` "Deep Links"). Adopt **verbatim** at Operate —
this is the multi-platform strategy Fulcrum already wants.

### 3.6 Plugin SDK

`@fusion/plugin-sdk` with 14 in-tree plugins (`plugins/fusion-plugin-*` — `agent-browser`,
`cli-printing-press`, `cursor-runtime`, `dependency-graph`, `droid-runtime`, `even-cards`,
`even-realities-glasses`, `hermes-runtime`, `openclaw-runtime`, `paperclip-runtime`, `reports`, `roadmap`,
`whatsapp-chat`). Adopt **modified** at Operate: Fulcrum's MCP registry + skills layer fills the same niche;
copy the **plugin-slot pattern** (`PluginSlot.tsx`) for surface extension points.

### 3.7 Agent identity, telemetry, cost meter

`AgentAvatar`, `AgentDetailView`, `AgentEmptyState`, `AgentErrorDetailsModal`, `AgentLogViewer`,
`AgentMentionPopup`, `AgentMetricsBar`, `AgentPromptsManager`, `AgentReflectionsTab`, `AgentRunHistory`,
`AgentTokenStatsPanel`, `AgentsOverviewBar`, `AgentsView` (`packages/dashboard/app/components/`). Adopt
**verbatim** at Operate: Fulcrum lacks an agents panel; this is a drop-in replacement spec.

### 3.8 Anti-patterns / rejected

- **Express, not NestJS.** Fulcrum target is NestJS/TypeORM; **rejected** the Express server. Keep the React
  components + SPA, port the API.
- **SQLite-only persistence.** Fulcrum is Postgres-first; **rejected**.
- **Component CSS sidecars** (`*.css` next to `*.tsx`). Fulcrum is migrating to shadcn-svelte; **rejected** —
  rewrite components against shadcn-svelte tokens.
- **440+ "agent company" presets** — interesting demo but not core; **rejected** for foundation.

---

## 4. Plannotator — `/Users/mkh/workspace/fulcrum/.scratch/upstream-product-replacement/repos/plannotator/`

Plannotator is "Interactive Plan & Code Review for AI Coding Agents" — annotate plans/specs/folders/files/URLs,
send feedback to agents; built-in plan-diff; PR review with annotations + agent code reviews
(README L1-L40; `https://plannotator.ai`). Apache-2.0 + MIT dual-license. Apps: `codex`, `copilot`, `gemini`,
`hook`, `marketing`, `opencode-plugin`, `paste-service`, `pi-extension`, `portal`, `review`, `skills`,
`vscode-extension`. Packages: `editor`, `review-editor`, `ai`, `server`, `shared`, `ui`.

### 4.1 Plan editor

`packages/editor/App.tsx` (entry), `demoPlan.ts` + `demoPlanDiffDemo.ts` (showcase data),
`shortcuts.ts` declaring the `plan-editor` scope. Shortcut set:

```
Mod+Enter   Approve / Send feedback   (approves with no annotations, sends feedback otherwise)
Mod+S       Save to notes app         (falls back to Export)
Escape      Close diff view
Mod+P       Print
```

Adopt **verbatim** at Plan/Review — the `Mod+Enter` "approve OR send-feedback" overload is the single sharpest
agent-loop interaction in any of the five sources.

### 4.2 Review editor + diff viewer

`packages/review-editor/` is a complete spec-grade PR review surface in 40 components:
`AgentReviewActions`, `AIConfigBar`, `AITab`, `AllFilesDiffView`, `AnnotationToolbar`, `AskAIInput`,
`BaseBranchPicker`, `ConventionalLabelPicker`, `DiffHunkPreview`, `DiffOptionsPopover`, `DiffTypePicker`,
`DiffViewer`, `EvoLogPicker`, `FileHeader`, `FileTree`, `FileTreeNode`, `HighlightedCode`, `InlineAIMarker`,
`InlineAnnotation`, `LazyFileDiff`, `LiveLogViewer`, `PermissionCard`, `PRChecksTab`, `PRCommentsTab`,
`PRSelector`, `PRSummaryTab`, `PRSwitchOverlay`, `ReviewHeaderMenu`, `ReviewSidebar`, `ReviewSubmissionDialog`,
`SparklesIcon`, `StackedPRLabel`, `SuggestionBlock`, `SuggestionDiff`, `SuggestionModal`, `ToolbarHost`,
`WorktreePicker`. Adopt **verbatim** at Review — this is the entire review surface Fulcrum needs.

Shortcut set (`packages/review-editor/shortcuts.ts`):

```
Mod+Enter        Approve / Send feedback
Mod+F            Focus search
Enter / F3       Next search match
Shift+Enter      Prev search match
Escape           Clear search / close panel
Alt Alt          Toggle review destination (double-tap; switches platform↔agent)
Mod+B            Toggle file tree
Mod+.            Toggle review sidebar
Mod+Shift+T      Toggle demo tour (dev builds only)
V                Toggle file viewed (single-key, file-actions scope)
```

The **double-tap `Alt Alt`** binding is a novel pattern Fulcrum has not used — adopt **verbatim** at Review for
switching between "send to platform PR" and "send to local agent".

### 4.3 Annotation primitive (block types)

Annotations are top-level objects with `InlineAnnotation`, `AnnotationToolbar`, `EditorAnnotationCard`,
`AnnotationPanel`, `AnnotationSidebar`, `AnnotationToolstrip` (`packages/ui/components/`). Categories used in the
plan domain: tasks, prototypes, success-criteria, dependencies, verify-end-to-end (referenced in `demoPlan.ts`).
The annotation toolbar binds: image annotator shortcuts, comment-popover shortcuts, input-method shortcuts,
viewer shortcuts (`packages/editor/shortcuts.ts` L83-L92). Adopt **verbatim** at Plan/Review.

### 4.4 Sharing / zero-knowledge URL hash

"Small plans are encoded entirely in the URL hash. No server involved, nothing stored anywhere. Large plans use a
short link service with end-to-end encryption (AES-256-GCM). The server stores only ciphertext it cannot read.
The decryption key lives only in the URL you share. Pastes auto-delete after 7 days." (README L52-L60). Adopt
**verbatim** at Review/Ship — Fulcrum's plan-sharing UX should default to this zero-knowledge URL-hash pattern
rather than account-gated share links.

### 4.5 Agent integration matrix

Plannotator ships first-class adapters for Claude Code, Copilot CLI, Gemini CLI, OpenCode, Pi, Codex (`apps/codex`,
`apps/copilot`, `apps/gemini`, `apps/opencode-plugin`, `apps/pi-extension`). Distribution is via
`/plugin marketplace add backnotprop/plannotator` for Claude Code and per-agent installers for the rest. Adopt
**verbatim** at Capture/Build — matches Fulcrum's five-agent target exactly (`docs/agents.md`).

### 4.6 Dock (live log + tabs)

`packages/review-editor/dock/{JobLogsContext.tsx, ReviewDockTabRenderer.tsx, ReviewStateContext.tsx,
reviewPanelComponents.ts, reviewPanelTypes.ts, panels/*}` — a bottom dock with PR Comments, PR Checks, PR Summary,
Live Logs, Suggestions tabs. Adopt **modified** at Review/Ship: place dock as a resizable bottom pane in the Review
stage, not as a separate route.

### 4.7 Anti-patterns / rejected

- **React + custom shortcut registry.** The shortcut registry (`@plannotator/ui/shortcuts`,
  `createShortcutRegistry`, `defineShortcutScope`, `createShortcutScopeHook`, `createDoubleTapShortcutsHook`) is
  high-quality but React-specific. Adopt **modified**: port the **API shape** to Svelte 5 runes.
- **Two editor packages (`editor` + `review-editor`)** that share `@plannotator/ui` — clean separation, **verbatim**.

---

## 5. ACP-UI — `/Users/mkh/workspace/fulcrum/.scratch/upstream-product-replacement/repos/acp-ui/`

ACP-UI is a Vue 3 + Pinia + Tauri 2 + Capacitor client for the **Agent Client Protocol** (ACP), the open
JSON-RPC contract maintained by Zed for "any ACP-compatible agent" (README L7-L14;
`https://github.com/zed-industries/agent-client-protocol`, `https://agentclientprotocol.com`).

### 5.1 Surface components (the entire UI is 13 files)

`src/components/`:

```
AgentSelector.vue       agent picker
AuthMethodDialog.vue    pick auth method on connect
ChatView.vue            transcript + composer
CommandPalette.vue      ⌘K
EnvVarEditor.vue        per-agent env editor
ModelPicker.vue         model dropdown
ModePicker.vue          ask/code/architect mode switch
PermissionDialog.vue    approve/deny tool call (modal)
SessionList.vue         sidebar of saved sessions
SettingsView.vue        configuration view
StartupProgress.vue     phased download/install/build/start indicator
ToolCallCard.vue        per-tool-call card with status + diff
TrafficMonitor.vue      live JSON-RPC inspector
```

This is the bare minimum ACP client. Adopt **verbatim** at every stage — Fulcrum's agent run surface needs
**every** one of these 13 components, just rewritten in Svelte 5 + shadcn-svelte.

### 5.2 Session store (the canonical state shape)

`src/stores/session.ts` is a Pinia store with the **complete contract for an ACP session**: `savedSessions`,
`currentSession`, `messages`, `toolCalls` (Map), `isConnected`, `isLoading`, `isConnecting`, `isReconnecting`,
`error`, `pendingPermission`, `pendingAuthMethods`. Reconnect on foreground (`isReconnecting` is distinct from
`isConnecting` — "reconnects skip spawn/stderr-progress UI and just need a small 'Reconnecting…' indicator",
L52-L57). Adopt **verbatim** at Build/Operate — this is exactly the agent-run state machine Fulcrum needs.

### 5.3 Cross-platform ship matrix

Builds: Web (no install), Windows (.msi + .exe), macOS (Apple Silicon + Intel .dmg), Linux (.deb/.AppImage/.rpm
× x64/ARM64), Android (.apk), iOS (source build) — same Vue SPA wrapped in Tauri 2 for desktop and Capacitor for
mobile (README "Installation" + "Connecting from your phone or browser"). Adopt **modified** at Operate: pick
Tauri 2 (smaller bundle, native sidecar) for Fulcrum's desktop ship over Electron (Fusion).

### 5.4 Permission prompt model

`PermissionDialog.vue`:

```
emit('select', optionId)   // approve with a specific option
emit('cancel')             // deny / dismiss
```

The dialog shows each `PermissionRequest.option` as a button; pressing Cancel cancels the agent's request. Adopt
**verbatim** at Build/Review — this is the **only** correct model for agent-tool consent (Fulcrum currently
defaults to YOLO).

### 5.5 Tool-call card

`ToolCallCard.vue` switches on `props.toolCall.status` and `props.toolCall.kind` for rendering. Statuses include
running/completed/failed; kinds include file diffs, shell commands, web requests, etc. Adopt **verbatim**.

### 5.6 Traffic monitor

`TrafficMonitor.vue` is a live JSON-RPC inspector pane — every inbound/outbound message in the ACP stream,
filterable, expandable. Adopt **verbatim** at Operate — Fulcrum has zero protocol-level debug UI today; this is
the cheapest debug-experience win available.

### 5.7 Startup progress (phased)

`StartupProgress.vue` + `detectPhase()` in `session.ts` parses agent stderr for `download / fetch / get`, `install
/ added / packages`, `build / compil`, `start / spawn` and surfaces a phased progress indicator. Adopt
**verbatim** at Build — Fulcrum's "starting agent…" today is opaque; this fixes it in 30 lines.

### 5.8 Idle keep-alive + foreground reconnect

"Sends a JSON-RPC `$/ping` heartbeat every 25 seconds so NAT/proxy idle timeouts don't drop your WebSocket"
(README L36-L37). Foreground reconnect on mobile + web (L33-L35). Adopt **verbatim** at Operate.

### 5.9 Anti-patterns / rejected

- **Algolia/Application Insights telemetry** (`@microsoft/applicationinsights-web` dep) — Fulcrum is local-first;
  **rejected**.
- **Vue 3 + Pinia.** Fulcrum is Svelte 5; port the **shapes**, not the runtime.

---

## 6. Workflow-stage mapping summary

| Stage | What lands here | Top picks (source · feature) |
|---|---|---|
| **Capture** | inbox, intake, quick-add, idea-to-task | Plane intake (modified), Plannotator agent installer matrix (verbatim) |
| **Plan** | plans, missions, cycles, modules, views, dependency graph | Fusion missions (modified), Fusion graph view (verbatim), Plane cycles+modules+views (verbatim/modified), Plannotator plan editor + annotation block types (verbatim), Docmost page tree (verbatim) |
| **Build** | agent runs, worktrees, tool calls, live logs, permissions | Fusion lifecycle+worktree (verbatim), ACP-UI session store + components (verbatim), ACP-UI permission dialog (verbatim) |
| **Review** | diff, annotations, decision threads, AI review | Plannotator review-editor 40 components (verbatim), Plannotator double-tap Alt-Alt destination toggle (verbatim), Plane peek-overview (verbatim) |
| **Ship** | merge, release notes, audit | Fusion smart-merge (verbatim), Plannotator zero-knowledge URL-hash sharing (verbatim) |
| **Operate** | agents panel, telemetry, traffic, settings, deep links | Fusion agent panel suite (verbatim), ACP-UI traffic monitor (verbatim), Fusion deep links + multi-node mesh (verbatim), Plane settings two-level split (verbatim) |

---

## 7. Master adoption table

| # | Source | Feature | Verdict | Stage | Priority | Notes |
|--:|---|---|---|---|---|---|
| 1 | Plane | Power-K context-aware command palette | verbatim | all | P0 | Reimplement in cmdk + Svelte; copy registry + context-detector shape |
| 2 | Plane | Two-tier sidebar (workspace + extended-project) | modified | Plan | P0 | Use as project drill-in pattern |
| 3 | Plane | Five issue layouts (kanban/list/spreadsheet/gantt/calendar) | verbatim | Plan/Build | P0 | Each layout owns roots/filters/quick-add/empty-states |
| 4 | Plane | Peek-overview modal | verbatim | Plan/Review | P1 | Open detail without leaving list |
| 5 | Plane | Saved views (project + workspace scopes) | verbatim | Plan/Review | P0 | Cross-project workspace view is Linear-grade |
| 6 | Plane | Project feature toggles (cycles/intake/modules/views/pages on/off per project) | verbatim | Operate | P1 | Cheapest parity win |
| 7 | Plane | Cycles + Modules + Sub-issues + Relations | verbatim/modified | Plan | P0 | Modules verbatim; Cycles rename → release windows |
| 8 | Plane | Intake queue | modified | Capture | P1 | Becomes Fulcrum inbox |
| 9 | Plane | Two-level settings (workspace/project) | verbatim | Operate | P1 | |
| 10 | Plane | MobX stores | rejected | — | — | TanStack Query + Svelte stores instead |
| 11 | Docmost | Page tree (lazy, drag-reorder) | verbatim | Plan | P0 | `features/page/tree/` shape |
| 12 | Docmost | TipTap editor + drawio/excalidraw/mermaid | verbatim | Plan/Build/Review | P0 | Slash-menu, per-node menus |
| 13 | Docmost | Slash menu | verbatim | every doc surface | P0 | |
| 14 | Docmost | Page history timeline | verbatim | Plan/Review | P1 | |
| 15 | Docmost | Comments + real-time | modified | Review | P1 | Comments verbatim; full Yjs deferred |
| 16 | Docmost | Algolia search | rejected | — | — | Use Postgres FTS5 per local-first rule |
| 17 | Docmost | EE-fenced enterprise folders | rejected | — | — | Single OSS license |
| 18 | Docmost | NestJS server module shape | verbatim | foundation | P0 | Matches Fulcrum target; swap class-validator → Zod |
| 19 | Fusion | Task lifecycle (planning/todo/in-progress/in-review/done/archived) | verbatim | all | P0 | |
| 20 | Fusion | Board with deterministic column ordering | verbatim | Plan/Build/Review | P0 | `todo` mirrors scheduler order |
| 21 | Fusion | List view bulk ops + force-delete with dependency-conflict | verbatim | Plan/Build | P1 | |
| 22 | Fusion | Graph view (Sugiyama, persisted positions, chain highlight) | verbatim | Plan/Build | P0 | |
| 23 | Fusion | Chat view + Chat Rooms (multi-agent) | modified | Build/Operate | P2 | Rooms behind flag |
| 24 | Fusion | Missions (Mission → Milestone → Slice → Feature → Task) | modified | Plan | P0 | Rename Slice→Wave, Feature→Increment |
| 25 | Fusion | Worktree isolation `fulcrum/{task-id}` | verbatim | Build | P0 | |
| 26 | Fusion | Smart-merge with gates | verbatim | Ship | P0 | |
| 27 | Fusion | Multi-node mesh + shell-host bootstrap | verbatim | Operate | P1 | Discriminated union over `{browser, desktop-shell, mobile-shell}` |
| 28 | Fusion | Deep links `/?task=…` with 301 redirect | verbatim | Operate | P1 | |
| 29 | Fusion | Plugin SDK + PluginSlot | modified | Operate | P2 | MCP registry covers most |
| 30 | Fusion | Agent panel suite (Avatar/Detail/LogViewer/Reflections/TokenStats/Mentions) | verbatim | Operate | P0 | |
| 31 | Fusion | Express server | rejected | — | — | NestJS target |
| 32 | Fusion | SQLite-only persistence | rejected | — | — | Postgres-first |
| 33 | Plannotator | Plan editor with `Mod+Enter` approve/send-feedback overload | verbatim | Plan/Review | P0 | |
| 34 | Plannotator | Review-editor 40-component diff suite | verbatim | Review | P0 | |
| 35 | Plannotator | Annotation block types (task/prototype/success-criteria/dependency/verify-end-to-end) | verbatim | Plan/Review | P0 | |
| 36 | Plannotator | Double-tap `Alt Alt` destination toggle | verbatim | Review | P1 | Platform↔agent target |
| 37 | Plannotator | Zero-knowledge URL-hash sharing | verbatim | Review/Ship | P1 | AES-256-GCM, ciphertext-only, 7-day TTL |
| 38 | Plannotator | Bottom dock (PR Comments/Checks/Summary/Logs/Suggestions tabs) | modified | Review/Ship | P1 | Resizable bottom pane |
| 39 | Plannotator | Agent installer matrix (Claude Code/Copilot/Gemini/OpenCode/Pi/Codex) | verbatim | Capture/Build | P0 | Exact match to Fulcrum agent target |
| 40 | Plannotator | Shortcut registry API (`defineShortcutScope`, `createShortcutScopeHook`, `createDoubleTapShortcutsHook`) | modified | foundation | P0 | Port shape to Svelte 5 runes |
| 41 | ACP-UI | 13-component minimal ACP client surface | verbatim | all | P0 | AgentSelector/ChatView/CommandPalette/PermissionDialog/SessionList/SettingsView/StartupProgress/ToolCallCard/TrafficMonitor/ModelPicker/ModePicker/EnvVarEditor/AuthMethodDialog |
| 42 | ACP-UI | Session store contract (`isConnecting` vs `isReconnecting` split) | verbatim | Build/Operate | P0 | |
| 43 | ACP-UI | Tauri 2 desktop ship matrix | modified | Operate | P1 | Prefer Tauri over Electron |
| 44 | ACP-UI | Permission dialog model | verbatim | Build/Review | P0 | One-button-per-option + Cancel |
| 45 | ACP-UI | Traffic monitor | verbatim | Operate | P0 | JSON-RPC inspector |
| 46 | ACP-UI | Phased startup progress | verbatim | Build | P1 | `detectPhase()` over stderr |
| 47 | ACP-UI | `$/ping` 25s keep-alive + foreground reconnect | verbatim | Operate | P1 | |
| 48 | ACP-UI | Vue + Pinia + Microsoft App Insights | rejected | — | — | Svelte 5; local-first telemetry |

---

## 8. Top 30 must-copy (ranked by Fulcrum leverage)

1. **Plane Power-K context-aware command palette** — single largest UX-leverage win; ⌘K is the spine of every modern PM/agent surface.
2. **Plannotator review-editor 40-component diff suite** — entire Review-stage UI in one repo.
3. **Fusion graph view (Sugiyama dep map)** — visual cross-repo dependency story Fulcrum lacks.
4. **ACP-UI 13-component minimal client + session store** — agent-run surface, copy-friendly contract.
5. **Plane five-layout issue surface (kanban/list/spreadsheet/gantt/calendar)** — only way to match Linear/Jira.
6. **Docmost TipTap editor + slash menu + drawio/excalidraw/mermaid** — Plan/Review doc surface.
7. **Fusion task lifecycle + Board with deterministic column ordering** — the canonical task spine.
8. **Plannotator `Mod+Enter` approve/send-feedback overload** — sharpest agent-loop binding.
9. **Plannotator agent installer matrix (Claude/Copilot/Gemini/OpenCode/Pi/Codex)** — exact agent target match.
10. **Plane saved views (project + workspace scopes)** — Linear-grade query saving.
11. **Fusion missions hierarchy (Mission→Milestone→Slice→Feature→Task)** — multi-layer planning Fulcrum needs.
12. **ACP-UI permission dialog model** — only correct agent-tool consent UX.
13. **Plane peek-overview modal** — open detail without losing list context.
14. **Fusion worktree isolation `fulcrum/{task-id}`** — parallel agent execution without conflicts.
15. **Docmost page tree (lazy, drag-reorder)** — Plan/memory hierarchy.
16. **Plannotator annotation block types (task/prototype/success-criteria/dependency/verify-end-to-end)** — spec-grade plan vocabulary.
17. **Fusion agent panel suite** — Avatar/Detail/LogViewer/Reflections/TokenStats — Operate surface.
18. **Plannotator zero-knowledge URL-hash sharing (AES-256-GCM, 7-day TTL)** — local-first plan sharing.
19. **ACP-UI traffic monitor** — protocol debug pane.
20. **Plane two-tier sidebar (workspace + extended-project)** — project drill-in pattern.
21. **Plannotator double-tap `Alt Alt` destination toggle** — novel multi-target binding.
22. **Fusion smart-merge with gates** — Plan→Review→Execute→Review per step.
23. **Plane project feature toggles (per-project cycles/intake/modules on/off)** — granularity Fulcrum needs.
24. **Docmost NestJS server module shape** — matches Fulcrum NestJS/TypeORM target.
25. **ACP-UI phased startup progress (`detectPhase()`)** — fixes "starting agent…" opacity.
26. **Plane intake queue** — becomes Fulcrum inbox.
27. **ACP-UI Tauri 2 desktop ship matrix** — prefer Tauri over Electron.
28. **Fusion deep-link normalization (`/?task=ID` with 301)** — link stability.
29. **Plannotator bottom dock (PR Comments/Checks/Summary/Logs/Suggestions tabs)** — Review surface chrome.
30. **Plannotator shortcut registry API shape (`defineShortcutScope`/`createShortcutScopeHook`/`createDoubleTapShortcutsHook`)** — port to Svelte 5 runes.

---

## 9. Citations (≥25)

Local clones (under `/Users/mkh/workspace/fulcrum/.scratch/upstream-product-replacement/repos/`):

1. `plane/README.md` — features list (L40-L74).
2. `plane/apps/web/app/routes.ts` — route entry; mergeRoutes(core, extended).
3. `plane/apps/web/app/(all)/[workspaceSlug]/(projects)/extended-sidebar.tsx` — extended-project sidebar.
4. `plane/apps/web/app/(all)/[workspaceSlug]/(projects)/sidebar.tsx` — primary sidebar.
5. `plane/apps/web/app/(all)/[workspaceSlug]/(projects)/projects/(detail)/[projectId]/{cycles,modules,views,issues,pages,intake,archives}/` — project route tree.
6. `plane/apps/web/app/(all)/[workspaceSlug]/(settings)/settings/{(workspace),projects}/...` — two-level settings.
7. `plane/apps/web/core/components/issues/issue-layouts/{kanban,list,spreadsheet,gantt,calendar}/` — five layouts.
8. `plane/apps/web/core/components/issues/peek-overview/` — peek-overview pattern.
9. `plane/apps/web/core/components/power-k/global-shortcuts.tsx` — global shortcut handler.
10. `plane/apps/web/core/components/power-k/core/{registry.ts,context-detector.ts,shortcut-handler.ts,types.ts}` — palette spine.
11. `plane/apps/web/core/components/power-k/menus/{settings,projects,workspaces,cycles,views,members,modules,labels}.tsx` — per-context menus.
12. `docmost/README.md` — features list (L18-L30).
13. `docmost/apps/client/src/pages/{spaces,space,page,settings/...}` — page surface routes.
14. `docmost/apps/client/src/features/page/tree/` — page tree atoms/hooks/styles/components/utils.
15. `docmost/apps/client/src/features/editor/page-editor.tsx` + `features/editor/components/slash-menu/command-list.tsx` — editor + slash menu.
16. `docmost/packages/editor-ext/src/lib/{drawio,excalidraw,mermaid,mention,status,link,indent,embed,resizable-nodeview}.ts` — TipTap extensions.
17. `docmost/apps/client/src/ee/{ai-chat,ai,page-permission,pdf-export,page-verification,audit,billing}/` — EE feature folders (audit only, do not adopt code).
18. `fusion/README.md` — flow, gates, multi-node, MIT license (L9-L86).
19. `fusion/docs/architecture.md` — package map, runtime diagram, shell-host bootstrap (L13-L150).
20. `fusion/docs/dashboard-guide.md` — Board/List/Graph/Chat behavior, column ordering, deep links.
21. `fusion/docs/missions.md` — Mission/Milestone/Slice/Feature/Task model (L9-L80).
22. `fusion/packages/dashboard/app/components/{Board,Column,TaskCard,AgentDetailView,AgentLogViewer,AgentMetricsBar,AgentReflectionsTab,AgentTokenStatsPanel,AgentsOverviewBar,PluginSlot}.tsx` — UI surface.
23. `fusion/plugins/fusion-plugin-{dependency-graph,roadmap,reports,cursor-runtime,droid-runtime,hermes-runtime,openclaw-runtime,paperclip-runtime}` — plugin model.
24. `plannotator/README.md` — features, sharing, agent installer matrix.
25. `plannotator/packages/editor/{App.tsx,shortcuts.ts,demoPlan.ts}` — plan editor.
26. `plannotator/packages/review-editor/{shortcuts.ts,components/*,dock/*}` — review-editor 40 components + dock.
27. `plannotator/packages/ui/components/{AnnotationPanel,AnnotationToolbar,AnnotationToolstrip,AnnotationSidebar,EditorAnnotationCard}.tsx` — annotation primitives.
28. `plannotator/apps/{codex,copilot,gemini,opencode-plugin,pi-extension,vscode-extension}` — agent installers.
29. `acp-ui/README.md` — feature list, install matrix, keep-alive, config paths.
30. `acp-ui/src/components/{AgentSelector,AuthMethodDialog,ChatView,CommandPalette,EnvVarEditor,ModelPicker,ModePicker,PermissionDialog,SessionList,SettingsView,StartupProgress,ToolCallCard,TrafficMonitor}.vue` — 13 client components.
31. `acp-ui/src/stores/{session,config,traffic}.ts` — Pinia stores; session-state contract.
32. `acp-ui/package.json` — Vue 3 + Pinia + Tauri 2 + @agentclientprotocol/sdk + Capacitor stack.

Upstream documentation / URLs (used to cross-check):

33. `https://plane.so/` — product overview.
34. `https://docs.plane.so/` — Plane documentation.
35. `https://github.com/makeplane/plane` — Plane source of truth.
36. `https://docmost.com/docs` — Docmost docs.
37. `https://github.com/docmost/docmost` — Docmost source.
38. `https://runfusion.ai` — Fusion landing.
39. `https://github.com/Runfusion/Fusion` — Fusion source.
40. `https://plannotator.ai` — Plannotator marketing + docs.
41. `https://plannotator.ai/docs/guides/sharing-and-collaboration/` — zero-knowledge sharing guide.
42. `https://github.com/zed-industries/agent-client-protocol` — ACP spec.
43. `https://agentclientprotocol.com/` — ACP docs site.
44. `https://acp-ui.github.io/` — ACP-UI live web build.
45. `https://github.com/formulahendry/acp-ui/releases` — ACP-UI releases.
