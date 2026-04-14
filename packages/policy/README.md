# @fulcrum/policy

Policy rule engine with hardcoded system invariants, custom workspace rules, secret detection/redaction, and an append-only audit log.

## How it works

Evaluation runs in two layers:

1. **`SYSTEM_INVARIANTS`** — three hardcoded rules at priority 1000 that can never be overridden:
   - `only_l1_invokes_teams` — only L1 roles (`orchestrator`, `project_manager`, …) may invoke teams
   - `only_integration_worker_merges` — only `integration_worker` may merge worktrees
   - `no_task_bypass` — no run may start without a bound task

2. **Workspace / project rules** — stored in SQLite (`policy_rules`), ordered by `priority DESC`. First match wins; default is `allow`.

Secret detection (`checkSecrets` / `redactSecrets`) is a pure synchronous function with no database dependency. It covers 9 pattern families: API keys, AWS credentials, private keys, OAuth tokens, Slack tokens, JWTs, password key-value pairs, and credential URLs.

## Usage

```typescript
import {
  evaluatePolicy,
  createPolicyRule,
  listPolicyRules,
  checkSecrets,
  redactSecrets,
  logPolicyEvent,
  getAuditLog,
} from '@fulcrum/policy'

// Evaluate a policy decision
const decision = await evaluatePolicy({
  workspace_id: 'ws_01',
  actor_role: 'developer_agent',
  actor_id: 'agent_abc',
  action: 'invoke_team',
})
// => { allowed: false, reason: 'only_l1_invokes_teams', action: 'deny' }

// Add a custom workspace rule
const rule = await createPolicyRule({
  scope: 'workspace',
  scope_id: 'ws_01',
  name: 'block-prod-writes',
  action: 'deny',
  matchers: [{ matcher_type: 'path', pattern: 'prod/**' }],
  priority: 200,
})

// Check / redact secrets before sending text to an LLM
const scan = checkSecrets('token=ghp_ABC123xyz...')
// => { has_secrets: true, matches: [{ pattern_name: 'oauth_token', ... }] }

const safe = redactSecrets('password=hunter2 api_key-abc123xyz789')
// => 'password=[REDACTED] api_key-[REDACTED]'

// Log a policy event
await logPolicyEvent({
  workspace_id: 'ws_01',
  action: 'write_file',
  matched: true,
  actor_id: 'agent_abc',
  rule_id: rule.rule_id,
  resource_type: 'file',
  resource_id: 'prod/config.yaml',
})

// Query the audit log
const events = await getAuditLog({
  workspace_id: 'ws_01',
  actor_id: 'agent_abc',
  limit: 50,
})
```

## API

### Engine

| Function | Signature | Description |
|---|---|---|
| `evaluatePolicy` | `(input: EvaluatePolicyInput) => Promise<PolicyDecision>` | Run SYSTEM_INVARIANTS then workspace/project rules; default allow |
| `createPolicyRule` | `(input: CreatePolicyRuleInput) => Promise<PolicyRule>` | Persist a new rule to the database |
| `listPolicyRules` | `(input: ListPolicyRulesInput) => Promise<PolicyRule[]>` | Query rules by scope / scope_id / enabled state |
| `SYSTEM_INVARIANTS` | `SystemInvariant[]` | Read-only array of the three hardcoded invariants |

### Secret guard

| Function | Signature | Description |
|---|---|---|
| `checkSecrets` | `(text: string) => SecretScanResult` | Scan text; returns `{ has_secrets, matches }` |
| `redactSecrets` | `(text: string) => string` | Replace all secret matches with `[REDACTED]` |

### Audit log

| Function | Signature | Description |
|---|---|---|
| `logPolicyEvent` | `(input: LogPolicyEventInput) => Promise<void>` | Append a policy event to `policy_events` |
| `getAuditLog` | `(input: GetAuditLogInput) => Promise<PolicyEvent[]>` | Query events by workspace, actor, action; ordered newest-first |

## Key types

```typescript
type PolicyScope  = 'system' | 'user' | 'workspace' | 'project' | 'team_agent' | 'workflow_step'
type PolicyAction = 'allow' | 'deny' | 'audit_only'
type MatcherType  = 'tool' | 'command' | 'path' | 'regex' | 'domain_network'
                  | 'agent_team' | 'workflow_step' | 'artifact' | 'secret_content'

interface PolicyDecision {
  allowed: boolean
  reason?: string
  rule_id?: string
  action: PolicyAction
}

interface SecretScanResult {
  has_secrets: boolean
  matches: SecretMatch[]   // { pattern_name, match, index }
}
```

> `secret_content` matchers are documentation-only — the engine always returns `false` for them. Call `checkSecrets()` separately and deny before calling `evaluatePolicy()`.

See [`docs/superpowers/plans/2026-04-13-policy.md`](../../docs/superpowers/plans/2026-04-13-policy.md) for the full implementation plan.
