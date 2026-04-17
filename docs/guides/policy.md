# Policy Engine

`fulcrum-policy` enforces role boundaries, custom rules, and secret detection.

---

## System Invariants (cannot be overridden)

Priority 1000, evaluated before any DB-defined rules. All five check capabilities via `roleCapabilities()`, not hardcoded string comparisons — the `role-string-guard` test enforces this.

| Rule | Description |
|------|-------------|
| `only_l1_invokes_teams` | Only roles with `can_invoke_teams` may create or invoke teams |
| `only_integration_worker_merges` | Only roles with `can_merge` may process the merge queue |
| `no_task_bypass` | `start_run` requires an existing task (no orphan runs) |
| `capability_required_for_action` | `invoke_team`, `dispatch_agents`, and `merge_worktree` require the matching capability on the agent's `AgentDefinition` (not just the role) |
| `chief_of_staff_no_direct_writes` | L1 orchestrators must not directly edit files, write code, or run shell commands |

**Regex pattern validation** — user-defined rules that specify regex matchers are validated for length (≤256 chars), parseability, and absence of nested quantifiers (ReDoS guard). Invalid patterns throw `FulcrumError { code: 'invalid_input' }`.

---

## Custom Rules

```typescript
import { createPolicyRule, evaluatePolicy } from 'fulcrum-policy'

await createPolicyRule({
  workspace_id: 'ws_1',
  scope: 'workspace',
  matcher: { type: 'command', value: 'deploy:production' },
  action: 'deny',
  reason: 'Production deployments require manual approval outside business hours',
  priority: 100,
})

const decision = await evaluatePolicy({
  workspace_id: 'ws_1',
  actor: { role: 'devops_engineer', agent_id: 'agt_1' },
  resource: { type: 'command', value: 'deploy:production' },
})
// decision: { allowed: false, reason: '...', matched_rule: ... }
```

---

## Secret Guard

```typescript
import { checkSecrets, redactSecrets } from 'fulcrum-policy'

const result = checkSecrets(text)
// { has_secrets: true, matches: [{ pattern_name: 'anthropic_api_key', match: 'sk-ant-...', index: 22 }] }

const safe = redactSecrets(text)
// Replaces all matched secrets with [REDACTED]
```

Detects 12 named pattern classes with range-based deduplication (more-specific patterns take precedence over generic ones):

| Pattern | What it matches |
|---------|----------------|
| `anthropic_api_key` | Anthropic API keys (`sk-ant-api03-` prefix) |
| `openai_api_key` | OpenAI API keys (`sk-` or `sk-proj-` prefix) |
| `api_key` | Generic key-like tokens (`sk_`, `pk_`, `api_`, `key_`, `token_`, `secret_` prefix + 20+ chars) |
| `aws_access_key` | AWS Access Key IDs (`AKIA` prefix) |
| `aws_secret_key` | AWS Secret Access Keys |
| `private_key` | RSA/EC/OPENSSH PEM headers |
| `oauth_token` | GitHub PATs (`ghp_`, `gho_`, `github_pat_` prefixes) |
| `slack_token` | Slack tokens (`xoxb-`, `xoxp-`, `xoxa-` prefixes) |
| `jwt_token` | JWT tokens (three base64 segments) |
| `password_kv` | Password assignments in key-value pairs |
| `credential_url` | Credentials embedded in connection strings |
| `authorization_bearer` | Bearer tokens in HTTP Authorization headers |

---

## Hook System

Each of `fulcrum hook claude|gemini|pi` reads a tool-call event from stdin, normalizes it to a canonical shape (tool name + params + actor role), logs it as a `hook_executed` event, and enforces `chief_of_staff_no_direct_writes`.

Installing Fulcrum via `pnpm run setup` wires it into `~/.claude/settings.json` as a `PreToolUse` hook and into `~/.gemini/extensions/fulcrum/` as a Gemini extension.

```bash
# What the hook does — called by the agent runtime
echo '{"tool":"Write","params":{"path":"src/foo.ts"},"role":"chief_of_staff"}' \
  | fulcrum hook claude
# exit 2, stderr: "POLICY_DENIED: chief_of_staff_no_direct_writes"
```

---

## Doctor

`fulcrum doctor` runs environment and configuration health checks:

```bash
fulcrum doctor          # human-readable output
fulcrum doctor --json   # JSON array of { name, status, message }
```

| Check | PASS | WARN | FAIL |
|-------|------|------|------|
| Node.js version | ≥ 20 | — | < 20 |
| `.fulcrum.json` | Present + valid | Missing | Invalid / missing fields |
| Data directory | Exists | Will be created on first use | — |
| `better-sqlite3` | Loads | — | Cannot load |
| Database liveness | `SELECT 1` OK | — | Error |
| `@modelcontextprotocol/sdk` | Loads | — | Cannot load |
| Environment variables | Any of `FULCRUM_DATA_DIR`, `ANTHROPIC_API_KEY`, `OPENAI_API_KEY` set | None set | — |
| Agent integration files | Any of `CLAUDE.md`, `AGENTS.md`, `GEMINI.md` found | None found | — |

Exit code is 0 when all checks pass or warn; 1 when any check fails.
