// v2b PR 10 Task 1.3 — control-plane rel-table DDL tests.
// Verifies all ~25 new rel tables from Part 06 §8.1 edge taxonomy.

import { describe, it, expect } from 'vitest'
import {
  ASSIGNED_TO_DDL,
  BLOCKED_BY_DDL,
  DELIVERED_BY_DDL,
  DEPENDS_ON_DDL,
  HAS_OUTCOME_DDL,
  PRODUCED_DDL,
  EDITED_RUN_DDL,
  HANDLED_DDL,
  PART_OF_RUN_DDL,
  HIT_DDL,
  INSTANTIATED_FROM_DDL,
  EXECUTED_BY_DDL,
  MEMBER_OF_DDL,
  LANDED_IN_DDL,
  ON_BRANCH_DDL,
  INCLUDES_COMMIT_DDL,
  DELIVERED_IN_DDL,
  POINTS_AT_DDL,
  SHADOW_OF_DDL,
  CONFORMS_TO_DDL,
  CHECKS_DDL,
  EVALUATED_DDL,
  DECIDED_ON_DDL,
  TRIGGERED_BY_DDL,
  RAN_AS_DDL,
} from '../schema.js'

const EDGE_CHECKS: Array<[string, string, string, string]> = [
  [ASSIGNED_TO_DDL, 'ASSIGNED_TO', 'FROM Task TO AgentRun', 'assigned_to'],
  [BLOCKED_BY_DDL, 'BLOCKED_BY', 'FROM Task TO Task', 'blocked_by'],
  [DELIVERED_BY_DDL, 'DELIVERED_BY', 'FROM Task TO Artifact', 'delivered_by'],
  [DEPENDS_ON_DDL, 'DEPENDS_ON', 'FROM Task TO Task', 'depends_on'],
  [HAS_OUTCOME_DDL, 'HAS_OUTCOME', 'FROM Task TO Memory', 'has_outcome'],
  [PRODUCED_DDL, 'PRODUCED', 'FROM AgentRun TO Memory', 'produced'],
  [EDITED_RUN_DDL, 'EDITED_RUN', 'FROM AgentRun TO File', 'edited_run'],
  [HANDLED_DDL, 'HANDLED', 'FROM AgentRun TO Handoff', 'handled'],
  [PART_OF_RUN_DDL, 'PART_OF_RUN', 'FROM AgentRun TO TeamInstance', 'part_of_run'],
  [HIT_DDL, 'HIT', 'FROM AgentRun TO', 'hit'],
  [INSTANTIATED_FROM_DDL, 'INSTANTIATED_FROM', 'FROM TeamInstance TO TeamTemplate', 'instantiated_from'],
  [EXECUTED_BY_DDL, 'EXECUTED_BY', 'FROM AgentRun TO AgentAdapter', 'executed_by'],
  [MEMBER_OF_DDL, 'MEMBER_OF', 'FROM AgentProfile TO TeamInstance', 'member_of'],
  [LANDED_IN_DDL, 'LANDED_IN', 'FROM File TO GitCommit', 'landed_in'],
  [ON_BRANCH_DDL, 'ON_BRANCH', 'FROM GitCommit TO GitBranch', 'on_branch'],
  [INCLUDES_COMMIT_DDL, 'INCLUDES_COMMIT', 'FROM GitPr TO GitCommit', 'includes_commit'],
  [DELIVERED_IN_DDL, 'DELIVERED_IN', 'FROM Artifact TO GitPr', 'delivered_in'],
  [POINTS_AT_DDL, 'POINTS_AT', 'FROM Worktree TO GitBranch', 'points_at'],
  [SHADOW_OF_DDL, 'SHADOW_OF', 'FROM Task TO ExternalRef', 'shadow_of'],
  [CONFORMS_TO_DDL, 'CONFORMS_TO', 'FROM Artifact TO ArtifactContract', 'conforms_to'],
  [CHECKS_DDL, 'CHECKS', 'FROM Review TO ArtifactContract', 'checks'],
  [EVALUATED_DDL, 'EVALUATED', 'FROM PolicyEvent TO', 'evaluated'],
  [DECIDED_ON_DDL, 'DECIDED_ON', 'FROM PolicyEvent TO', 'decided_on'],
  [TRIGGERED_BY_DDL, 'TRIGGERED_BY', 'FROM NotificationEvent TO AgentRun', 'triggered_by'],
  [RAN_AS_DDL, 'RAN_AS', 'FROM WorkflowRun TO', 'ran_as'],
]

describe('control-plane rel-table DDLs — v2b PR 10 Task 1.3', () => {
  it('exports 25 control-plane edge DDL constants', () => {
    expect(EDGE_CHECKS).toHaveLength(25)
  })

  for (const [ddl, name, fromTo, _label] of EDGE_CHECKS) {
    it(`${name} is a CREATE REL TABLE targeting ${fromTo}`, () => {
      expect(ddl).toMatch(/CREATE REL TABLE IF NOT EXISTS/)
      expect(ddl).toContain(name)
      expect(ddl, `${name}: missing ${fromTo}`).toContain(fromTo)
    })
  }
})
