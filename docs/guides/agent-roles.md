# Agent Roles & Teams

---

## 24 Canonical Roles

| Role | Description | Can Invoke Teams | Can Merge |
|------|-------------|:----------------:|:---------:|
| `chief_of_staff` | L1 orchestrator — plans work, dispatches teams | yes | — |
| `context_gatherer` | Collects context before planning | — | — |
| `prd_planner` | Writes PRDs from requirements | — | — |
| `implementation_planner` | Breaks epics into tasks | — | — |
| `issue_decomposer` | Decomposes issues into sub-tasks | — | — |
| `architecture_reviewer` | Reviews system design (read-only) | — | — |
| `research_worker` | Web search and information gathering | — | — |
| `software_engineer` | General-purpose implementation | — | — |
| `refactor_worker` | Code refactoring and cleanup | — | — |
| `browser_worker` | Browser automation | — | — |
| `data_engineer` | Data pipeline work | — | — |
| `ml_engineer` | ML model and training work | — | — |
| `devops_engineer` | Infrastructure and CI/CD | — | — |
| `code_reviewer` | Reviews pull requests (read-only) | — | — |
| `qa_engineer` | Testing and quality assurance | — | — |
| `security_reviewer` | Security audits (read-only) | — | — |
| `integration_worker` | Merges worktrees — the **only** role with `can_merge` | — | yes |
| `documentation_writer` | Writes and updates docs | — | — |
| `memory_curator` | Curates and prunes memory vault | — | — |
| `tech_lead` | Technical leadership and unblocking | — | — |
| `product_manager` | Manages roadmap and priorities | — | — |
| `analyst` | Data analysis and reporting | — | — |
| `orchestrator` | Generic sub-orchestration | — | — |
| `custom` | Escape hatch for user-defined roles | — | — |

---

## Capability Helpers

Use these helpers instead of hardcoded string comparisons. The `role-string-guard` test enforces that no code outside `roles.ts` compares a role to a string literal.

```typescript
import {
  isL1, canInvokeTeams, canMerge, canWriteCode, canEditFiles,
  roleCapabilities, L1_ROLES,
} from 'fulcrum-agent-core'

if (!canInvokeTeams(caller_role)) throw new FulcrumError('policy_denied')
if (!canMerge(actor_role))        throw new FulcrumError('policy_denied')

const caps = roleCapabilities('software_engineer')
// { is_l1: false, can_invoke_teams: false, can_merge: false,
//   can_edit_files: true, can_write_code: true }
```

---

## Agent Definitions

Agent definitions are canonical role specifications stored in the DB:

```typescript
import {
  createAgentDefinition,
  getAgentDefinition,
  updateAgentDefinition,
  listAgentDefinitions,
} from 'fulcrum-agent-core'

await createAgentDefinition({
  role: 'software_engineer',
  model: 'claude-sonnet-4-6',
  tools_allow: ['Read', 'Write', 'Edit', 'Bash'],
  tools_deny: [],
  executor_uri: 'fulcrum://worker/subprocess',
  stability: 'stable',
  system_prompt: 'You are a senior TypeScript engineer...',
  capabilities: ['code_generation', 'code_review', 'refactoring'],
})
```

---

## A2A Agent Cards

`buildA2ACard` produces a standard [A2A protocol](https://google.github.io/A2A/) `AgentCard` from an `AgentDefinition`:

```typescript
import { buildA2ACard } from 'fulcrum-agent-core'

const card = buildA2ACard(agentDefinition, 'https://agents.example.com/run')
// → { name, description, url, version, capabilities, skills, ... }
```

The monitor server also serves `GET /.well-known/agent.json` dynamically — see [monitor.md](monitor.md).

---

## Teams

Define a typed team template, then invoke it:

```typescript
import { createTeamTemplate, invokeTeam } from 'fulcrum-teams'

await createTeamTemplate({
  workspace_id: 'ws_1',
  name: 'implementation_squad',
  slots: [
    { role: 'chief_of_staff',    min: 1, max: 1 },
    { role: 'software_engineer', min: 1, max: 3 },
    { role: 'code_reviewer',     min: 1, max: 1 },
  ],
  communication_policy: 'hub_and_spoke',
  budget_class: 'medium',
  quality_class: 'standard',
})

const team = await invokeTeam({
  workspace_id: 'ws_1',
  template_name: 'implementation_squad',
  task_id: task.task_id,
  purpose: 'implement_auth_feature',
})
```

Team scheduling caps: global (8 concurrent), per-project (4), per-template (2). Only roles with `can_invoke_teams` (i.e., `chief_of_staff`) can invoke teams — enforced by the policy engine via `canInvokeTeams()`.

### CLI

```bash
fulcrum team list [--workspace-id W]
fulcrum team create --name N [--workspace-id W]
fulcrum team invoke --template-id T --workspace-id W --caller-role R --purpose P [--project-id P]
fulcrum team instances --workspace-id W [--project-id P]
```
