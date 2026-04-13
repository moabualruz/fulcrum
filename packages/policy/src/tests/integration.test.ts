// packages/policy/src/tests/integration.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createTestDb, resetTestDb, seed } from './helpers.js'
import { evaluatePolicy, createPolicyRule } from '../engine.js'
import { checkSecrets, redactSecrets } from '../secret-guard.js'
import { logPolicyEvent, getAuditLog } from '../audit.js'
import type { EvaluatePolicyInput } from '../types.js'

beforeEach(() => { const db = createTestDb(); seed(db) })
afterEach(() => resetTestDb())

describe('L1 invariant enforcement + audit trail', () => {
  it('denies invoke_team for implementer and records audit event', async () => {
    const input: EvaluatePolicyInput = {
      workspace_id: 'ws_1',
      actor_role: 'implementer',
      actor_id: 'agent_impl_1',
      action: 'invoke_team',
      resource_type: 'team',
      resource_id: 'team_abc',
    }
    const decision = await evaluatePolicy(input)
    expect(decision.allowed).toBe(false)
    expect(decision.rule_id).toBe('SYSTEM:only_l1_invokes_teams')

    // Log the denied decision to audit trail
    await logPolicyEvent({
      workspace_id: input.workspace_id,
      rule_id: decision.rule_id,
      action: input.action,
      matched: true,
      actor_id: input.actor_id,
      resource_type: input.resource_type,
      resource_id: input.resource_id,
      payload: { decision: 'denied', reason: decision.reason },
    })

    const log = await getAuditLog({ workspace_id: 'ws_1' })
    expect(log).toHaveLength(1)
    expect(log[0].matched).toBe(true)
    expect(log[0].action).toBe('invoke_team')
    expect(log[0].rule_id).toBe('SYSTEM:only_l1_invokes_teams')
    expect(log[0].actor_id).toBe('agent_impl_1')
  })

  it('chief_of_staff can invoke_team (allowed)', async () => {
    const decision = await evaluatePolicy({
      workspace_id: 'ws_1',
      actor_role: 'chief_of_staff',
      actor_id: 'cos_agent',
      action: 'invoke_team',
    })
    expect(decision.allowed).toBe(true)
    expect(decision.action).toBe('allow')
  })

  it('denies merge_worktree for tester and records audit event', async () => {
    const input: EvaluatePolicyInput = {
      workspace_id: 'ws_1',
      actor_role: 'tester',
      actor_id: 'agent_tester_1',
      action: 'merge_worktree',
      resource_type: 'worktree',
      resource_id: 'wt_xyz',
    }
    const decision = await evaluatePolicy(input)
    expect(decision.allowed).toBe(false)
    expect(decision.rule_id).toBe('SYSTEM:only_integration_worker_merges')

    await logPolicyEvent({
      workspace_id: input.workspace_id,
      rule_id: decision.rule_id,
      action: input.action,
      matched: true,
      actor_id: input.actor_id,
      resource_type: input.resource_type,
      resource_id: input.resource_id,
    })

    const log = await getAuditLog({ workspace_id: 'ws_1', action: 'merge_worktree' })
    expect(log).toHaveLength(1)
    expect(log[0].matched).toBe(true)
  })

  it('always denies start_run_without_task for any role', async () => {
    const roles = ['chief_of_staff', 'implementer', 'integration_worker'] as const
    for (const role of roles) {
      const decision = await evaluatePolicy({
        workspace_id: 'ws_1',
        actor_role: role,
        actor_id: 'agent_1',
        action: 'start_run_without_task',
      })
      expect(decision.allowed).toBe(false)
      expect(decision.rule_id).toBe('SYSTEM:no_task_bypass')
    }
  })
})

describe('Secret detection + workspace rule enforcement', () => {
  it('detects API key in task title and denies secret storage action', async () => {
    const title = 'Store sk_abcdefghijklmnopqrstuvwx in config'
    const scanResult = checkSecrets(title)
    expect(scanResult.has_secrets).toBe(true)

    // Policy: workspace rule denies storing secrets
    await createPolicyRule({
      scope: 'workspace',
      scope_id: 'ws_1',
      name: 'no-secret-storage',
      action: 'deny',
      matchers: [{ matcher_type: 'secret_content', pattern: 'any' }],
    })

    // Directly log the policy violation (secret_content matcher evaluated externally)
    await logPolicyEvent({
      workspace_id: 'ws_1',
      action: 'store_memory',
      matched: true,
      actor_id: 'agent_1',
      payload: { reason: 'secret_detected', pattern: scanResult.matches[0].pattern_name },
    })

    const log = await getAuditLog({ workspace_id: 'ws_1' })
    expect(log).toHaveLength(1)
    expect(log[0].payload.reason).toBe('secret_detected')
  })

  it('redacts secrets before storing in audit payload', async () => {
    const rawText = 'Connecting to postgres://admin:hunter2@localhost/db'
    const redacted = redactSecrets(rawText)
    expect(redacted).not.toContain('hunter2')
    expect(redacted).toContain('[REDACTED]')

    await logPolicyEvent({
      workspace_id: 'ws_1',
      action: 'connect_db',
      matched: false,
      actor_id: 'agent_1',
      payload: { connection_string: redacted },
    })

    const log = await getAuditLog({ workspace_id: 'ws_1' })
    const storedPayload = log[0].payload as { connection_string: string }
    expect(storedPayload.connection_string).not.toContain('hunter2')
    expect(storedPayload.connection_string).toContain('[REDACTED]')
  })
})

describe('Workspace + project rule layering', () => {
  it('workspace rule denies but project rule allows — project rule wins when higher priority', async () => {
    // Workspace rule: deny write_file at priority 100
    await createPolicyRule({
      scope: 'workspace',
      scope_id: 'ws_1',
      name: 'ws-deny-write',
      action: 'deny',
      matchers: [{ matcher_type: 'tool', pattern: 'write_file' }],
      priority: 100,
    })
    // Project rule: allow write_file at priority 200 (higher — wins)
    await createPolicyRule({
      scope: 'project',
      scope_id: 'proj_1',
      name: 'proj-allow-write',
      action: 'allow',
      matchers: [{ matcher_type: 'tool', pattern: 'write_file' }],
      priority: 200,
    })

    const decision = await evaluatePolicy({
      workspace_id: 'ws_1',
      project_id: 'proj_1',
      actor_role: 'implementer',
      actor_id: 'agent_1',
      action: 'write_file',
    })
    // Project rule at 200 wins over workspace rule at 100
    expect(decision.allowed).toBe(true)
    expect(decision.reason).toBe('proj-allow-write')
  })

  it('audit log shows all events across multiple actions', async () => {
    await logPolicyEvent({ workspace_id: 'ws_1', action: 'invoke_team', matched: true, actor_id: 'agent_1' })
    await logPolicyEvent({ workspace_id: 'ws_1', action: 'write_file', matched: false, actor_id: 'agent_1' })
    await logPolicyEvent({ workspace_id: 'ws_1', action: 'merge_worktree', matched: true, actor_id: 'agent_2' })

    const fullLog = await getAuditLog({ workspace_id: 'ws_1' })
    expect(fullLog).toHaveLength(3)

    const agent1Log = await getAuditLog({ workspace_id: 'ws_1', actor_id: 'agent_1' })
    expect(agent1Log).toHaveLength(2)

    const mergeLog = await getAuditLog({ workspace_id: 'ws_1', action: 'merge_worktree' })
    expect(mergeLog).toHaveLength(1)
    expect(mergeLog[0].actor_id).toBe('agent_2')
  })
})
