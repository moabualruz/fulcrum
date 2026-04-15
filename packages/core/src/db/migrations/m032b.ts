import type Database from 'better-sqlite3'

// MIGRATION_032b — seed canonical agent_definitions rows (24 built-in roles).
// Runs once; uses INSERT OR IGNORE so re-running is safe.
export function runM032b(db: Database.Database): void {
  const already = db.prepare("SELECT id FROM schema_migrations WHERE name = '032b_seed_agent_definitions'").get()
  if (!already) {
    const seedId = (role: string) => `agentdef_builtin_${role.replace(/_/g, '')}`
    const now = Math.floor(Date.now() / 1000)
    const builtins: Array<{ role: string; display_name: string; description: string; capabilities: string }> = [
      { role: 'chief_of_staff',         display_name: 'Chief of Staff',         description: 'Plans work, creates teams, dispatches agents, reviews CoS context',   capabilities: '["create_teams","dispatch_agents"]' },
      { role: 'context_gatherer',        display_name: 'Context Gatherer',        description: 'Gathers context about codebase, requirements, and environment',       capabilities: '[]' },
      { role: 'prd_planner',             display_name: 'PRD Planner',             description: 'Writes Product Requirements Documents from high-level specs',         capabilities: '[]' },
      { role: 'implementation_planner',  display_name: 'Implementation Planner',  description: 'Breaks PRDs and epics into detailed implementation plans',            capabilities: '[]' },
      { role: 'issue_decomposer',        display_name: 'Issue Decomposer',        description: 'Decomposes issues into atomic tasks with acceptance criteria',        capabilities: '[]' },
      { role: 'architecture_reviewer',   display_name: 'Architecture Reviewer',   description: 'Reviews architectural decisions and system design',                   capabilities: '[]' },
      { role: 'research_worker',         display_name: 'Research Worker',         description: 'Investigates unknowns, evaluates libraries and approaches',          capabilities: '[]' },
      { role: 'software_engineer',       display_name: 'Software Engineer',       description: 'Implements features, APIs, data layers, and UI across the stack',    capabilities: '["write_code","edit_files","run_tests"]' },
      { role: 'refactor_worker',         display_name: 'Refactor Worker',         description: 'Improves code quality, reduces duplication, applies patterns',       capabilities: '["write_code","edit_files"]' },
      { role: 'browser_worker',          display_name: 'Browser Worker',          description: 'Performs browser automation, web scraping, and UI testing',          capabilities: '["browser"]' },
      { role: 'data_engineer',           display_name: 'Data Engineer',           description: 'Builds data pipelines, ETL, and data infrastructure',                capabilities: '["write_code","edit_files"]' },
      { role: 'ml_engineer',             display_name: 'ML Engineer',             description: 'Trains models, builds ML pipelines and evaluation tooling',          capabilities: '["write_code","edit_files"]' },
      { role: 'devops_engineer',         display_name: 'DevOps Engineer',         description: 'Manages infrastructure, CI/CD, and deployment pipelines',            capabilities: '["write_code","edit_files"]' },
      { role: 'qa_engineer',             display_name: 'QA Engineer',             description: 'Writes and runs tests, validates implementations against acceptance criteria', capabilities: '["write_code","run_tests"]' },
      { role: 'code_reviewer',           display_name: 'Code Reviewer',           description: 'Reviews pull requests, provides structured feedback and approval',    capabilities: '[]' },
      { role: 'security_reviewer',       display_name: 'Security Reviewer',       description: 'Audits code for security vulnerabilities and policy violations',      capabilities: '[]' },
      { role: 'integration_worker',      display_name: 'Integration Worker',      description: 'Merges worktrees, resolves conflicts, coordinates cross-team deps',  capabilities: '["write_code","edit_files"]' },
      { role: 'documentation_writer',    display_name: 'Documentation Writer',    description: 'Writes and updates technical documentation and READMEs',              capabilities: '["write_code","edit_files"]' },
      { role: 'memory_curator',          display_name: 'Memory Curator',          description: 'Curates and prunes the memory vault, promotes operational memories', capabilities: '[]' },
      { role: 'tech_lead',               display_name: 'Tech Lead',               description: 'Provides technical leadership, unblocks engineers, owns architecture', capabilities: '[]' },
      { role: 'product_manager',         display_name: 'Product Manager',         description: 'Manages roadmap, prioritises work, writes PRDs and success criteria', capabilities: '[]' },
      { role: 'analyst',                 display_name: 'Analyst',                 description: 'Analyses data, generates reports, and surfaces insights',             capabilities: '[]' },
      { role: 'orchestrator',            display_name: 'Orchestrator',            description: 'Generic sub-orchestrator for parallelising multi-agent work',         capabilities: '["dispatch_agents"]' },
      { role: 'custom',                  display_name: 'Custom',                  description: 'Custom agent role defined per-workspace',                             capabilities: '[]' },
    ]
    const stmt = db.prepare(`
      INSERT OR IGNORE INTO agent_definitions
        (id, role, display_name, description, version, stability, capabilities, created_at, updated_at)
      VALUES (?, ?, ?, ?, '0.1.0', 'stable', ?, ?, ?)
    `)
    for (const b of builtins) {
      stmt.run(seedId(b.role), b.role, b.display_name, b.description, b.capabilities, now, now)
    }
    db.prepare("INSERT OR IGNORE INTO schema_migrations (name) VALUES ('032b_seed_agent_definitions')").run()
  }
}
