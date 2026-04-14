// packages/teams/src/teams.ts
import { getDb, nextDisplayId, FulcrumError, canInvokeTeams, newId } from '@fulcrum/core'
import type {
  TeamTemplate,
  TeamInstance,
  TeamStatus,
  TeamPolicy,
  CreateTeamTemplateInput,
  InvokeTeamInput,
  HeartbeatTeamInput,
  CompleteTeamInput,
  ListTeamInstancesInput,
  GetTeamStatusInput,
  TeamSlot,
} from './types.js'
import { canStartTeam } from './scheduler.js'

// ── helpers ────────────────────────────────────────────────────────────────

function rowToTemplate(row: Record<string, unknown>): TeamTemplate {
  return {
    template_id: row['template_id'] as string,
    name: row['name'] as string,
    description: (row['description'] as string | null) ?? undefined,
    slots: JSON.parse(row['slots'] as string) as TeamSlot[],
    policy: JSON.parse((row['policy'] as string | null) ?? '{}') as TeamPolicy,
    created_at: row['created_at'] as string,
    updated_at: row['updated_at'] as string,
  }
}

function rowToInstance(row: Record<string, unknown>): TeamInstance {
  return {
    instance_id: row['instance_id'] as string,
    template_id: row['template_id'] as string,
    workspace_id: row['workspace_id'] as string,
    project_id: (row['project_id'] as string | null) ?? undefined,
    display_id: row['display_id'] as string,
    status: row['status'] as TeamInstance['status'],
    status_category: row['status_category'] as TeamInstance['status_category'],
    purpose: row['purpose'] as string,
    task_id: (row['task_id'] as string | null) ?? undefined,
    created_by_agent_id: row['created_by_agent_id'] as string,
    resolved_slots: JSON.parse(row['resolved_slots'] as string) as Record<string, string[]>,
    version: row['version'] as number,
    created_at: row['created_at'] as string,
    updated_at: row['updated_at'] as string,
  }
}

// ── public API ─────────────────────────────────────────────────────────────

export async function createTeamTemplate(input: CreateTeamTemplateInput): Promise<TeamTemplate> {
  const db = getDb()
  const template_id = newId('team')
  const now = new Date().toISOString()
  const slotsJson = JSON.stringify(input.slots)
  const policyJson = JSON.stringify(input.policy ?? {})

  db.prepare(
    `INSERT INTO team_templates(template_id, name, description, slots, policy, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(template_id, input.name, input.description ?? null, slotsJson, policyJson, now, now)

  const row = db.prepare(`SELECT * FROM team_templates WHERE template_id = ?`).get(template_id) as Record<string, unknown>
  return rowToTemplate(row)
}

export async function invokeTeam(input: InvokeTeamInput): Promise<TeamInstance> {
  if (!canInvokeTeams(input.caller_role)) {
    throw new Error('POLICY_DENIED: only chief_of_staff may invoke teams')
  }

  const db = getDb()

  const decision = canStartTeam(db, {
    workspace_id: input.workspace_id,
    project_id: input.project_id,
    template_id: input.template_id,
  })
  if (!decision.allowed) {
    throw new FulcrumError(decision.reason ?? 'team concurrency cap reached', 'rate_limited')
  }

  const instance_id = newId('team_instance')
  const now = new Date().toISOString()
  const display_id = nextDisplayId('team', input.project_id ?? input.workspace_id, db)
  const resolved_slots = JSON.stringify(input.initial_slots ?? {})

  db.prepare(
    `INSERT INTO team_instances(
       instance_id, template_id, workspace_id, project_id, display_id,
       status, status_category, purpose, task_id, created_by_agent_id,
       resolved_slots, version, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, 'created', 'active', ?, ?, ?, ?, 0, ?, ?)`
  ).run(
    instance_id,
    input.template_id,
    input.workspace_id,
    input.project_id ?? null,
    display_id,
    input.purpose,
    input.task_id ?? null,
    input.caller_agent_id,
    resolved_slots,
    now,
    now
  )

  const row = db.prepare(`SELECT * FROM team_instances WHERE instance_id = ?`).get(instance_id) as Record<string, unknown>
  return rowToInstance(row)
}

export async function heartbeatTeam(input: HeartbeatTeamInput): Promise<TeamInstance> {
  const db = getDb()
  const now = new Date().toISOString()

  let changes: number
  if (input.resolved_slots !== undefined) {
    const result = db.prepare(
      `UPDATE team_instances
       SET status = ?, resolved_slots = ?, version = version + 1, updated_at = ?
       WHERE instance_id = ?`
    ).run(input.status, JSON.stringify(input.resolved_slots), now, input.instance_id)
    changes = result.changes
  } else {
    const result = db.prepare(
      `UPDATE team_instances
       SET status = ?, version = version + 1, updated_at = ?
       WHERE instance_id = ?`
    ).run(input.status, now, input.instance_id)
    changes = result.changes
  }

  if (changes === 0) {
    throw new FulcrumError(`Team instance not found: ${input.instance_id}`, 'not_found')
  }

  const row = db.prepare(`SELECT * FROM team_instances WHERE instance_id = ?`).get(input.instance_id) as Record<string, unknown>
  return rowToInstance(row)
}

export async function completeTeam(input: CompleteTeamInput): Promise<TeamInstance> {
  const db = getDb()
  const now = new Date().toISOString()

  // failed → blocked; completed and cancelled → done
  const status_category = input.final_status === 'failed' ? 'blocked' : 'done'

  const result = db.prepare(
    `UPDATE team_instances
     SET status = ?, status_category = ?, version = version + 1, updated_at = ?
     WHERE instance_id = ?`
  ).run(input.final_status, status_category, now, input.instance_id)

  if (result.changes === 0) {
    throw new FulcrumError(`Team instance not found: ${input.instance_id}`, 'not_found')
  }

  const row = db.prepare(`SELECT * FROM team_instances WHERE instance_id = ?`).get(input.instance_id) as Record<string, unknown>
  return rowToInstance(row)
}

export interface ListTeamTemplatesInput {
  limit?: number
  offset?: number
}

export async function listTeamTemplates(input: ListTeamTemplatesInput = {}): Promise<TeamTemplate[]> {
  const db = getDb()
  const limit = input.limit ?? 50
  const offset = input.offset ?? 0
  const rows = db
    .prepare(`SELECT * FROM team_templates ORDER BY created_at DESC LIMIT ? OFFSET ?`)
    .all(limit, offset) as Record<string, unknown>[]
  return rows.map(rowToTemplate)
}

export async function listTeamInstances(input: ListTeamInstancesInput): Promise<TeamInstance[]> {
  const db = getDb()
  const conditions: string[] = ['workspace_id = ?']
  const params: unknown[] = [input.workspace_id]

  if (input.project_id !== undefined) {
    conditions.push('project_id = ?')
    params.push(input.project_id)
  }

  if (input.status_category !== undefined) {
    conditions.push('status_category = ?')
    params.push(input.status_category)
  }

  const limit = input.limit ?? 50
  const offset = input.offset ?? 0
  params.push(limit, offset)

  const sql = `
    SELECT * FROM team_instances
    WHERE ${conditions.join(' AND ')}
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
  `

  const rows = db.prepare(sql).all(...params) as Record<string, unknown>[]
  return rows.map(rowToInstance)
}

export async function getTeamStatus(input: GetTeamStatusInput): Promise<TeamStatus> {
  const db = getDb()

  const instanceRow = db
    .prepare(`SELECT * FROM team_instances WHERE instance_id = ? AND workspace_id = ?`)
    .get(input.instance_id, input.workspace_id) as Record<string, unknown> | undefined

  if (!instanceRow) {
    throw new FulcrumError(`Team instance not found: ${input.instance_id}`, 'not_found')
  }

  const instance = rowToInstance(instanceRow)

  const templateRow = db
    .prepare(`SELECT * FROM team_templates WHERE template_id = ?`)
    .get(instance.template_id) as Record<string, unknown>
  const template = rowToTemplate(templateRow)

  const members = db
    .prepare(`SELECT slot_id, agent_id FROM team_members WHERE instance_id = ?`)
    .all(input.instance_id) as { slot_id: string; agent_id: string }[]

  // Build occupancy map keyed by slot_id
  const membersBySlot = new Map<string, string[]>()
  for (const m of members) {
    const list = membersBySlot.get(m.slot_id) ?? []
    list.push(m.agent_id)
    membersBySlot.set(m.slot_id, list)
  }

  const slot_occupancy: TeamStatus['slot_occupancy'] = {}
  const concurrency_cap_violations: string[] = []

  for (const slot of template.slots) {
    const agents = membersBySlot.get(slot.slot_id) ?? []
    slot_occupancy[slot.slot_id] = {
      current: agents.length,
      max: slot.max_count,
      agents,
    }
    if (agents.length > slot.concurrency_cap) {
      concurrency_cap_violations.push(slot.slot_id)
    }
  }

  return {
    instance_id: instance.instance_id,
    display_id: instance.display_id,
    status: instance.status,
    status_category: instance.status_category,
    slot_occupancy,
    active_member_count: members.length,
    concurrency_cap_violations,
  }
}

// ── TeamInstanceHeartbeat ─────────────────────────────────────────────────────
// Lightweight class that keeps a running team instance's heartbeat_at column
// fresh every 30 seconds, preventing the janitor from marking it stale.

export class TeamInstanceHeartbeat {
  private timer: ReturnType<typeof setInterval> | null = null

  constructor(
    private readonly instance_id: string,
    private readonly intervalMs: number = 30_000,
  ) {}

  start(): void {
    if (this.timer) return // already running
    this.timer = setInterval(() => {
      try {
        const db = getDb()
        db.prepare(
          `UPDATE team_instances SET heartbeat_at = datetime('now') WHERE instance_id = ?`
        ).run(this.instance_id)
      } catch { /* db may be closed during teardown — ignore */ }
    }, this.intervalMs)
    // Unref so the timer does not prevent Node from exiting
    if (typeof (this.timer as unknown as { unref?: () => void }).unref === 'function') {
      (this.timer as unknown as { unref: () => void }).unref()
    }
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
  }

  /** True if the heartbeat loop is currently active. */
  get running(): boolean {
    return this.timer !== null
  }
}
