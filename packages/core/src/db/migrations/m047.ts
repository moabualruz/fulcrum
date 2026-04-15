import type Database from 'better-sqlite3'

// MIGRATION_047 — agent_definitions: enrich descriptions for all 24 built-in roles.
//
// GAP-AGENTDEF-8: Built-in role descriptions are single-sentence stubs with
// minimal routing signal. Routing agents (chief_of_staff, orchestrator) need
// structured descriptions to dispatch correctly. This migration updates each
// description to follow the pattern:
//   "Primary purpose. When to use. Key outputs."
//
// Only updates rows where the description still matches the original seed value
// (preserves operator customisations).
export function runM047(db: Database.Database): void {
  const already = db.prepare("SELECT id FROM schema_migrations WHERE name = '047_agent_definitions_enrich_descriptions'").get()
  if (already) return

  const now = Math.floor(Date.now() / 1000)

  // Pairs of [role, original_description, new_description].
  // We only UPDATE if the description still matches the original seed so that
  // operator customisations are not overwritten.
  const updates: Array<{ role: string; from: string; to: string }> = [
    {
      role: 'chief_of_staff',
      from: 'Plans work, creates teams, dispatches agents, reviews CoS context',
      to:   'Orchestrates multi-agent workflows from a high-level goal. Use when a task requires delegation across multiple specialist roles, team formation, or sequential planning. Reads workspace status, creates tasks, invokes teams, and synthesises results. Does NOT write code or edit files. Outputs: delegated task set, CoS context summary, team invocation.',
    },
    {
      role: 'context_gatherer',
      from: 'Gathers context about codebase, requirements, and environment',
      to:   'Collects and summarises codebase context, requirements documents, and runtime environment details before implementation begins. Use when an engineer needs orientation on an unfamiliar module or when a plan requires understanding existing architecture. Outputs: context summary, relevant file list, dependency graph excerpt.',
    },
    {
      role: 'prd_planner',
      from: 'Writes Product Requirements Documents from high-level specs',
      to:   'Translates business goals into structured Product Requirements Documents. Use when a feature idea needs developer-ready specs before implementation begins. Produces user stories, acceptance criteria, non-functional requirements, and success metrics. Outputs: PRD document, prioritised epic list.',
    },
    {
      role: 'implementation_planner',
      from: 'Breaks PRDs and epics into detailed implementation plans',
      to:   'Converts a PRD or epic into an ordered, dependency-aware implementation plan. Use after PRD sign-off and before engineering begins. Decomposes scope into atomic tasks, assigns roles, and identifies risk. Outputs: task breakdown with assigned_to fields, dependency graph, effort estimates.',
    },
    {
      role: 'issue_decomposer',
      from: 'Decomposes issues into atomic tasks with acceptance criteria',
      to:   'Breaks a high-level GitHub/Linear issue into concrete subtasks with explicit acceptance criteria and role assignments. Use when a single issue is too large for one engineer and needs parallelisation. Outputs: subtask list with done_criteria, role assignments, and priority.',
    },
    {
      role: 'architecture_reviewer',
      from: 'Reviews architectural decisions and system design',
      to:   'Evaluates system design decisions, interface contracts, and cross-cutting concerns before implementation is committed. Use when a change touches module boundaries, introduces new dependencies, or has performance/security implications. Outputs: review verdict (approve / request_changes), list of concerns, recommended alternatives.',
    },
    {
      role: 'research_worker',
      from: 'Investigates unknowns, evaluates libraries and approaches',
      to:   'Investigates technical unknowns by surveying documentation, benchmarks, and codebase state. Use when an implementation decision requires evidence (library comparison, API surface, performance data). Outputs: research summary with recommendation, pros/cons table, reference links.',
    },
    {
      role: 'software_engineer',
      from: 'Implements features, APIs, data layers, and UI across the stack',
      to:   'Writes production code across the full stack: APIs, data models, business logic, and UI. Use for any task that requires creating or modifying source files, running tests, and committing working code. Outputs: working implementation, passing tests, artifact paths.',
    },
    {
      role: 'refactor_worker',
      from: 'Improves code quality, reduces duplication, applies patterns',
      to:   'Improves internal code structure without changing external behaviour. Use when addressing tech debt, reducing coupling, or applying design patterns to an existing module. Operates on a separate worktree and never changes public API contracts without prior approval. Outputs: refactored files, updated tests, diff summary.',
    },
    {
      role: 'browser_worker',
      from: 'Performs browser automation, web scraping, and UI testing',
      to:   'Controls a real browser to automate UI interactions, run end-to-end tests, or scrape web content. Use for tasks requiring JavaScript execution, DOM inspection, or multi-page flows that CLI tools cannot reach. Outputs: screenshots, scraped data, test pass/fail report.',
    },
    {
      role: 'data_engineer',
      from: 'Builds data pipelines, ETL, and data infrastructure',
      to:   'Designs and implements data pipelines, ETL jobs, schema migrations, and analytics infrastructure. Use when work involves large-scale data movement, warehouse schema design, or streaming systems. Outputs: pipeline code, schema definitions, run logs.',
    },
    {
      role: 'ml_engineer',
      from: 'Trains models, builds ML pipelines and evaluation tooling',
      to:   'Builds and trains machine learning models, feature engineering pipelines, and evaluation harnesses. Use for tasks involving model selection, training runs, hyperparameter tuning, or inference serving. Outputs: trained model artifacts, evaluation metrics, training script.',
    },
    {
      role: 'devops_engineer',
      from: 'Manages infrastructure, CI/CD, and deployment pipelines',
      to:   'Designs and operates cloud infrastructure, CI/CD pipelines, container orchestration, and deployment automation. Use when work involves provisioning, scaling, monitoring, or release management. Outputs: infrastructure-as-code, pipeline config, deployment runbook.',
    },
    {
      role: 'qa_engineer',
      from: 'Writes and runs tests, validates implementations against acceptance criteria',
      to:   'Writes and executes tests across unit, integration, and end-to-end tiers. Validates that implementations satisfy acceptance criteria before a task is marked done. Use after a software_engineer completes a feature or fix. Outputs: test suite, coverage report, pass/fail verdict.',
    },
    {
      role: 'code_reviewer',
      from: 'Reviews pull requests, provides structured feedback and approval',
      to:   'Reviews code changes across five axes: correctness, readability, architecture, security, and performance. Use before any change is merged to the main branch. Provides structured comments categorised as Critical, Important, or Nit. Outputs: review verdict (approve / request_changes), comment list.',
    },
    {
      role: 'security_reviewer',
      from: 'Audits code for security vulnerabilities and policy violations',
      to:   'Audits code changes for OWASP-class vulnerabilities, secrets exposure, injection risks, and policy violations. Use before merging changes to authentication, data storage, API boundaries, or infrastructure. Outputs: findings list with severity, verdict (approved / requires_changes / blocked), critical count.',
    },
    {
      role: 'integration_worker',
      from: 'Merges worktrees, resolves conflicts, coordinates cross-team deps',
      to:   'Merges feature branches and worktrees into the integration target after code review and tests pass. Resolves conflicts, validates the merged state, and coordinates cross-team dependencies. Use only after code_reviewer approval and qa_engineer pass. Outputs: merge commit SHA, conflict resolution log, test summary.',
    },
    {
      role: 'documentation_writer',
      from: 'Writes and updates technical documentation and READMEs',
      to:   'Authors and maintains technical documentation including READMEs, API references, architecture docs, and runbooks. Use after feature implementation is complete or when a new system needs onboarding material. Outputs: markdown files, updated doc index, changelog entry.',
    },
    {
      role: 'memory_curator',
      from: 'Curates and prunes the memory vault, promotes operational memories',
      to:   'Consolidates session memories into durable knowledge, removes duplicates, and promotes high-value operational memories for long-term retention. Use at session end or when the memory vault grows stale. Outputs: pruned memory count, promoted entries list, compaction summary.',
    },
    {
      role: 'tech_lead',
      from: 'Provides technical leadership, unblocks engineers, owns architecture',
      to:   'Provides technical leadership across a project: resolves design disputes, unblocks engineers, maintains architectural consistency, and owns cross-cutting quality standards. Use when an implementation decision requires senior technical judgment or when multiple engineers are blocked on a dependency. Outputs: decision record, unblock action, architectural guidance.',
    },
    {
      role: 'product_manager',
      from: 'Manages roadmap, prioritises work, writes PRDs and success criteria',
      to:   'Owns the product roadmap, prioritises the task backlog, and translates stakeholder needs into actionable requirements. Use when deciding what to build next, writing PRDs, or evaluating scope trade-offs. Outputs: prioritised backlog, PRD, success metrics, release notes.',
    },
    {
      role: 'analyst',
      from: 'Analyses data, generates reports, and surfaces insights',
      to:   'Analyses datasets, run queries, and generates reports that surface actionable insights. Use when a decision requires data evidence (usage metrics, performance data, A/B results, cost analysis). Outputs: analysis report, visualisation data, recommendation.',
    },
    {
      role: 'orchestrator',
      from: 'Generic sub-orchestrator for parallelising multi-agent work',
      to:   'Generic sub-orchestrator for parallelising independent tasks across specialist roles within a larger workflow. Use when a chief_of_staff needs to fan out work to multiple agents concurrently and collect results. Not a replacement for chief_of_staff — operates within a bounded scope. Outputs: delegated run IDs, aggregated results.',
    },
    {
      role: 'custom',
      from: 'Custom agent role defined per-workspace',
      to:   'Workspace-specific agent role with operator-defined purpose, system prompt, and tool allowlist. Use when none of the 23 built-in roles fit the task. Configure via agent_definitions DB record or .agent.json file in agent-integration/agent-defs/.',
    },
  ]

  const stmt = db.prepare(`
    UPDATE agent_definitions SET description = ?, updated_at = ?
    WHERE role = ? AND description = ?
  `)

  for (const u of updates) {
    stmt.run(u.to, now, u.role, u.from)
  }

  db.prepare("INSERT OR IGNORE INTO schema_migrations (name) VALUES ('047_agent_definitions_enrich_descriptions')").run()
}
