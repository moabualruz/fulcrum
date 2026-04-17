// v2b PR 10 Task 1.1 — control-plane node DDL tests.
// Verifies buildControlPlaneDDL() returns valid DDL for all 18 node types
// (not team_members — that is modeled as a rel table per the plan).

import { describe, it, expect } from 'vitest'
import { buildControlPlaneDDL } from '../schema.js'

const CONTROL_PLANE_NODE_TYPES = [
  'task',
  'agent_run',
  'team_instance',
  'team_template',
  'workflow_run',
  'handoff',
  'artifact',
  'review',
  'worktree',
  'epic',
  'issue',
  'prd',
  'plan',
  'external_ref',
  'agent_adapter',
  'artifact_contract',
  'notification_event',
  'policy_event',
] as const

describe('buildControlPlaneDDL — v2b PR 10 Task 1.1', () => {
  it('returns an array of 18 DDL strings', () => {
    const ddls = buildControlPlaneDDL(1024)
    expect(ddls).toHaveLength(18)
  })

  it('every DDL is a CREATE NODE TABLE IF NOT EXISTS statement', () => {
    for (const ddl of buildControlPlaneDDL(1024)) {
      expect(ddl).toMatch(/CREATE NODE TABLE IF NOT EXISTS/)
    }
  })

  it('every node type has a PRIMARY KEY (id) clause', () => {
    for (const ddl of buildControlPlaneDDL(1024)) {
      expect(ddl, ddl).toContain('PRIMARY KEY (id)')
    }
  })

  it('covers all 18 node types', () => {
    const ddls = buildControlPlaneDDL(1024)
    for (const nodeType of CONTROL_PLANE_NODE_TYPES) {
      const tableName = nodeType.split('_').map(w => w[0].toUpperCase() + w.slice(1)).join('')
      const hasDdl = ddls.some(d => d.includes(`CREATE NODE TABLE IF NOT EXISTS ${tableName}`))
      expect(hasDdl, `Missing DDL for ${tableName} (from ${nodeType})`).toBe(true)
    }
  })

  it('task node has workspace_id, project_id, title, status, priority, assigned_to', () => {
    const ddls = buildControlPlaneDDL(1024)
    const taskDdl = ddls.find(d => d.includes('CREATE NODE TABLE IF NOT EXISTS Task'))!
    expect(taskDdl).toBeTruthy()
    for (const col of ['workspace_id', 'project_id', 'title', 'status', 'priority', 'assigned_to']) {
      expect(taskDdl, `task column ${col} missing`).toContain(col)
    }
  })

  it('agent_run node has agent_role, context_type, status', () => {
    const ddls = buildControlPlaneDDL(1024)
    const runDdl = ddls.find(d => d.includes('CREATE NODE TABLE IF NOT EXISTS AgentRun'))!
    expect(runDdl).toBeTruthy()
    for (const col of ['agent_role', 'context_type', 'status']) {
      expect(runDdl, `agent_run column ${col} missing`).toContain(col)
    }
  })

  it('external_ref node has source and external_id', () => {
    const ddls = buildControlPlaneDDL(1024)
    const refDdl = ddls.find(d => d.includes('CREATE NODE TABLE IF NOT EXISTS ExternalRef'))!
    expect(refDdl).toBeTruthy()
    expect(refDdl).toContain('source')
    expect(refDdl).toContain('external_id')
  })

  it('agent_adapter node has executor_uri, model, version', () => {
    const ddls = buildControlPlaneDDL(1024)
    const adapterDdl = ddls.find(d => d.includes('CREATE NODE TABLE IF NOT EXISTS AgentAdapter'))!
    expect(adapterDdl).toBeTruthy()
    for (const col of ['executor_uri', 'model', 'version']) {
      expect(adapterDdl, `agent_adapter column ${col} missing`).toContain(col)
    }
  })
})
