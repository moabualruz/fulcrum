# Vision Gaps — Fulcrum vs the Verbatim Ask

> Counterpart to `INVENTORY.md`. Inventory describes what's *built*. This file
> describes what the user **asked for** and what we **don't have** yet.
> The inventory's "zero drift" verdict is wrong: PRDs were scoped narrowly
> against the kernel; the actual product vision (Jira+Confluence-grade agent
> OS) is barely covered.

## User's verbatim original ask

> for covering supervising repositories, tasks, agent runs, context, memory,
> and artifacts: imagine it a jira + confulance clone, where we can have
> personal and ai agents projects, it has interactive monitoring on
> kanban/scrum boards for deve cycles, it has burndown charts and reporting
> per project, it preserves and provide memory and context management
> through project management and documentation details, it include the
> orchistration and assignment and we should have to search for a tool or a
> set of tool so we can assign any task to any agent and also auto assign
> default task to cli agents based on task type or other criteria for
> choosing for auto orchestratin mode, it should follow the workflow
> described in https://github.com/mattpocock/skills maybe we can have the
> skills in as prompts and always git fresh versions from matt but a lot of
> this work can be just codified in the system without skills and we can
> manage the rest of teh skills like we managed the packages above ... no
> distenction projects can be worked by both, the only thing for memory
> context and knowledge and tracking there should be global access and per
> project access, and global stuff is shared and can be accessed if relevant
> or ordered or whatever teh best practice and design we would come to for
> this, design full accounts/mult-user/collaboration even sass, but default
> mode and run mode is local only for now, do a research of what is best and
> what we can get more free or opensource ready to use building blocks to
> utilise without writing code, and make this a rule for the rest of the
> project always search for tools and dependencies and ready to use parts to
> utilize rather than doing most of the code, we want a quick path using the
> best available tools unless there is no way anything fits, if any fits
> more than 75% it si worth the save to do teh rest 25% per tool or
> dependency but if it is more than that maybe ask me for each case because
> i might choose differently for each, i also prefer dependencies and
> building blocks over 3rd party integrations but not against the 3rd party
> integrations, document all research findings and recommendations, write
> the plan after research compatibility and technical design, in the plan
> use the best in class recommendation but also put it failure gates and
> what would make us change and rebuild using a different recommended tool
> 2nd or 3rd if available

## Follow-up clarifications (this session)

- **Docs are general, must split by project / general AND by type.** Current
  doc surface is a single flat list of `documents` rows.
- **No task view or management — even local-productivity-grade is missing,
  let alone top-10-class.** Current: drag-card-only kanban, no detail page.
- **Editor experience is bad.** Current: raw `svelte-codemirror-editor` w/
  toggle-preview. No block editor, no slash commands, no embeds.
- **Aim: top-10-class product, not v0 admin.** Versioning/scope-splitting is
  a release concern; design must cover everything from the start.
- **Workflow rule (durable):** research → recommend → plan → grill on gray
  areas → break down → execute. Every domain.

## Gap matrix (vision pillar → built / not built)

| Pillar (verbatim) | Built? | Gap |
|---|---|---|
| **Jira-grade task management** | ❌ | Only kanban drag. No detail page, subtasks, dependencies, assignees, due dates, estimates, sprints, epics, milestones, labels, custom fields, saved views, list/table/calendar/timeline/Gantt, bulk ops, comments, watchers, mentions, keyboard-first ops. |
| **Confluence-grade docs** | ❌ | Flat doc list w/ MD editor + sanitized preview. No project scoping in UI. No type taxonomy/folders/tree/breadcrumbs. No tags, links, backlinks, mentions. No versions/history. No comments/threads. No templates. No search facets. No wiki hierarchy. |
| **Top-class editor** | ❌ | CodeMirror+marked toggle. No block editor (BlockNote/TipTap/Lexical/Milkdown). No slash menu, no inline images, no embeds, no math, no diagrams, no wikilinks, no mentions, no collab, no autosave-with-history. |
| **Burndown charts + per-project reporting** | ❌ | Counters only on dashboard (projects/openTasks/docs/runsLast7d). No burndown, velocity, cycle time, throughput, sprint reports, project dashboards, scrum/sprint tracking. |
| **Sprint / scrum / dev cycles interactive monitoring** | ❌ | No sprints. No backlog. No active sprint board. No story points. No retros. No standup view. |
| **Memory: per-project + global, retrievable, gated** | ❌ partial | `memories` table exists. No retrieval engine, no UI, no relevance gating, no scopes (per-project / global), no "shared if relevant" flow, no context bridge into agent runs. |
| **Context engine** | ❌ partial | `searchProductDocuments` exists. No "assemble context for task X" pipeline that combines docs + memory + repo state + recent runs. CLI stub `fulcrum product context assemble` exists but is barely wired. |
| **Agent orchestration + manual assign** | ❌ | `agent_runs` table + cancel/retry exist. No "assign task → agent" UI. No agent registry. No agent profile (which CLIs / models, which capabilities). |
| **Auto-orchestration (auto-assign by task type/criteria)** | ❌ | Nothing. No router, no rules, no LLM-as-router, no policy engine. |
| **Skills system following matt-pocock's** | ❌ partial | `claude-plugins/superpowers` skill bundle exists locally. No fetch-fresh-from-matt, no codify-and-load pipeline, no per-skill index, no skill-as-package management. |
| **Workflow per matt-pocock skills repo** | ❌ | Workflow not codified. The session-level "research → plan → grill → execute" is in-conversation only, not enforced. |
| **Multi-user / accounts / collaboration / SaaS** | ❌ | Single hard-coded `default` org. No users table. No roles. No invitations. No real-time presence. No collab cursor. No SaaS-ready API/auth. Schema has `org_id` only, no `user_id` anywhere user-facing. |
| **Default local-only run mode** | ✅ partial | PGlite + FULCRUM_HOME defaults work. But because there's no auth at all, "local-only as a mode of a multi-user product" isn't designed — it's the only mode. |
| **Repo supervision (personal + AI agents)** | ❌ partial | `repos` table exists. No git integration, no clone/sync, no branch/PR view, no diff, no file browser, no per-repo dashboard. Repos surface in CLI only. |
| **Artifacts (first-class)** | ❌ partial | `artifacts` table exists. No upload UI, no preview, no per-task attach, no per-run attach, no diff/history. |
| **"Personal AND AI agent projects, no distinction"** | ❌ | Project schema is human-only — no distinction columns either, but more importantly no semantics differentiating who/what worked the task and how. |
| **Global vs per-project access for memory/context/knowledge** | ❌ | No scoping primitive in UI. The DB has `project_id NULL = global` but no surfaces use this. |
| **Tool-research-first culture** | ❌ | We hand-wrote everything. No research artifact for the web-shell decisions (vite/svelte was given; everything inside was bespoke). |
| **Plan after research with failure gates + 2nd/3rd fallbacks** | ❌ | Existing PRDs don't have "if X fails, fall back to Y" gates. |
| **Editor: live preview, slash commands, wikilinks, embeds, math, diagrams, mentions, collab cursor, comments-on-selection, frontmatter form** | ❌ | None. |
| **Doc taxonomy (per-project / general; per-type)** | ❌ | No surface. |
| **Notifications / activity feed** | ❌ | Events table exists; no feed UI. |
| **Audit log** | ✅ partial | Events table is the audit log; no UI. |
| **Search facets / saved searches** | ❌ | Single-input FTS only. |
| **API / webhooks / integrations** | ❌ | None. |
| **Theming / customization** | ❌ partial | Dark mode toggle. No theming, no per-user preferences. |
| **Accessibility beyond aria-label sweep** | ❌ partial | Aria sweep done. No keyboard-first nav (palette only opens routes). No skip-links. No focus traps. No screen-reader testing. |
| **Schema for future SaaS without rewrite** | ❌ | `org_id` is everywhere but `users`, `org_members`, `roles`, `invitations`, `sessions`, `auth`, `tenant_settings` are not. Migrating later means schema rewrites. |

## What the existing PRDs actually scoped

- **product-kernel** — DB layer. No UX promises beyond CLI.
- **plugin-extension-surface-parity** — package management for skills/MCPs/hooks across 5 agent CLIs. Orthogonal to the product UX.
- **component-lifecycle-management** — installer / lifecycle for vendor packages. Orthogonal.
- **migration-review-remediation** — backfilling foundation gaps from 2026-Q1 audit. Orthogonal.
- **web-shell-product-grade** — was scoped as "polished CRUD UI on top of the kernel" with 9 narrow issues. **NOT scoped** to: block editor, sprints, burndown, memory engine, context assembly UI, orchestration UI, multi-user, skills loader, repo supervision UI. Hence the drift the user surfaced.

## Conclusion

The kernel is solid. The shell is a v0 admin UI sitting on top of it. The user wants a **product**, not an admin UI. The gap is huge but well-defined. Need to:

1. Run the parallel research streams to fill in tool/library recommendations per pillar.
2. Write a fresh **MASTER-PRD** covering all pillars above.
3. Per-pillar PRD with chosen stack + failure gates + fallbacks.
4. Master plan ordering pillars by dependency.
5. Issues + tasks breakdown.
6. `/grill-me` on gray areas (every place this doc says "TBD" or "to discuss").
7. Then — and only then — execute.
