# Plane vs. Fulcrum: Competitive Parity Audit

*Research date: 2026-05-16. Plane version basis: v1.15.x / cloud changelog through April 2026.*

Rating scale: **Missing** = Fulcrum has nothing here | **Partial** = core present, notable gaps | **Parity** = equivalent depth | **Surplus** = Fulcrum ahead

## 1. Issues / Tasks

### Plane Features
- Work item types: custom types (Pro), standard issue, sub-issue nesting (unlimited depth)
- Properties: state, priority (urgent/high/medium/low/none), assignee(s), labels, start date, due date, estimate (points or hours), cycle, module, parent issue
- Sub-issues: nested hierarchy, progress rollup to parent
- Relations: blocking/blocked-by, duplicate, relates-to; cross-project sub-work item linking
- Bulk operations (Pro): bulk assign, bulk state change, bulk label, bulk delete
- Rich text editor: 16+ content blocks, slash commands, embeds (Figma, Loom, YouTube, Google Docs), file attachments, LaTeX, Draw.io diagrams
- Activity log: full audit trail per issue
- Votes/upvotes: upvote/downvote work items
- AI description generation, AI duplicate detection (with confidence score)
- Recurrence: daily/weekly/monthly/quarterly/yearly
- Time tracking: log time per work item, consolidated worklogs (Pro)
- Comments: threaded replies, emoji reactions, @mentions
- Epics as long-running containers with progress tracking (Pro)

### Fulcrum Coverage: **Partial**
**Top gaps:**
- No time tracking / worklogs
- No upvote/downvote voting
- No AI-powered description generation or duplicate detection
- No custom work item types (type system exists but not user-configurable)
- Rich text embed support narrower than Plane's 16+ blocks

## 2. Projects

### Plane Features
- Project creation with name, description, cover image, emoji/icon
- Network: public vs. secret (invite-only)
- Roles: Owner, Admin, Member, Viewer, plus workspace Guest
- Custom roles (Enterprise): two-layer access with per-resource overrides
- Archive/delete projects, project templates (Business)
- Project subscribers: auto-subscribe to all updates without assignment
- Workspace-level reusable labels
- Active cycles dashboard (Pro): cross-project cycle visibility

### Fulcrum Coverage: **Partial**
**Top gaps:** No project templates, no project subscriber mechanism, no custom roles with per-resource overrides

## 3. Cycles (Sprints)

### Plane Features
- Create cycles with name, description, start/end dates; draft/active/completed states
- Auto-schedule cycles (Business): generate future cycles with custom duration + auto-rollover
- Parallel cycles (Enterprise)
- Transfer incomplete items on cycle close
- Burn-down and build-up charts, summary metrics
- Active Cycles dashboard (Pro): workspace-wide view
- Cycle scatter plot, CSV export (Pro)

### Fulcrum Coverage: **Partial**
**Top gaps:** No auto-schedule/auto-rollover, no parallel cycles, no cross-project cycles dashboard

## 4. Modules

### Fulcrum Coverage: **Parity**
Minor gaps: module-level link attachments and lead assignment confirmation needed

## 5. Views

### Plane Features
- View types: List, Board, Table/Spreadsheet, Gantt, Calendar
- Grouping + sub-grouping, display property toggles, rich filters
- Saved views per-project, workspace-level cross-project views
- Published/externally shared views (Pro)

### Fulcrum Coverage: **Partial**
**Top gaps:** No Gantt view, no Calendar view, no workspace-level cross-project views, no published views

## 6. Pages / Docs

### Plane Features
- Full rich-editor knowledge base: workspace wiki, project pages, teamspace pages
- Live collaboration with cursor presence
- Nested pages, collections, version history, inline comments
- Page templates, published pages, Notion/Confluence import

### Fulcrum Coverage: **Partial** (Docmost-derived mirrors exist but no final rich editor UI)
**Top gaps:** No final rich editor workbench, no live collaboration UI, no wiki surface. Docmost-derived TypeORM mirrors persist page tree/history/comments/attachments/backlinks/collaboration/search — backend parity is partial, frontend is missing.

## 7. Inbox / Intake

### Fulcrum Coverage: **Partial**
**Top gaps:** No email-to-intake, no custom intake forms, no AI duplicate detection in intake, no intake analytics

## 8. Notifications

### Fulcrum Coverage: **Partial**
**Top gaps:** No project subscriber feature, no mobile push, no Slack-routed notifications

## 9. Command Palette / Quick Actions

### Fulcrum Coverage: **Missing** (for web/TUI)
CLI nature provides keyboard interaction but no GUI command palette equivalent. TUI has keybindings per-screen.

## 10. Integrations

### Fulcrum Coverage: **Partial**
**Top gaps:** No native GitHub/GitLab bidirectional sync, no Slack integration, no Jira/Linear/Asana importers, no marketplace

## 11. Analytics / Reports

### Fulcrum Coverage: **Parity / Partial**
Fulcrum has burndown, velocity, CFD, cycle time, lead time, throughput, WIP. Gaps: no time tracking reports, no AI charts, no custom widget dashboards, no intake analytics.

## 12. Workspace Admin

### Fulcrum Coverage: **Partial**
**Top gaps:** No billing/seat management (local-first by design), no SSO/SAML/LDAP, no custom roles with per-resource overrides, no bulk member CSV import

## Priority Gap Summary

| Rank | Gap Area | Impact | Fulcrum Status |
|------|----------|--------|----------------|
| 1 | Pages / Docs / Wiki (final UI) | Very High | Backend mirrors exist; no rich editor UI |
| 2 | Command Palette (Power K) | High | Missing for web/TUI |
| 3 | Time Tracking | High | Missing |
| 4 | Integrations (GitHub/Slack/importers) | High | Partial — connectors exist, no bidirectional sync |
| 5 | AI Features | High | Missing (duplicate detection, description gen, AI charts) |
| 6 | Custom Work Item Types | Medium | Type system exists but not user-configurable |
| 7 | Voting (upvote/downvote) | Medium | Missing |
| 8 | Intake enhancements | Medium | Partial — no email, custom forms, AI dedup |
| 9 | Cycle auto-schedule / auto-rollover | Medium | Missing |
| 10 | Workspace Admin (SSO, custom roles) | Medium | Missing (local-first design partially explains) |
| 11 | Published / shared views (external) | Low-Med | Missing |
| 12 | Gantt + Calendar views | Low-Med | Missing |
| 13 | Mobile notifications | Low | Not applicable (CLI-native) |

## Fulcrum Surplus Areas (vs. Plane)

| Area | Fulcrum Advantage |
|------|-------------------|
| Agent-native workflow | Full docs→ACP→planning→PM→dep-run→UAT→E2E-generation cycle — Plane has no equivalent |
| Dependency-aware execution | Fusion-derived dependency tree dispatch, QA loops, automated feedback exhaustion |
| Local-first architecture | PGlite/PostgreSQL seamless switching, zero-config local dev |
| Multi-agent orchestration | 5 agent runtimes, cross-agent rules distribution, skill sync |
| CLI/TUI parity | Full workflow accessible via CLI and TUI alongside web |
| Review workbench | Plannotator-derived annotation, diff tree, feedback export |
| Generated E2E tests | Auto-generated real-data regression tests from UAT approval |
