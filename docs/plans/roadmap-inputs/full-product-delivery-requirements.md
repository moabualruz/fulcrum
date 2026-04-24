# Full Product Delivery Requirements Roadmap Input
- Source: /home/mkh/workspace/pi-stack-plan/docs/brainstorms/2026-04-24-agent-os-full-product-delivery-requirements.md

## Must Carry Into Roadmap
- Fulcrum must become a usable local-first CLI agent operating system, not architecture spikes or external-product glue.
- Default product identity: Fulcrum owns canonical local state, task/run lifecycle, policy, graph refs, live events, and operator UX; Plane, Windmill, LightRAG, Zoekt, and LanceDB are managed optional capabilities.
- Install/runtime baseline: one documented install or release artifact, `fulcrum init`, `fulcrum up/down/status/doctor`, local config/data/db/event store/sidecar registry, and no cloud requirement.
- Recovery/cleanup baseline: backup, restore, export, import, rebuild-index, reset, and clean uninstall must be first-class flows.
- Canonical durable records required for workspace, project, task, run, action, artifact, event, policy decision, graph ref, adapter ref, and index state.
- Operator workflow must be complete on first run: create project, create task, start supervised run, stream progress, capture artifact, complete/block run, update task state.
- CLI/TUI/cockpit must cover daily work: task boards, run lists, live run view, context packs, memory import, code index, worktree state, review queue, health, backup, and repair.
- Agent run lifecycle and worktree delivery are core: task claiming, heartbeats, cancellation, completion/failure/blocking, artifacts, event streaming, dirty-state detection, review, merge, conflict resolution, and cleanup.
- Context builder must produce explainable context packs from task state, project docs, markdown memories, exact code hits, symbols/imports, semantic chunks, graph links, and provenance.
- Code intelligence layering: Tree-sitter for AST/symbol/import/chunks, Zoekt for lexical/path/regex, LanceDB for local semantic/hybrid retrieval, with incremental updates on create/update/delete/rename.
- Memory scope: markdown docs and L0 memory docs first; source IDs, provenance, update/delete, and graph-enhanced retrieval required.
- Fulcrum OS graph links memory, code, task, run, action, artifact, policy, and adapter refs while LightRAG retrieval graph remains separate.
- Capability profiles required: `core`, `code`, `memory`, `actions`, and `full`; `core` must boot without optional products.
- Security defaults: no project files, memories, or events sent remotely; remote providers/export/sync explicit opt-in; secrets excluded from indexing/retrieval by default; local endpoints bound locally by default; redaction/purge supported.
- Non-goals: no default cloud dependency, no enterprise/team deployment first, no CLI-agent marketplace/plugin work in first delivery plan, no PDF/Office/multimodal pipeline early or mid-stage, no Plane-first/Windmill-first identity, no generic RAG replacement for code intelligence.

## Milestone Impacts
- Install alpha must prove one-command install, local init, daemon lifecycle, `doctor`, local-only boot, profile selection, clean reset/uninstall, and clean-machine validation.
- Kernel milestone must settle canonical IDs, local database/migrations, event log replay, policy decision attachment, inspectable/recoverable state, and adapter/index references.
- First-run workflow milestone must connect CLI/TUI/cockpit against same state and events for project/task/run/artifact completion.
- Cockpit milestone must be Fulcrum-owned before Plane certification; views must show global/per-project tasks, active runs, blockers, dependencies, handoffs, artifacts, review/merge queues, policy decisions, sidecar health, and live events.
- Runner milestone can start with supervised subprocess/stub runner; specific CLI-agent plugins and external sync remain later optional integrations.
- Worktree milestone must make branch/worktree allocation, attachment, dirty checks, artifact collection, review/merge/conflict cleanup visible in task/run UX.
- Context/code/memory milestone must include markdown memory import/update/delete, incremental code indexing, explainable context pack assembly, and graph refs/provenance.
- Adapter/profile milestone must certify optional products before profile promotion using install, health, offline boot, footprint, ID mapping, CRUD, update/delete semantics, provenance, backup/restore, and user workflow gates.
- Release quality milestone must add `fulcrum validate`, smoke tests, documentation for profiles/dependencies/data locations/cleanup/troubleshooting/privacy, and clean-machine install gate.

## Acceptance Criteria
- User can install Fulcrum, initialize a project, create a task, run supervised local agent/action, see live events, and inspect artifacts within 10 minutes.
- `core` profile boots and remains useful without Plane, Windmill, LightRAG, Zoekt, or LanceDB installed.
- State survives restart; backup/restore preserves tasks, runs, events, artifacts, policy decisions, graph refs, adapter refs, and index state enough for diagnosis/recovery.
- CLI, TUI, and cockpit agree on task/run/health state and use canonical Fulcrum actions/events.
- Operator can complete first-run workflow end to end: create project/task, start run, stream progress, capture artifact, complete or block run, update task.
- Repo indexing is incremental for create/update/delete/rename and supports explainable context packs using exact hits, symbols/imports, semantic chunks, graph links, and provenance.
- Markdown memory folder can be imported, updated, deleted, and recalled with provenance.
- Optional integrations can be enabled/disabled without breaking core or becoming source of truth.
- Policy decisions are visible and attached to affected runs/actions; secret-scan/ignore rules prevent default indexing or retrieval of secrets.
- Clean uninstall removes Fulcrum-managed processes, state, indexes, and sidecars unless user chooses to preserve backups.
- Every milestone has user-visible acceptance tests plus smoke tests for install, init, daemon start/stop, first run, cockpit, code index, memory import, backup/restore, and uninstall.

## Risks / Open Questions
- Exact local database crate and migration mechanism still planning-owned.
- LanceDB Rust/TypeScript integration maturity and fallback need research.
- LightRAG local update/delete/provenance API shape needs research.
- Plane and Windmill local footprint, customization, offline boot, and profile placement need certification before adoption.
- Secret scanning and ignore-rule engine need selection and acceptance gates.
- Optional sidecar runtimes may increase local install complexity, CPU/RAM/disk footprint, and failure modes.
- Event replay scope must be enough for run history and diagnosis without overbuilding full event sourcing.
- Open question: exact clean-machine validation environment and supported Linux/macOS matrix.
- Open question: first target language set for Tree-sitter/code intelligence acceptance.
- Open question: minimum useful supervised subprocess/stub runner contract before CLI-agent-specific integrations.

## Links To Preserve
- Source requirements: `/home/mkh/workspace/pi-stack-plan/docs/brainstorms/2026-04-24-agent-os-full-product-delivery-requirements.md`
- Next planned output from source: `ce:plan` for structured full product delivery planning.
- Commands to preserve in roadmap: `fulcrum init`, `fulcrum up`, `fulcrum down`, `fulcrum status`, `fulcrum doctor`, `fulcrum validate`.
- Capability profiles to preserve: `core`, `code`, `memory`, `actions`, `full`.
- Capability candidates to preserve: Plane as optional PM adapter, Windmill as human-triggered workflow/action adapter, LightRAG as memory graph RAG candidate, Tree-sitter + Zoekt + LanceDB as layered code intelligence.
- System relationship to preserve: Operator -> CLI/TUI/Cockpit -> Fulcrum Kernel -> Local SQLite/Event Log/Supervisor/Worktree/Context -> Code/Memory/Graph -> Optional Sidecars.
