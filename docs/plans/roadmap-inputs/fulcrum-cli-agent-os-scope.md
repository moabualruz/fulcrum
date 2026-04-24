# Fulcrum CLI Agent OS Scope Roadmap Input
- Source: /home/mkh/workspace/pi-stack-plan/docs/plans/2026-04-24-fulcrum-cli-agent-os-scope.md

## Must Carry Into Roadmap
- Product definition: Fulcrum is a local-first CLI agent operating system for one operator, many projects, and many CLI agents.
- North star: local agent OS plus personal Linear/Jira/GitHub Projects, live agent operations center, memory/code intelligence graph, and worktree delivery system.
- Fulcrum owns the work operating model; external PM tools are optional sources/sinks, not the system of record.
- Canonical domains: kernel/state, memory, code intelligence, memory-code-PM graph, owned PM cockpit, agent orchestration, worktree delivery, policy/governance, monitor/reporting, action interface, optional sync, telemetry.
- Required operator surfaces: CLI for direct control, TUI for terminal cockpit, web dashboard for PM/orchestration, agent-facing APIs for context/search/work/progress/artifacts.
- Non-goals for near-term scope: CLI-agent-specific integrations, plugins, extension packaging, runtime fanout, and making sync with Jira/Linear/GitHub/Plane core architecture.
- Architecture principles: stable IDs, durable local SQLite state, workspace/project isolation, visible task/run state for every agent action, first-class artifacts/handoffs, policy-gated execution, event/audit trails, incremental memory/code/graph updates.

## Milestone Impacts
- M1 Kernel and model: settle canonical entities, IDs, state ownership, migrations, project/workspace isolation, task/run lifecycle, event model, and canonical/derived/ephemeral data boundaries.
- M2 PM cockpit: deliver minimum daily-use global and per-project boards with epics/issues/tasks/plans, blockers/dependencies, assigned agents, queues, artifacts, handoffs, and live activity.
- M3 Agent orchestration: map all agent work to tasks/runs, expose team/slot/workflow state, stream actions into monitor/cockpit, and make decisions explainable after the fact.
- M4 Memory and code intelligence: keep L0 canonical, support incremental updates, add exact/path/string/symbol/dependency/semantic search, hybrid ranking, source/confidence explanations, and stale index cleanup.
- M5 Unified graph: link memories, tasks, plans, issues, files, symbols, chunks, agent runs, artifacts, imports, and dependencies without relying on periodic full rebuilds.
- M6 Worktree delivery: integrate branch/worktree lifecycle, artifacts, review records, conflict handling, and merge queue into cockpit and task/run views.
- M7 Governance/observability: gate actions with policy, surface denials and rule reasons, connect telemetry spans to tasks/runs/artifacts/policy events, and show system health.
- M8 External bridges: demote sync to explicit import/export or agent-task workflows after owned PM model is stable.

## Acceptance Criteria
- Fulcrum can run fully local without external PM tools or fixed agent runtimes.
- Operator can see global and per-project work, assign/delegate tasks, watch active agents, inspect context, review outputs, manage queues, and understand decisions.
- Every agent action has visible task/run state, streamed events, durable history, and inspectable artifacts/handoffs.
- PM cockpit exposes blockers, dependencies, review queues, merge queues, current live activity, failed runs, and policy denials.
- Memory retrieval explains source and confidence; normal edits do not require full rebuild.
- Code intelligence supports exact identifier, path/filename, string/error, AST/symbol, import/dependency, semantic chunk, and hybrid search.
- Graph queries can connect decisions/plans/tasks/issues to files/symbols/chunks/agent actions and stay correct after changes.
- CLI, TUI, dashboard, MCP-compatible surfaces, and control APIs call the same canonical actions and emit events/audit trails.
- Policy blocks unsafe actions, protects secrets, and reports exact rule/action context.
- Telemetry traces orchestration decisions, run steps, indexing/retrieval, artifacts, and policy events.

## Risks / Open Questions
- Kernel boundary unclear: which responsibilities belong in core versus higher modules?
- Memory/code boundary unclear: keep code intelligence inside memory or split into a separate package/module?
- Graph shape unresolved: one unified graph across memory/code/PM/events or separate graphs with shared IDs?
- Minimum viable PM cockpit needs definition for daily use.
- Live agent action stream needs product definition: what level of detail is useful without becoming noise?
- First-class PM actions need prioritization across CLI/TUI/web/API.
- Current package boundaries may not fit OS framing; roadmap should include package-boundary review.
- Global multi-project scope may require schema/UI changes beyond existing per-project assumptions.
- Incremental graph/index correctness is high risk if delete/rename/change propagation is incomplete.
- External sync can distort product model if introduced before owned PM model is stable.

## Links To Preserve
- Source scope doc: `/home/mkh/workspace/pi-stack-plan/docs/plans/2026-04-24-fulcrum-cli-agent-os-scope.md`
- Core packages/domains: `packages/core`, `packages/memory`, `packages/planning`, `packages/monitor`, `packages/worktrees`, `packages/workflows`, `packages/teams`, `packages/worker`, `packages/policy`, `packages/cli`, `packages/sync`
- Preserve module names in roadmap: Core OS Kernel, Memory OS, Code Intelligence, Memory-Code Graph, Owned PM Cockpit, Agent Orchestration, Worktree Delivery System, Policy / Governance, Dashboard / Monitoring / Reporting, Action Orchestration Interface, Optional External Sync / Import-Export, Telemetry
- Preserve core principle: `Fulcrum = local source of operational truth`; `External PM tools = optional bridges`; `Agent runtimes = replaceable workers`; `Memory/code graph = owned intelligence layer`; `Dashboards = owned operator interface`
