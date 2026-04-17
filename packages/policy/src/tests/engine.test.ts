// packages/policy/src/tests/engine.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createTestDb, resetTestDb, seed } from './helpers.js'
import { getDb, createAgentDefinition, L1_ROLES } from 'fulcrum-agent-core'
import {
  createPolicyRule,
  listPolicyRules,
  evaluatePolicy,
  SYSTEM_INVARIANTS,
} from '../engine.js'
import type { EvaluatePolicyInput } from '../types.js'

beforeEach(() => { const db = createTestDb(); seed(db) })
afterEach(() => resetTestDb())

// --- SYSTEM_INVARIANTS ---

describe('SYSTEM_INVARIANTS', () => {
  it('exports 5 invariants', () => {
    expect(SYSTEM_INVARIANTS).toHaveLength(5)
  })

  it('all invariants have priority 1000', () => {
    for (const inv of SYSTEM_INVARIANTS) {
      expect(inv.priority).toBe(1000)
    }
  })

  it('all invariants have action deny', () => {
    for (const inv of SYSTEM_INVARIANTS) {
      expect(inv.action).toBe('deny')
    }
  })

  it('invariant named only_l1_invokes_teams exists', () => {
    const inv = SYSTEM_INVARIANTS.find(i => i.name === 'only_l1_invokes_teams')
    expect(inv).toBeDefined()
  })

  it('invariant named only_integration_worker_merges exists', () => {
    const inv = SYSTEM_INVARIANTS.find(i => i.name === 'only_integration_worker_merges')
    expect(inv).toBeDefined()
  })

  it('invariant named no_task_bypass exists', () => {
    const inv = SYSTEM_INVARIANTS.find(i => i.name === 'no_task_bypass')
    expect(inv).toBeDefined()
  })

  it('invariant named chief_of_staff_no_direct_writes exists', () => {
    const inv = SYSTEM_INVARIANTS.find(i => i.name === 'chief_of_staff_no_direct_writes')
    expect(inv).toBeDefined()
  })
})

describe('chief_of_staff_no_direct_writes (G-6)', () => {
  it('denies CoS calling tool_use:Write', async () => {
    const decision = await evaluatePolicy({
      action: 'tool_use:Write',
      resource_id: 'src/foo.ts',
      actor_role: 'chief_of_staff',
      actor_id: 'run_cos',
      workspace_id: 'ws_1',
    })
    expect(decision.allowed).toBe(false)
    expect(decision.rule_id).toBe('SYSTEM:chief_of_staff_no_direct_writes')
  })

  it('denies CoS calling tool_use:Edit', async () => {
    const decision = await evaluatePolicy({
      action: 'tool_use:Edit',
      resource_id: 'src/foo.ts',
      actor_role: 'chief_of_staff',
      actor_id: 'run_cos',
      workspace_id: 'ws_1',
    })
    expect(decision.allowed).toBe(false)
    expect(decision.rule_id).toBe('SYSTEM:chief_of_staff_no_direct_writes')
  })

  it('denies CoS calling tool_use:MultiEdit', async () => {
    const decision = await evaluatePolicy({
      action: 'tool_use:MultiEdit',
      resource_id: 'src/foo.ts',
      actor_role: 'chief_of_staff',
      actor_id: 'run_cos',
      workspace_id: 'ws_1',
    })
    expect(decision.allowed).toBe(false)
  })

  it('denies CoS calling tool_use:NotebookEdit', async () => {
    const decision = await evaluatePolicy({
      action: 'tool_use:NotebookEdit',
      resource_id: 'notebook.ipynb',
      actor_role: 'chief_of_staff',
      actor_id: 'run_cos',
      workspace_id: 'ws_1',
    })
    expect(decision.allowed).toBe(false)
  })

  it('denies CoS calling shell_exec:git commit ...', async () => {
    const decision = await evaluatePolicy({
      action: 'shell_exec:git commit -m "foo"',
      resource_id: 'git commit',
      actor_role: 'chief_of_staff',
      actor_id: 'run_cos',
      workspace_id: 'ws_1',
    })
    expect(decision.allowed).toBe(false)
  })

  it('allows CoS calling tool_use:Read (read-only tools are fine)', async () => {
    const decision = await evaluatePolicy({
      action: 'tool_use:Read',
      resource_id: 'src/foo.ts',
      actor_role: 'chief_of_staff',
      actor_id: 'run_cos',
      workspace_id: 'ws_1',
    })
    expect(decision.allowed).toBe(true)
  })

  it('allows software_engineer calling tool_use:Write (non-L1 roles unaffected)', async () => {
    const decision = await evaluatePolicy({
      action: 'tool_use:Write',
      resource_id: 'src/foo.ts',
      actor_role: 'software_engineer',
      actor_id: 'run_se',
      workspace_id: 'ws_1',
    })
    expect(decision.allowed).toBe(true)
  })

  it('allows integration_worker calling shell_exec:git commit (merge owner exception)', async () => {
    const decision = await evaluatePolicy({
      action: 'shell_exec:git commit -m "merge"',
      resource_id: 'git commit',
      actor_role: 'integration_worker',
      actor_id: 'run_iw',
      workspace_id: 'ws_1',
    })
    expect(decision.allowed).toBe(true)
  })
})

// --- createPolicyRule ---

describe('createPolicyRule', () => {
  it('creates a rule and returns it with defaults', async () => {
    const rule = await createPolicyRule({
      scope: 'workspace',
      scope_id: 'ws_1',
      name: 'block-file-write',
      action: 'deny',
      matchers: [{ matcher_type: 'path', pattern: '/etc/*' }],
    })
    expect(rule.rule_id).toMatch(/^pol_[0-9A-Z]{26}$/)
    expect(rule.scope).toBe('workspace')
    expect(rule.action).toBe('deny')
    expect(rule.enabled).toBe(true)
    expect(rule.priority).toBe(100)
    expect(rule.matchers).toHaveLength(1)
    expect(rule.matchers[0].matcher_type).toBe('path')
  })

  it('accepts custom priority and enabled=false', async () => {
    const rule = await createPolicyRule({
      scope: 'project',
      scope_id: 'proj_1',
      name: 'my-rule',
      action: 'allow',
      matchers: [],
      priority: 200,
      enabled: false,
    })
    expect(rule.priority).toBe(200)
    expect(rule.enabled).toBe(false)
  })

  it('throws invalid_input for empty name', async () => {
    await expect(
      createPolicyRule({ scope: 'workspace', scope_id: 'ws_1', name: '', action: 'deny', matchers: [] })
    ).rejects.toMatchObject({ code: 'invalid_input' })
  })
})

// --- listPolicyRules ---

describe('listPolicyRules', () => {
  it('returns all rules when no filter given', async () => {
    await createPolicyRule({ scope: 'workspace', scope_id: 'ws_1', name: 'r1', action: 'deny', matchers: [] })
    await createPolicyRule({ scope: 'project', scope_id: 'proj_1', name: 'r2', action: 'allow', matchers: [] })
    const rules = await listPolicyRules({})
    expect(rules.length).toBeGreaterThanOrEqual(2)
  })

  it('filters by scope', async () => {
    await createPolicyRule({ scope: 'workspace', scope_id: 'ws_1', name: 'ws-rule', action: 'deny', matchers: [] })
    await createPolicyRule({ scope: 'project', scope_id: 'proj_1', name: 'proj-rule', action: 'allow', matchers: [] })
    const wsRules = await listPolicyRules({ scope: 'workspace' })
    expect(wsRules.every(r => r.scope === 'workspace')).toBe(true)
  })

  it('filters by scope_id', async () => {
    await createPolicyRule({ scope: 'workspace', scope_id: 'ws_1', name: 'r1', action: 'deny', matchers: [] })
    await createPolicyRule({ scope: 'workspace', scope_id: 'ws_2', name: 'r2', action: 'deny', matchers: [] })
    const rules = await listPolicyRules({ scope: 'workspace', scope_id: 'ws_1' })
    expect(rules.every(r => r.scope_id === 'ws_1')).toBe(true)
  })

  it('returns only enabled rules when enabled_only=true', async () => {
    await createPolicyRule({ scope: 'workspace', scope_id: 'ws_1', name: 'enabled-rule', action: 'deny', matchers: [], enabled: true })
    await createPolicyRule({ scope: 'workspace', scope_id: 'ws_1', name: 'disabled-rule', action: 'deny', matchers: [], enabled: false })
    const rules = await listPolicyRules({ enabled_only: true })
    expect(rules.every(r => r.enabled === true)).toBe(true)
  })
})

// --- evaluatePolicy — SYSTEM_INVARIANTS ---

describe('evaluatePolicy — SYSTEM_INVARIANTS: invoke_team', () => {
  it('denies invoke_team for non-chief_of_staff role', async () => {
    const input: EvaluatePolicyInput = {
      workspace_id: 'ws_1',
      actor_role: 'software_engineer',
      actor_id: 'agent_1',
      action: 'invoke_team',
    }
    const decision = await evaluatePolicy(input)
    expect(decision.allowed).toBe(false)
    expect(decision.action).toBe('deny')
    expect(decision.rule_id).toBe('SYSTEM:only_l1_invokes_teams')
  })

  it('allows invoke_team for chief_of_staff', async () => {
    const input: EvaluatePolicyInput = {
      workspace_id: 'ws_1',
      actor_role: 'chief_of_staff',
      actor_id: 'agent_cos',
      action: 'invoke_team',
    }
    const decision = await evaluatePolicy(input)
    expect(decision.allowed).toBe(true)
    expect(decision.action).toBe('allow')
  })
})

describe('evaluatePolicy — SYSTEM_INVARIANTS: merge_worktree', () => {
  it('denies merge_worktree for non-integration_worker role', async () => {
    const input: EvaluatePolicyInput = {
      workspace_id: 'ws_1',
      actor_role: 'code_reviewer',
      actor_id: 'agent_1',
      action: 'merge_worktree',
    }
    const decision = await evaluatePolicy(input)
    expect(decision.allowed).toBe(false)
    expect(decision.action).toBe('deny')
    expect(decision.rule_id).toBe('SYSTEM:only_integration_worker_merges')
  })

  it('allows merge_worktree for integration_worker', async () => {
    const input: EvaluatePolicyInput = {
      workspace_id: 'ws_1',
      actor_role: 'integration_worker',
      actor_id: 'agent_iw',
      action: 'merge_worktree',
    }
    const decision = await evaluatePolicy(input)
    expect(decision.allowed).toBe(true)
    expect(decision.action).toBe('allow')
  })
})

describe('evaluatePolicy — SYSTEM_INVARIANTS: start_run_without_task', () => {
  it('always denies start_run_without_task regardless of role', async () => {
    const roles: Array<EvaluatePolicyInput['actor_role']> = ['chief_of_staff', 'software_engineer', 'integration_worker']
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

// --- evaluatePolicy — workspace/project rules ---

describe('evaluatePolicy — workspace rules', () => {
  it('allows by default when no rules match', async () => {
    const decision = await evaluatePolicy({
      workspace_id: 'ws_1',
      actor_role: 'software_engineer',
      actor_id: 'agent_1',
      action: 'write_file',
      resource_type: 'file',
      resource_id: '/src/main.ts',
    })
    expect(decision.allowed).toBe(true)
    expect(decision.action).toBe('allow')
  })

  it('denies when a deny rule matches the action via tool matcher', async () => {
    await createPolicyRule({
      scope: 'workspace',
      scope_id: 'ws_1',
      name: 'no-bash',
      action: 'deny',
      matchers: [{ matcher_type: 'tool', pattern: 'bash' }],
    })
    const decision = await evaluatePolicy({
      workspace_id: 'ws_1',
      actor_role: 'software_engineer',
      actor_id: 'agent_1',
      action: 'bash',
    })
    expect(decision.allowed).toBe(false)
    expect(decision.reason).toBe('no-bash')
  })

  it('uses first matching rule (highest priority wins)', async () => {
    await createPolicyRule({
      scope: 'workspace',
      scope_id: 'ws_1',
      name: 'low-priority-deny',
      action: 'deny',
      matchers: [{ matcher_type: 'tool', pattern: 'read_file' }],
      priority: 50,
    })
    await createPolicyRule({
      scope: 'workspace',
      scope_id: 'ws_1',
      name: 'high-priority-allow',
      action: 'allow',
      matchers: [{ matcher_type: 'tool', pattern: 'read_file' }],
      priority: 200,
    })
    const decision = await evaluatePolicy({
      workspace_id: 'ws_1',
      actor_role: 'software_engineer',
      actor_id: 'agent_1',
      action: 'read_file',
    })
    // Higher priority rule wins (allow at 200 > deny at 50)
    expect(decision.allowed).toBe(true)
    expect(decision.reason).toBe('high-priority-allow')
  })

  it('skips disabled rules', async () => {
    await createPolicyRule({
      scope: 'workspace',
      scope_id: 'ws_1',
      name: 'disabled-deny',
      action: 'deny',
      matchers: [{ matcher_type: 'tool', pattern: 'write_file' }],
      enabled: false,
    })
    const decision = await evaluatePolicy({
      workspace_id: 'ws_1',
      actor_role: 'software_engineer',
      actor_id: 'agent_1',
      action: 'write_file',
    })
    // Disabled rule should not match → default allow
    expect(decision.allowed).toBe(true)
  })

  it('returns audit_only decision when matching rule has action=audit_only', async () => {
    await createPolicyRule({
      scope: 'workspace',
      scope_id: 'ws_1',
      name: 'audit-bash',
      action: 'audit_only',
      matchers: [{ matcher_type: 'tool', pattern: 'bash' }],
    })
    const decision = await evaluatePolicy({
      workspace_id: 'ws_1',
      actor_role: 'software_engineer',
      actor_id: 'agent_1',
      action: 'bash',
    })
    // audit_only → allowed is true (not blocked), action is audit_only
    expect(decision.allowed).toBe(true)
    expect(decision.action).toBe('audit_only')
  })

  it('SYSTEM_INVARIANTS take priority over workspace rules even at priority 999', async () => {
    // Even a workspace rule at priority 999 cannot override a SYSTEM_INVARIANT at 1000
    await createPolicyRule({
      scope: 'workspace',
      scope_id: 'ws_1',
      name: 'allow-merge',
      action: 'allow',
      matchers: [{ matcher_type: 'agent_team', pattern: 'merge_worktree' }],
      priority: 999,
    })
    const decision = await evaluatePolicy({
      workspace_id: 'ws_1',
      actor_role: 'qa_engineer',
      actor_id: 'agent_1',
      action: 'merge_worktree',
    })
    // SYSTEM_INVARIANT still wins → denied
    expect(decision.allowed).toBe(false)
    expect(decision.rule_id).toBe('SYSTEM:only_integration_worker_merges')
  })
})

describe('evaluatePolicy — path matcher', () => {
  it('path matcher matches against resource_id', async () => {
    await createPolicyRule({
      scope: 'workspace',
      scope_id: 'ws_1',
      name: 'no-secrets-path',
      action: 'deny',
      matchers: [{ matcher_type: 'path', pattern: '/secrets/*' }],
    })
    const decision = await evaluatePolicy({
      workspace_id: 'ws_1',
      actor_role: 'software_engineer',
      actor_id: 'agent_1',
      action: 'read_file',
      resource_id: '/secrets/api-key',
    })
    expect(decision.allowed).toBe(false)
    expect(decision.reason).toBe('no-secrets-path')
  })

  it('path matcher does not match when resource_id is outside the pattern', async () => {
    await createPolicyRule({
      scope: 'workspace',
      scope_id: 'ws_1',
      name: 'no-secrets-path',
      action: 'deny',
      matchers: [{ matcher_type: 'path', pattern: '/secrets/*' }],
    })
    const decision = await evaluatePolicy({
      workspace_id: 'ws_1',
      actor_role: 'software_engineer',
      actor_id: 'agent_1',
      action: 'read_file',
      resource_id: '/public/readme.md',
    })
    expect(decision.allowed).toBe(true)
  })

  it('single * does not match across directory separators (use ** for deep paths)', async () => {
    await createPolicyRule({
      scope: 'workspace',
      scope_id: 'ws_1',
      name: 'block-shallow-secrets',
      action: 'deny',
      matchers: [{ matcher_type: 'path', pattern: '/secrets/*' }],
    })
    const shallow = await evaluatePolicy({
      workspace_id: 'ws_1',
      actor_role: 'software_engineer',
      actor_id: 'agent_1',
      action: 'read_file',
      resource_id: '/secrets/api-key',
    })
    const deep = await evaluatePolicy({
      workspace_id: 'ws_1',
      actor_role: 'software_engineer',
      actor_id: 'agent_1',
      action: 'read_file',
      resource_id: '/secrets/a/b',
    })
    expect(shallow.allowed).toBe(false)  // matched by /secrets/*
    expect(deep.allowed).toBe(true)      // NOT matched — * won't cross /
  })
})

// --- evaluatePolicy — glob pattern matchers ---

describe('evaluatePolicy — glob pattern matching (tool matcher)', () => {
  it('tool: "file_*" matches file_read', async () => {
    await createPolicyRule({
      scope: 'workspace',
      scope_id: 'ws_1',
      name: 'no-file-tools',
      action: 'deny',
      matchers: [{ matcher_type: 'tool', pattern: 'file_*' }],
    })
    const decision = await evaluatePolicy({
      workspace_id: 'ws_1',
      actor_role: 'software_engineer',
      actor_id: 'agent_1',
      action: 'file_read',
    })
    expect(decision.allowed).toBe(false)
    expect(decision.reason).toBe('no-file-tools')
  })

  it('tool: "file_*" matches file_write', async () => {
    await createPolicyRule({
      scope: 'workspace',
      scope_id: 'ws_1',
      name: 'no-file-tools',
      action: 'deny',
      matchers: [{ matcher_type: 'tool', pattern: 'file_*' }],
    })
    const decision = await evaluatePolicy({
      workspace_id: 'ws_1',
      actor_role: 'software_engineer',
      actor_id: 'agent_1',
      action: 'file_write',
    })
    expect(decision.allowed).toBe(false)
    expect(decision.reason).toBe('no-file-tools')
  })

  it('tool: "file_*" does not match shell_exec', async () => {
    await createPolicyRule({
      scope: 'workspace',
      scope_id: 'ws_1',
      name: 'no-file-tools',
      action: 'deny',
      matchers: [{ matcher_type: 'tool', pattern: 'file_*' }],
    })
    const decision = await evaluatePolicy({
      workspace_id: 'ws_1',
      actor_role: 'software_engineer',
      actor_id: 'agent_1',
      action: 'shell_exec',
    })
    expect(decision.allowed).toBe(true)
  })
})

describe('evaluatePolicy — glob pattern matching (command matcher)', () => {
  it('command: "git *" matches git commit', async () => {
    await createPolicyRule({
      scope: 'workspace',
      scope_id: 'ws_1',
      name: 'no-git-commands',
      action: 'deny',
      matchers: [{ matcher_type: 'command', pattern: 'git *' }],
    })
    const decision = await evaluatePolicy({
      workspace_id: 'ws_1',
      actor_role: 'software_engineer',
      actor_id: 'agent_1',
      action: 'git commit',
    })
    expect(decision.allowed).toBe(false)
    expect(decision.reason).toBe('no-git-commands')
  })

  it('command: "git *" matches git push', async () => {
    await createPolicyRule({
      scope: 'workspace',
      scope_id: 'ws_1',
      name: 'no-git-commands',
      action: 'deny',
      matchers: [{ matcher_type: 'command', pattern: 'git *' }],
    })
    const decision = await evaluatePolicy({
      workspace_id: 'ws_1',
      actor_role: 'software_engineer',
      actor_id: 'agent_1',
      action: 'git push',
    })
    expect(decision.allowed).toBe(false)
  })

  it('command: "git *" does not match npm install', async () => {
    await createPolicyRule({
      scope: 'workspace',
      scope_id: 'ws_1',
      name: 'no-git-commands',
      action: 'deny',
      matchers: [{ matcher_type: 'command', pattern: 'git *' }],
    })
    const decision = await evaluatePolicy({
      workspace_id: 'ws_1',
      actor_role: 'software_engineer',
      actor_id: 'agent_1',
      action: 'npm install',
    })
    expect(decision.allowed).toBe(true)
  })
})

describe('evaluatePolicy — glob pattern matching (path matcher)', () => {
  it('path: "src/**" matches src/foo/bar.ts', async () => {
    await createPolicyRule({
      scope: 'workspace',
      scope_id: 'ws_1',
      name: 'protect-src',
      action: 'deny',
      matchers: [{ matcher_type: 'path', pattern: 'src/**' }],
    })
    const decision = await evaluatePolicy({
      workspace_id: 'ws_1',
      actor_role: 'software_engineer',
      actor_id: 'agent_1',
      action: 'write_file',
      resource_id: 'src/foo/bar.ts',
    })
    expect(decision.allowed).toBe(false)
    expect(decision.reason).toBe('protect-src')
  })

  it('path: "src/**" does not match tests/foo.ts', async () => {
    await createPolicyRule({
      scope: 'workspace',
      scope_id: 'ws_1',
      name: 'protect-src',
      action: 'deny',
      matchers: [{ matcher_type: 'path', pattern: 'src/**' }],
    })
    const decision = await evaluatePolicy({
      workspace_id: 'ws_1',
      actor_role: 'software_engineer',
      actor_id: 'agent_1',
      action: 'write_file',
      resource_id: 'tests/foo.ts',
    })
    expect(decision.allowed).toBe(true)
  })
})

describe('evaluatePolicy — glob pattern matching (artifact matcher)', () => {
  it('artifact: "*.md" matches README.md', async () => {
    await createPolicyRule({
      scope: 'workspace',
      scope_id: 'ws_1',
      name: 'no-markdown-artifacts',
      action: 'deny',
      matchers: [{ matcher_type: 'artifact', pattern: '*.md' }],
    })
    const decision = await evaluatePolicy({
      workspace_id: 'ws_1',
      actor_role: 'software_engineer',
      actor_id: 'agent_1',
      action: 'README.md',
    })
    expect(decision.allowed).toBe(false)
    expect(decision.reason).toBe('no-markdown-artifacts')
  })

  it('artifact: "*.md" does not match schema.sql', async () => {
    await createPolicyRule({
      scope: 'workspace',
      scope_id: 'ws_1',
      name: 'no-markdown-artifacts',
      action: 'deny',
      matchers: [{ matcher_type: 'artifact', pattern: '*.md' }],
    })
    const decision = await evaluatePolicy({
      workspace_id: 'ws_1',
      actor_role: 'software_engineer',
      actor_id: 'agent_1',
      action: 'schema.sql',
    })
    expect(decision.allowed).toBe(true)
  })
})

describe('evaluatePolicy — regex matcher', () => {
  it('denies when action matches regex pattern', async () => {
    await createPolicyRule({
      scope: 'workspace',
      scope_id: 'ws_1',
      name: 'no-delete-commands',
      action: 'deny',
      matchers: [{ matcher_type: 'regex', pattern: '^delete_.*' }],
    })
    const decision = await evaluatePolicy({
      workspace_id: 'ws_1',
      actor_role: 'software_engineer',
      actor_id: 'agent_1',
      action: 'delete_file',
    })
    expect(decision.allowed).toBe(false)
    expect(decision.reason).toBe('no-delete-commands')
  })

  it('does not match when regex pattern does not match action', async () => {
    await createPolicyRule({
      scope: 'workspace',
      scope_id: 'ws_1',
      name: 'no-delete-commands',
      action: 'deny',
      matchers: [{ matcher_type: 'regex', pattern: '^delete_.*' }],
    })
    const decision = await evaluatePolicy({
      workspace_id: 'ws_1',
      actor_role: 'software_engineer',
      actor_id: 'agent_1',
      action: 'read_file',
    })
    expect(decision.allowed).toBe(true)
  })
})

describe('evaluatePolicy — invalid regex pattern', () => {
  it('throws FulcrumError at creation time when regex pattern is invalid', async () => {
    // POL-001 fix: validate regex at creation time rather than silently skipping at eval time.
    // This fails fast and prevents broken policies from being persisted.
    await expect(createPolicyRule({
      scope: 'workspace',
      scope_id: 'ws_1',
      name: 'bad-regex-rule',
      action: 'deny',
      matchers: [{ matcher_type: 'regex', pattern: '[invalid regex(' }],
    })).rejects.toThrow('invalid regex pattern')
  })
})

describe('evaluatePolicy — domain_network matcher', () => {
  it('denies when resource_id matches domain_network pattern exactly', async () => {
    await createPolicyRule({
      scope: 'workspace',
      scope_id: 'ws_1',
      name: 'block-evil-domain',
      action: 'deny',
      matchers: [{ matcher_type: 'domain_network', pattern: 'evil.example.com' }],
    })
    const decision = await evaluatePolicy({
      workspace_id: 'ws_1',
      actor_role: 'software_engineer',
      actor_id: 'agent_1',
      action: 'http_request',
      resource_id: 'evil.example.com',
    })
    expect(decision.allowed).toBe(false)
  })

  it('does not match when resource_id differs from domain_network pattern', async () => {
    await createPolicyRule({
      scope: 'workspace',
      scope_id: 'ws_1',
      name: 'block-evil-domain',
      action: 'deny',
      matchers: [{ matcher_type: 'domain_network', pattern: 'evil.example.com' }],
    })
    const decision = await evaluatePolicy({
      workspace_id: 'ws_1',
      actor_role: 'software_engineer',
      actor_id: 'agent_1',
      action: 'http_request',
      resource_id: 'safe.example.com',
    })
    expect(decision.allowed).toBe(true)
  })
})

describe('evaluatePolicy — secret_content matcher', () => {
  it('never auto-matches secret_content — rule is skipped (manual check required)', async () => {
    await createPolicyRule({
      scope: 'workspace',
      scope_id: 'ws_1',
      name: 'no-secrets-in-output',
      action: 'deny',
      matchers: [{ matcher_type: 'secret_content', pattern: 'API_KEY' }],
    })
    // secret_content cannot be auto-evaluated — evaluatePolicy always skips it
    const decision = await evaluatePolicy({
      workspace_id: 'ws_1',
      actor_role: 'software_engineer',
      actor_id: 'agent_1',
      action: 'write_file',
      resource_id: 'output.txt',
    })
    expect(decision.allowed).toBe(true)
  })
})

describe('evaluatePolicy — empty matchers', () => {
  it('rule with empty matchers array never matches (always skipped)', async () => {
    await createPolicyRule({
      scope: 'workspace',
      scope_id: 'ws_1',
      name: 'empty-matchers-rule',
      action: 'deny',
      matchers: [],
    })
    const decision = await evaluatePolicy({
      workspace_id: 'ws_1',
      actor_role: 'software_engineer',
      actor_id: 'agent_1',
      action: 'do_anything',
    })
    expect(decision.allowed).toBe(true)
  })
})

// --- L1_ROLES enforcement via evaluatePolicy ---

describe('evaluatePolicy — L1_ROLES: invoke_team enforcement', () => {
  it('allows invoke_team when actor_role is chief_of_staff (L1 role)', async () => {
    const decision = await evaluatePolicy({
      workspace_id: 'ws_1',
      actor_role: 'chief_of_staff',
      actor_id: 'agent_cos',
      action: 'invoke_team',
    })
    expect(decision.allowed).toBe(true)
    expect(decision.action).toBe('allow')
  })

  it('denies invoke_team when actor_role is software_engineer (non-L1)', async () => {
    const decision = await evaluatePolicy({
      workspace_id: 'ws_1',
      actor_role: 'software_engineer',
      actor_id: 'agent_eng',
      action: 'invoke_team',
    })
    expect(decision.allowed).toBe(false)
    expect(decision.action).toBe('deny')
    expect(decision.rule_id).toBe('SYSTEM:only_l1_invokes_teams')
  })

  it('L1_ROLES set contains exactly chief_of_staff', () => {
    expect(L1_ROLES.has('chief_of_staff')).toBe(true)
    expect(L1_ROLES.size).toBe(1)
  })
})

// --- capability_required_for_action ---

describe('evaluatePolicy — SYSTEM_INVARIANTS: capability_required_for_action', () => {
  it('allows invoke_team when agent_definitions row has create_teams capability', async () => {
    // Seed an agent_definitions row that grants create_teams to chief_of_staff
    const db = getDb()
    createAgentDefinition({
      role: 'chief_of_staff',
      workspace_id: 'ws_1',
      display_name: 'Chief of Staff',
      description: 'L1 orchestrator',
      capabilities: ['create_teams'],
    }, db)

    const decision = await evaluatePolicy({
      workspace_id: 'ws_1',
      actor_role: 'chief_of_staff',
      actor_id: 'run_cos',
      action: 'invoke_team',
    })
    expect(decision.allowed).toBe(true)
  })

  it('denies invoke_team when agent_definitions row exists but lacks create_teams', async () => {
    // Seed chief_of_staff WITHOUT create_teams. The capability_required_for_action
    // invariant fires AFTER only_l1_invokes_teams (which passes for chief_of_staff).
    const db = getDb()
    createAgentDefinition({
      role: 'chief_of_staff',
      workspace_id: 'ws_1',
      display_name: 'Chief of Staff',
      description: 'L1 orchestrator without team cap',
      capabilities: [],  // explicitly empty — missing create_teams
    }, db)

    const decision = await evaluatePolicy({
      workspace_id: 'ws_1',
      actor_role: 'chief_of_staff',
      actor_id: 'run_cos',
      action: 'invoke_team',
    })
    expect(decision.allowed).toBe(false)
    expect(decision.rule_id).toBe('SYSTEM:capability_required_for_action')
  })

  it('allows actions with no capability mapping regardless of agent_definitions', async () => {
    const db = getDb()
    createAgentDefinition({
      role: 'software_engineer',
      workspace_id: 'ws_1',
      display_name: 'Software Engineer',
      description: 'L2 implementor',
      capabilities: [],
    }, db)

    // 'write_file' has no ACTION_CAPABILITY entry → capability gate is skipped
    const decision = await evaluatePolicy({
      workspace_id: 'ws_1',
      actor_role: 'software_engineer',
      actor_id: 'run_se',
      action: 'write_file',
    })
    expect(decision.allowed).toBe(true)
  })

  it('defers to other checks when no agent_definitions row exists for role', async () => {
    // No agent_definitions row for qa_engineer in ws_1
    // capability_required_for_action returns false (defer) → only_integration_worker_merges fires
    const decision = await evaluatePolicy({
      workspace_id: 'ws_1',
      actor_role: 'qa_engineer',
      actor_id: 'run_qa',
      action: 'merge_worktree',
    })
    expect(decision.allowed).toBe(false)
    expect(decision.rule_id).toBe('SYSTEM:only_integration_worker_merges')
  })
})
