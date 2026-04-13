import { getDb } from './db/client.js'
import type { AgentProfile, AgentRole, WorkspaceStatus } from './types.js'

interface GetWorkspaceStatusInput { workspace_id: string }
interface BuildCosContextInput { workspace_id: string; project_id: string; max_tokens?: number }

const AGENT_PROFILES: AgentProfile[] = [
  { role: 'chief_of_staff', description: 'Plans work, creates teams, dispatches agents, reviews CoS context', can_create_teams: true, can_dispatch_agents: true },
  { role: 'implementer', description: 'Writes code and implements features', can_create_teams: false, can_dispatch_agents: false },
  { role: 'tester', description: 'Writes and runs tests, validates implementations', can_create_teams: false, can_dispatch_agents: false },
  { role: 'reviewer', description: 'Reviews code and provides feedback', can_create_teams: false, can_dispatch_agents: false },
  { role: 'researcher', description: 'Investigates unknowns, gathers information', can_create_teams: false, can_dispatch_agents: false },
  { role: 'planner', description: 'Breaks down epics into tasks and defines acceptance criteria', can_create_teams: false, can_dispatch_agents: false },
]

export async function getWorkspaceStatus(input: GetWorkspaceStatusInput): Promise<WorkspaceStatus> {
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
    "SELECT COUNT(*) as c FROM agent_runs WHERE workspace_id = ? AND status = 'completed' AND date(completed_at) = ?"
  ).get(input.workspace_id, today) as { c: number }).c

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const toRun = (row: any) => ({
    ...row,
    artifacts: row.artifacts ? ((): unknown => { try { return JSON.parse(row.artifacts as string) } catch { return null } })() : null,
  })

  return {
    workspace_id: input.workspace_id,
    running_runs: (running as object[]).map(toRun),
    blocked_runs: (blocked as object[]).map(toRun),
    stale_runs: (stale as object[]).map(toRun),
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

  parts.push(`# Workspace Status — ${input.workspace_id}\n`)
  parts.push(`**WIP:** ${status.wip_count}  **Queued:** ${status.queued_tasks}  **Completed today:** ${status.completed_tasks_today}\n`)

  if (status.running_runs.length > 0) {
    parts.push('\n## Running\n')
    for (const r of status.running_runs) {
      parts.push(`- **${r.role}** (${r.run_id}) — ${r.current_step ?? 'in progress'} (${r.progress_pct}%)\n`)
    }
  }

  if (status.blocked_runs.length > 0) {
    parts.push('\n## Blocked\n')
    for (const r of status.blocked_runs) {
      parts.push(`- **${r.role}** (${r.run_id}) — ${r.output_summary ?? 'no reason given'}\n`)
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

export async function listAgentProfiles(): Promise<AgentProfile[]> {
  return AGENT_PROFILES
}
