import { readFileSync, existsSync } from 'fs'
import { fileURLToPath } from 'url'
import * as pathModule from 'path'
import { getDb } from './db/client.js'
import { rowToRun } from './runs.js'
import { listAgentProfileRows } from './agent-profiles.js'
import type { AgentProfile, WorkspaceStatusResult, AgentRole } from './types.js'

// Resolve the agent-integration/roles/ directory from this file's location.
// packages/core/src/status.ts → packages/core → packages → repo root → agent-integration/roles
function resolveRolesDir(): string | null {
  try {
    const here = pathModule.dirname(fileURLToPath(import.meta.url))
    // Walk up 3 levels: src → core → packages → repo root
    const root = pathModule.resolve(here, '..', '..', '..')
    const candidate = pathModule.join(root, 'agent-integration', 'roles')
    if (existsSync(candidate)) return candidate
    // Fallback: walk up 4 levels in case this file is built to dist/
    const rootAlt = pathModule.resolve(here, '..', '..', '..', '..')
    const candidateAlt = pathModule.join(rootAlt, 'agent-integration', 'roles')
    return existsSync(candidateAlt) ? candidateAlt : null
  } catch {
    return null
  }
}

const ROLES_DIR = resolveRolesDir()

/** Parse the first "## Purpose" paragraph from a role MD file. */
function loadRolePurpose(role: string): string | null {
  if (!ROLES_DIR) return null
  const p = pathModule.join(ROLES_DIR, `${role}.md`)
  if (!existsSync(p)) return null
  try {
    const content = readFileSync(p, 'utf8')
    // Match "## Purpose\n\n{paragraph}" up to the next "##" or end of file
    const match = content.match(/##\s+Purpose\s*\n+([^\n][\s\S]*?)(?=\n##|\n*$)/)
    return match ? match[1].trim() : null
  } catch {
    return null
  }
}

interface GetWorkspaceStatusInput { workspace_id: string }
interface BuildCosContextInput { workspace_id: string; project_id: string; max_tokens?: number }

const AGENT_PROFILES: AgentProfile[] = [
  { role: 'chief_of_staff',          description: 'Plans work, creates teams, dispatches agents, reviews CoS context',   can_create_teams: true,  can_dispatch_agents: true  },
  { role: 'context_gatherer',        description: 'Gathers context about codebase, requirements, and environment',       can_create_teams: false, can_dispatch_agents: false },
  { role: 'prd_planner',             description: 'Writes Product Requirements Documents from high-level specs',         can_create_teams: false, can_dispatch_agents: false },
  { role: 'implementation_planner',  description: 'Breaks PRDs and epics into detailed implementation plans',            can_create_teams: false, can_dispatch_agents: false },
  { role: 'issue_decomposer',        description: 'Decomposes issues into atomic tasks with acceptance criteria',        can_create_teams: false, can_dispatch_agents: false },
  { role: 'architecture_reviewer',   description: 'Reviews architectural decisions and system design',                   can_create_teams: false, can_dispatch_agents: false },
  { role: 'research_worker',         description: 'Investigates unknowns, evaluates libraries and approaches',          can_create_teams: false, can_dispatch_agents: false },
  { role: 'software_engineer',       description: 'Implements features, APIs, data layers, and UI across the stack',    can_create_teams: false, can_dispatch_agents: false },
  { role: 'refactor_worker',         description: 'Improves code quality, reduces duplication, applies patterns',       can_create_teams: false, can_dispatch_agents: false },
  { role: 'browser_worker',          description: 'Performs browser automation, web scraping, and UI testing',          can_create_teams: false, can_dispatch_agents: false },
  { role: 'data_engineer',           description: 'Builds data pipelines, ETL, and data infrastructure',                can_create_teams: false, can_dispatch_agents: false },
  { role: 'ml_engineer',             description: 'Trains models, builds ML pipelines and evaluation tooling',          can_create_teams: false, can_dispatch_agents: false },
  { role: 'devops_engineer',         description: 'Manages infrastructure, CI/CD, and deployment pipelines',            can_create_teams: false, can_dispatch_agents: false },
  { role: 'qa_engineer',             description: 'Writes and runs tests, validates implementations against acceptance criteria', can_create_teams: false, can_dispatch_agents: false },
  { role: 'code_reviewer',           description: 'Reviews pull requests, provides structured feedback and approval',    can_create_teams: false, can_dispatch_agents: false },
  { role: 'security_reviewer',       description: 'Audits code for security vulnerabilities and policy violations',      can_create_teams: false, can_dispatch_agents: false },
  { role: 'integration_worker',      description: 'Merges worktrees, resolves conflicts, coordinates cross-team deps',  can_create_teams: false, can_dispatch_agents: false },
  { role: 'documentation_writer',    description: 'Writes and updates technical documentation and READMEs',              can_create_teams: false, can_dispatch_agents: false },
  { role: 'memory_curator',          description: 'Curates and prunes the memory vault, promotes operational memories', can_create_teams: false, can_dispatch_agents: false },
  { role: 'tech_lead',               description: 'Provides technical leadership, unblocks engineers, owns architecture', can_create_teams: false, can_dispatch_agents: false },
  { role: 'product_manager',         description: 'Manages roadmap, prioritises work, writes PRDs and success criteria', can_create_teams: false, can_dispatch_agents: false },
  { role: 'analyst',                 description: 'Analyses data, generates reports, and surfaces insights',             can_create_teams: false, can_dispatch_agents: false },
  { role: 'orchestrator',            description: 'Generic sub-orchestrator for parallelising multi-agent work',         can_create_teams: false, can_dispatch_agents: false },
  { role: 'custom',                  description: 'Custom agent role defined per-workspace',                             can_create_teams: false, can_dispatch_agents: false },
]

export async function getWorkspaceStatus(input: GetWorkspaceStatusInput): Promise<WorkspaceStatusResult> {
  const db = getDb()

  const running = db.prepare(
    "SELECT * FROM agent_runs WHERE workspace_id = ? AND status = 'running' ORDER BY started_at DESC"
  ).all(input.workspace_id)

  const blocked = db.prepare(
    "SELECT * FROM agent_runs WHERE workspace_id = ? AND status = 'blocked' ORDER BY updated_at ASC"
  ).all(input.workspace_id)

  const stale = db.prepare(
    "SELECT * FROM agent_runs WHERE workspace_id = ? AND status = 'stale' ORDER BY updated_at ASC"
  ).all(input.workspace_id)

  const queued = (db.prepare(
    "SELECT COUNT(*) as c FROM tasks WHERE workspace_id = ? AND status = 'queued'"
  ).get(input.workspace_id) as { c: number }).c

  const today = new Date().toISOString().slice(0, 10)
  const completedToday = (db.prepare(
    "SELECT COUNT(*) as c FROM agent_runs WHERE workspace_id = ? AND status = 'finished' AND date(finished_at) = ?"
  ).get(input.workspace_id, today) as { c: number }).c

  return {
    workspace_id: input.workspace_id,
    running_runs: (running as Record<string, unknown>[]).map(rowToRun),
    blocked_runs: (blocked as Record<string, unknown>[]).map(rowToRun),
    stale_runs: (stale as Record<string, unknown>[]).map(rowToRun),
    wip_count: running.length,
    queued_tasks: queued,
    completed_tasks_today: completedToday,
  }
}

export async function buildCosContext(input: BuildCosContextInput): Promise<string> {
  const db = getDb()
  const maxChars = (input.max_tokens ?? 4000) * 4 // ~4 chars per token
  const parts: string[] = []

  const status = await getWorkspaceStatus({ workspace_id: input.workspace_id })

  const projectQueued = (db.prepare(
    "SELECT COUNT(*) as c FROM tasks WHERE workspace_id = ? AND project_id = ? AND status = 'queued'"
  ).get(input.workspace_id, input.project_id) as { c: number }).c

  // Project-scoped run views for CoS context
  const projectRunning = (db.prepare(`
    SELECT r.* FROM agent_runs r
    JOIN tasks t ON t.task_id = r.task_id
    WHERE r.workspace_id = ? AND t.project_id = ? AND r.status = 'running'
    ORDER BY r.started_at DESC
  `).all(input.workspace_id, input.project_id) as Record<string, unknown>[]).map(rowToRun)

  const projectBlocked = (db.prepare(`
    SELECT r.* FROM agent_runs r
    JOIN tasks t ON t.task_id = r.task_id
    WHERE r.workspace_id = ? AND t.project_id = ? AND r.status = 'blocked'
    ORDER BY r.updated_at ASC
  `).all(input.workspace_id, input.project_id) as Record<string, unknown>[]).map(rowToRun)

  parts.push(`# Workspace Status — ${input.workspace_id}\n`)
  parts.push(`**WIP:** ${status.wip_count}  **Queued (project):** ${projectQueued}  **Completed today:** ${status.completed_tasks_today}\n`)

  if (projectRunning.length > 0) {
    parts.push('\n## Running\n')
    for (const r of projectRunning) {
      parts.push(`- **${r.role}** (${r.run_id}) — ${r.current_step ?? 'in progress'} (${r.progress_pct}%)\n`)
    }
  }

  if (projectBlocked.length > 0) {
    parts.push('\n## Blocked\n')
    for (const r of projectBlocked) {
      parts.push(`- **${r.role}** (${r.run_id}) — ${r.blocker ?? 'no reason given'}\n`)
    }
  }

  // Recent memories — trim to fit token budget
  const remaining = maxChars - parts.join('').length
  if (remaining > 200) {
    const memories = db.prepare(
      'SELECT content FROM memories WHERE workspace_id = ? AND project_id = ? ORDER BY last_accessed_at DESC LIMIT 10'
    ).all(input.workspace_id, input.project_id) as { content: string }[]

    if (memories.length > 0) {
      parts.push('\n## Recent Memory\n')
      let memChars = 0
      for (const m of memories) {
        const entry = `- ${m.content}\n`
        if (memChars + entry.length > remaining - 100) break
        parts.push(entry)
        memChars += entry.length
      }
    }
  }

  return parts.join('').slice(0, maxChars)
}

interface ListAgentProfilesInput {
  workspace_id?: string
}

export async function listAgentProfiles(
  input?: ListAgentProfilesInput,
): Promise<AgentProfile[]> {
  // 1. Hardcoded profiles — prefer each role's "Purpose" section from
  //    agent-integration/roles/<role>.md, fall back to the hardcoded description.
  const hardcoded: AgentProfile[] = AGENT_PROFILES.map(profile => {
    const fromMd = loadRolePurpose(profile.role)
    const base = fromMd ? { ...profile, description: fromMd } : profile
    return { ...base, source: 'hardcoded' as const }
  })

  // 2. DB-backed profiles for the given workspace (if one was provided).
  //    When no workspace_id is passed we preserve the original behaviour
  //    (hardcoded only) so existing callers remain unchanged.
  if (!input?.workspace_id) return hardcoded

  const rows = await listAgentProfileRows(input.workspace_id)
  const dbProfiles: AgentProfile[] = rows.map(row => ({
    role: row.base_role as AgentRole,
    description: row.description,
    can_create_teams: false,
    can_dispatch_agents: false,
    source: 'db' as const,
    profile_id: row.profile_id,
    name: row.name,
  }))

  return [...hardcoded, ...dbProfiles]
}
