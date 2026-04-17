// v2b PR 10 Task 1.4 — buildAllDDL() v2b superset test.

import { describe, it, expect } from 'vitest'
import { buildAllDDL } from '../schema.js'

const V2A_NODE_TABLES = ['Memory', 'Entity', 'File', 'CodeChunk', 'Symbol']

const V2B_CONTROL_PLANE_TABLES = [
  'Task', 'AgentRun', 'TeamInstance', 'TeamTemplate', 'WorkflowRun',
  'Handoff', 'Artifact', 'Review', 'Worktree', 'Epic', 'Issue', 'Prd', 'Plan',
  'ExternalRef', 'AgentAdapter', 'ArtifactContract', 'NotificationEvent', 'PolicyEvent',
]

const V2B_GIT_TABLES = ['GitCommit', 'GitBranch', 'GitPr', 'GitTag']

const SAMPLE_REL_TABLES = [
  'ASSIGNED_TO', 'BLOCKED_BY', 'DEPENDS_ON', 'PRODUCED', 'INSTANTIATED_FROM',
  'MEMBER_OF', 'LANDED_IN', 'ON_BRANCH', 'SHADOW_OF', 'CONFORMS_TO',
]

describe('buildAllDDL() v2b superset — PR 10 Task 1.4', () => {
  it('has more than 34 statements (v2a had 34)', () => {
    expect(buildAllDDL(1024).length).toBeGreaterThan(34)
  })

  it('still includes all v2a node tables', () => {
    const ddls = buildAllDDL(1024)
    for (const t of V2A_NODE_TABLES) {
      expect(ddls.some(d => d.includes(`CREATE NODE TABLE IF NOT EXISTS ${t}`)), `v2a node ${t} missing`).toBe(true)
    }
  })

  it('includes all 18 v2b control-plane node tables', () => {
    const ddls = buildAllDDL(1024)
    for (const t of V2B_CONTROL_PLANE_TABLES) {
      expect(ddls.some(d => d.includes(`CREATE NODE TABLE IF NOT EXISTS ${t}`)), `v2b node ${t} missing`).toBe(true)
    }
  })

  it('includes all 4 git node tables', () => {
    const ddls = buildAllDDL(1024)
    for (const t of V2B_GIT_TABLES) {
      expect(ddls.some(d => d.includes(`CREATE NODE TABLE IF NOT EXISTS ${t}`)), `git node ${t} missing`).toBe(true)
    }
  })

  it('includes sample v2b rel tables', () => {
    const ddls = buildAllDDL(1024)
    for (const t of SAMPLE_REL_TABLES) {
      expect(ddls.some(d => d.includes(`CREATE REL TABLE IF NOT EXISTS ${t}`)), `rel ${t} missing`).toBe(true)
    }
  })

  it('node DDLs all precede rel DDLs (order preserved)', () => {
    const ddls = buildAllDDL(1024)
    const lastNodeIdx = ddls.reduce((max, d, i) => d.includes('CREATE NODE TABLE') ? i : max, -1)
    const firstRelIdx = ddls.findIndex(d => d.includes('CREATE REL TABLE'))
    expect(firstRelIdx).toBeGreaterThan(lastNodeIdx)
  })

  it('vector indexes come last (after nodes and rels)', () => {
    const ddls = buildAllDDL(1024)
    const firstVecIdx = ddls.findIndex(d => d.includes('CREATE_VECTOR_INDEX'))
    const lastRelIdx = ddls.reduce((max, d, i) => d.includes('CREATE REL TABLE') ? i : max, -1)
    expect(firstVecIdx).toBeGreaterThan(lastRelIdx)
  })
})
