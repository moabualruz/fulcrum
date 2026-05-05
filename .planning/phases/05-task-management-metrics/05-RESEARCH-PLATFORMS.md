# Phase 5: Platform Feature Comparison Research

**Date:** 2026-05-05
**Scope:** Linear, Jira, ClickUp, Shortcut, Plane, Asana, GitHub Projects, Notion
**Purpose:** Competitive feature audit to inform CONTEXT.md decisions

---

## 1. Task CRUD & Detail View

| Platform | Creation Flow | Detail Panel | Rich Text | Subtasks | ID System |
|---|---|---|---|---|---|
| **Linear** | `C` key anywhere → inline form; `Cmd+K` palette; AI expands short prompts; Slack/email → issue extraction | Right side panel (not full page); stays in context | Markdown + mentions + embeds + code blocks + checklists | 1 level (no deep nesting); subtasks are real issues | `TEAM-123` auto-increment per team |
| **Plane** | Toolbar button or `C`; bulk CSV import | Side panel or full page (toggle) | Tiptap-based rich text; mentions, code, embeds | Nested issues (multi-level) | Configurable prefix + sequence |
| **Jira** | "+ Create" button; modal; templates per issue type; Jira AI generates from description | Full page (default); can configure side panel in some views | Atlassian editor: mentions, macros, embeds, tables | Unlimited subtask depth; subtasks ≠ issues (different type) | `PROJ-123` per project |
| **Asana** | Quick add row in list, `Tab+Q` global; templates; task creation from email | Right side panel (persistent); portal to full detail | Custom rich text; code blocks limited; no inline embeds | Subtasks up to ~5 levels; UX degrades at depth 3+ | No public ID; internal ID only |
| **ClickUp** | Multiple: quick add, form, template, slash command, email | Configurable: modal / side panel / full page per space | Full rich text + slash commands + embeds + tables | Unlimited nesting; checklist items separate from subtasks | `SPACE-123` configurable |
| **Shortcut** | `N` for new story; quick-create in epic/iteration context | Side panel stays while browsing list | Markdown; mentions; no embeds | 1 level (subtasks called "tasks") | `sc-123` auto |
| **GitHub Projects** | In repo: Issues tab; in project: "+ Add item" inline or draft → promote to issue | Full page (GitHub issue); no side-panel | GitHub Flavored Markdown; mentions, task lists, code, no embeds | Tasklists (sub-issues) via `#issue` refs; experimental | `OWNER/REPO#123` |
| **Notion** | In-database: "New" button or `+` row; inline or page | Full page (always); no side panel | Full block editor: embeds, tables, columns, code, databases | Nested pages as subtasks; no true subtask field | No ID unless custom field added |

**Winner: Linear** — `C` anywhere, instant keyboard-driven form, side panel preserving list context, AI prompt expansion. Lowest friction task creation of any tool.

**Table stakes:** Side panel that doesn't lose list context; `@mentions`; markdown; at least 1 level subtasks; project-scoped IDs.

---

## 2. Board/List/Table Views

| Platform | Kanban | List | Table/Spreadsheet | View Switching |
|---|---|---|---|---|
| **Linear** | Board: groupable by status/assignee/priority; no WIP limits natively; no swimlanes | List default; 60fps; grouping + sorting | No spreadsheet view | Tabs per view; saved views; keyboard `1`/`2`/`3` |
| **Plane** | Kanban + swimlanes; grouping by any field | List; inline editing | No | Dropdown in header |
| **Jira** | Swimlanes by epic/assignee/query; WIP limits per column; card density 2 options | Backlog list (sprint-aware) | No native spreadsheet | Board ↔ Backlog tabs |
| **Asana** | Basic board; no swimlanes; no WIP | List (primary); inline editing; column reorder | No | Tabs (List/Board/Timeline/Calendar) |
| **ClickUp** | Swimlanes by field; WIP limits; card density toggle | List with inline edit; 20+ column types | Full spreadsheet with formulas; column types: number, date, dropdown, currency, etc. | Dropdown with 10+ view types; saved views per space/folder/list |
| **Shortcut** | Stories board per workflow; group by epic; no WIP | List; inline edit limited | No | Tab row |
| **GitHub Projects** | Board by status field; no swimlanes; no WIP | Table (primary UX); inline editing | Full table; custom field columns; filter inline | Dropdown; saved views |
| **Notion** | Board by select property | Table (database) native; inline edit | Full table; formula columns; rollups | Toggle between view tabs |

**Winner: ClickUp** — most view types (10+), WIP limits, swimlanes, full spreadsheet with formulas. For boards: **Jira** has best swimlane + WIP config. For table: **GitHub Projects / Notion** tied.

---

## 3. Task Relationships & Dependencies

| Platform | Relationship Types | Visualization | Chain Detection |
|---|---|---|---|
| **Linear** | Blocks/Blocked by, Relates to, Duplicate of | List in issue panel; no Gantt arrows on board | Warning badge on blocked issues |
| **Plane** | Blocking, Blocked by, Relates, Duplicate | Gantt arrows in timeline view | Basic warning |
| **Jira** | Blocks, Clones, Duplicates, Relates, custom (via plugin) | Timeline shows dependency arrows; no board arrows | Warning when starting blocked issue |
| **Asana** | Blocking/Waiting on (binary) | Timeline: drag to draw arrows | Email notify when dependency complete |
| **ClickUp** | Blocking, Waiting on, Linked (custom types) | Gantt arrows; board arrows optional | Warning banner on task |
| **Shortcut** | No first-class dependency system | None | None |
| **GitHub Projects** | Linked issues (via text); no blocking model | None native | None |
| **Notion** | Relation property (DB → DB); no blocking concept | None | None |

**Winner: ClickUp** for completeness; **Asana** for timeline drag-to-link UX.

---

## 4. Workflow & Status Engine

| Platform | Custom Statuses | Transition Rules | Automations on Change | Status Categories |
|---|---|---|---|---|
| **Linear** | Per-team workflows; 4 categories fixed (Unstarted/Started/Completed/Canceled) | No transition constraints | Auto-move to cycle, auto-assign by label | 4 built-in, color-coded |
| **Plane** | Fully custom; drag-to-reorder | No constraints | Basic automations | Custom categories |
| **Jira** | Per-project workflow; Workflow Scheme assigns to issue types | Full transition permission + condition rules; post-functions on transition | Automation rules: 900+ templates | To Do / In Progress / Done categories |
| **Asana** | Sections as pseudo-statuses; Rules engine on section entry | Limited (Rules not true workflow constraints) | Rules: when X → do Y | None explicit |
| **ClickUp** | Per-list statuses; color per status; global or custom | No hard constraints | Automation builder: 100+ triggers; if/then; multi-step | None explicit |
| **Shortcut** | Per-workflow states; shared across team | Linear flow (no skip constraints) | Basic: VCS actions → status change | Unstarted / Started / Done |
| **GitHub Projects** | Single select "Status" field; no workflow engine | None | Built-in: auto-add items, auto-archive, auto-close | None |
| **Notion** | Select property = status | None | None native | None |

**Winner: Jira** — only tool with true transition guards, post-functions, and per-issue-type workflow assignment.

---

## 5. Sprint/Cycle Management

| Platform | Planning UX | Board/Backlog Split | Reports | Rollover |
|---|---|---|---|---|
| **Linear** | Cycles: drag issues from backlog tray; capacity by estimate; `Shift+C` to add | Cycle board separate from all-issues list | Burndown; velocity; cycle time | Automatic on cycle close |
| **Plane** | Modules + Cycles; drag from backlog | Separate cycle view | Burndown chart | Manual or auto |
| **Jira** | Sprint planning view; drag stories from backlog; velocity-based capacity | Dedicated sprint board + backlog | Burndown, velocity, CFD, sprint reports, retrospective | Manual rollover prompt |
| **Asana** | No native sprint concept | No | No | N/A |
| **ClickUp** | Sprint folders; drag tasks; capacity by points | Sprint list/board views | Burndown, velocity (paid tiers) | Manual |
| **Shortcut** | Iterations: date-range, drag stories in | Iteration page with board/list | Burndown + cycle time + CFD | Manual |

**Winner: Linear** for UX (instant rollover, clean cycles). **Jira** for reporting (most complete).

---

## 6. Comments & Activity

| Platform | Threading | Mentions | Activity Feed | Reactions | Resolution |
|---|---|---|---|---|---|
| **Linear** | Flat + threaded replies; inline on issue | `@user`, `@team`, `#issue` | Full audit log in issue | ✓ emoji reactions | ✓ comment resolve |
| **Plane** | Flat | `@user` | Activity log | ✓ | ✗ |
| **Jira** | Flat (no threading) | `@user` | Activity tab (detailed) | ✗ | ✗ |
| **Asana** | Flat + "heart" on tasks | `@user`, `@task`, `@project` | Activity tab | ✓ hearts only | ✗ |
| **ClickUp** | Threaded replies | `@user`, `@task`, `@doc` | Activity view | ✓ emoji | ✓ resolve |
| **GitHub** | Threaded (PR-style) | `@user`, `#issue`, `/slash commands` | Timeline + events | ✓ 6 reactions | ✓ resolve (minimized) |
| **Notion** | Page-level + inline block comments | `@user`, `@page`, `@date` | Page history | ✓ | ✓ resolve inline |

**Winner: GitHub Issues** — PR-style threaded + minimize resolved + reactions. **Linear** close second.

---

## 7. Labels, Tags, Priority, Custom Fields

| Platform | Labels | Priority | Custom Fields | Field Dependencies |
|---|---|---|---|---|
| **Linear** | Multi-label; color; team-scoped | Urgent/High/Medium/Low/No Priority | Limited: URL, text, number | ✗ |
| **Plane** | Multi-label; color | Same 5 levels | Custom fields (paid) | ✗ |
| **Jira** | Labels + Components (structured) | P1-P5 or custom | 20+ types: select, multi-select, cascading | ✓ via workflow conditions |
| **ClickUp** | Tags + Labels distinct; nested groups | Urgent/High/Normal/Low | 20+ types + formula + AI fields; field visibility by task type | ✓ via task type field sets |

**Winner: ClickUp** — most field types, formula fields, field visibility rules. **Jira** for enterprise cascading.

---

## 8. Filters, Saved Views, Search

| Platform | Filter Builder | Saved Views | Global Search | Quick Filters |
|---|---|---|---|---|
| **Linear** | Visual filter chips; AND/OR | Per-team saved views; starred | `Cmd+K` fuzzy across all entities; instant | "My issues", "Active", "Backlog" sidebar |
| **Jira** | JQL text + visual builder; full boolean | Saved JQL filters; Dashboards | Global search with type filters | Board quick filters configurable |
| **ClickUp** | Filter builder + saved; complex nested AND/OR | Views saved per hierarchy level | Universal search with natural language (paid AI) | Everything view |

**Winner: Linear** — `Cmd+K` fastest. **Jira** — JQL most powerful.

---

## 9. Bulk Operations

| Platform | Multi-select UX | Bulk Actions | Undo |
|---|---|---|---|
| **Linear** | Checkbox on hover; `Cmd+click`; `Shift+click` range | Status, assignee, priority, label, cycle, project, delete, archive | `Cmd+Z` |
| **ClickUp** | Bulk Action Toolbar; `Shift+click` range | Status, assignee, priority, tags, custom fields, due date, delete, move | ✓ undo |
| **Jira** | Checkbox in backlog/list; Bulk Change wizard | Status, assignee, fix version, component, custom fields, delete | ✗ |

**Winner: ClickUp** — bulk custom field editing + toolbar UX + undo.

---

## 10. Keyboard Shortcuts & Command Palette

| Platform | Shortcuts | Command Palette | Keyboard-first Creation |
|---|---|---|---|
| **Linear** | 50+ shortcuts; `C` create, `S` status, `P` priority, `A` assign, `J/K` nav | `Cmd+K` fuzzy across all entities; instant | Full issue without mouse |
| **ClickUp** | 30+ shortcuts; `Cmd+K` | `Cmd+K` available | Partial |
| **Jira** | 20+ shortcuts; `C` create, `G+G` search | No command palette | Partial |

**Winner: Linear** — most comprehensive, most keyboard-native. No other tool comes close.

---

## 11. Charts & Metrics

| Platform | Burndown | Velocity | Cycle/Lead Time | CFD | Custom Dashboards | Export |
|---|---|---|---|---|---|---|
| **Linear** | ✓ per cycle | ✓ team velocity | ✓ | ✗ | ✗ | CSV |
| **Jira** | ✓ | ✓ | ✓ | ✓ | ✓ fully configurable | CSV + Confluence |
| **ClickUp** | ✓ (paid) | ✓ (paid) | ✓ (paid) | ✗ | ✓ custom + goals | CSV |
| **Shortcut** | ✓ | ✓ | ✓ | ✓ | ✗ | CSV |

**Winner: Jira** — all 5 agile charts + configurable dashboards. **Shortcut** strong on CFD.

---

## 12. Gantt & Timeline

| Platform | Timeline | Drag Reschedule | Dependency Arrows | Zoom | Critical Path |
|---|---|---|---|---|---|
| **Linear** | Roadmap (project-level) | ✓ | ✗ | Quarter/month | ✗ |
| **Plane** | ✓ Gantt | ✓ | ✓ | Day/week/month | ✗ |
| **Jira** | Timeline (next-gen) | ✓ | ✓ | Day/week/month/quarter | ✗ |
| **ClickUp** | Gantt view | ✓ | ✓ | Day/week/month/quarter | ✓ (paid) |
| **Asana** | Timeline (Gantt-like) | ✓ | ✓ (drag arrows) | Day/week/month | ✗ |

**Winner: ClickUp** — Gantt + drag + dependencies + critical path + 4 zoom levels.

---

## 13. Calendar View

| Platform | Task Display | Drag Due Date | Multi-day Spans | Sprint Overlay |
|---|---|---|---|---|
| **Plane** | ✓ | ✓ | ✓ | ✗ |
| **Asana** | ✓ | ✓ | ✓ | ✗ |
| **ClickUp** | ✓ | ✓ | ✓ | ✗ |
| **Notion** | ✓ | ✓ | ✓ | ✗ |
| **Linear** | ✗ | N/A | N/A | N/A |

**Winner: ClickUp / Asana** tied. Linear has no calendar — significant gap.

---

## 14. Notifications & Watchers

| Platform | Granularity | Watch/Unwatch | Channels | Batching |
|---|---|---|---|---|
| **Linear** | Category-level | `Shift+S` subscribe; auto on create/assign/mention | Desktop, mobile, Slack, email | Email digests |
| **Jira** | Per-event type; notification scheme per project | Watch button; auto on create/comment | Email, in-app, Slack, Teams | ✗ |
| **ClickUp** | Granular per notification type | Watch button | In-app, email, Slack, mobile | ✓ digest |

**Winner: Jira** — per-event notification scheme per project.

---

## 15. Import/Export

| Platform | CSV | Migration Tools | API |
|---|---|---|---|
| **Linear** | ✓ | Jira, Asana, GitHub, Shortcut importers | GraphQL; full coverage; webhooks |
| **Plane** | ✓ | Jira, Linear, Asana, ClickUp, Monday importers | REST + webhooks |
| **Jira** | ✓ | CSV; Trello; Asana (partner) | REST + Forge; most mature |

---

## 16. Collaboration & Mobile

| Platform | Real-time | Presence | Assignee Model | Mobile |
|---|---|---|---|---|
| **Linear** | ✓ instant sync | ✗ | Single assignee | iOS + Android; near-parity |
| **ClickUp** | ✓ | ✓ "viewing" | Single + multi | iOS + Android |
| **Notion** | ✓ live cursors | ✓ presence avatars | Person property | iOS + Android |
| **Jira** | ✓ (eventual) | ✗ | Single | iOS + Android; slower |

---

## Summary: Platform Strengths

| Platform | Best At | Weakest At |
|---|---|---|
| **Linear** | Speed, keyboard UX, cycles, developer workflow | No calendar, no Gantt arrows, single assignee, no spreadsheet |
| **Plane** | Open source, Gantt, multi-level subtasks, importers | Shortcuts, analytics, polish |
| **Jira** | Workflow engine, sprint analytics, enterprise, API | Speed, UX complexity, mobile |
| **Asana** | Cross-functional teams, mobile, timeline UX | No sprint native, no priority, analytics |
| **ClickUp** | Feature breadth, bulk ops, Gantt, custom fields | Performance, complexity |
| **Shortcut** | Clean dev UX, iteration analytics (CFD!) | No Gantt, no calendar, no deep custom fields |
| **GitHub Projects** | Native code context, GraphQL API, table view | No workflow, no sprint, no analytics |
| **Notion** | Multiplayer, block editor, flexibility | No sprint, no workflow, no analytics, no ID system |
