# @fulcrum/teams

Agent team orchestration — define typed team templates, spawn team instances with slot-based role routing, enforce concurrency caps, and track instance lifecycle from creation through completion.

## Key Concepts

### TeamTemplate

A reusable blueprint stored in the database. It declares the roles a team needs (`slots`) and the policies that govern how the team operates.

### TeamSlot

Each slot defines one role in the team:

| Field | Purpose |
|---|---|
| `role` | The `AgentRole` that fills this slot |
| `min_count` / `max_count` | Minimum and maximum agents allowed |
| `concurrency_cap` | Hard cap on simultaneous active agents in this slot |
| `required` | Whether the slot must be filled before the team can run |
| `spawn_mode` | `'auto'` (runtime fills it) or `'manual'` (caller fills it) |
| `write_level` | Permission level: `read_only`, `comment`, `write`, `admin` |
| `allowed_tools` | Tool allowlist for agents in this slot |

### TeamPolicy

Governs team-wide behaviour:

| Field | Type | Values |
|---|---|---|
| `communication_mode` | `CommunicationMode` | `broadcast`, `direct`, `hub_and_spoke` |
| `worktree_policy` | `WorktreePolicy` | `per_slot`, `shared`, `none` |
| `budget_class` | `BudgetClass` | `small`, `medium`, `large` |
| `latency_class` | `LatencyClass` | `fast`, `normal`, `slow` |
| `quality_class` | `QualityClass` | `draft`, `standard`, `high` |

### TeamInstance

A live instantiation of a template. Tracks `status` (`created → ready → spawning → running → waiting → blocked → completed/failed/cancelled`) and `status_category` (`backlog`, `active`, `blocked`, `done`).

### Concurrency caps (scheduler)

Before every `invokeTeam` call, `canStartTeam` checks three caps in order:

| Cap | Default |
|---|---|
| Global (per workspace) | 8 |
| Per project | 4 |
| Per template | 2 |

All caps are configurable via `SchedulerConfig`. If any cap is exceeded, `invokeTeam` throws with code `rate_limited`.

### Access control

Per spec §17.4, **only `chief_of_staff`** may invoke teams. Attempting to call `invokeTeam` with any other role throws `POLICY_DENIED`.

## Usage

```typescript
import {
  createTeamTemplate,
  invokeTeam,
  heartbeatTeam,
  completeTeam,
  listTeamInstances,
  getTeamStatus,
} from '@fulcrum/teams'

// 1. Define a reusable team template
const template = await createTeamTemplate({
  name: 'Feature Team',
  description: 'Full-stack feature delivery team',
  slots: [
    {
      slot_id: 'lead',
      role: 'senior_engineer',
      min_count: 1,
      max_count: 1,
      concurrency_cap: 1,
      required: true,
      write_level: 'write',
    },
    {
      slot_id: 'reviewer',
      role: 'reviewer',
      min_count: 1,
      max_count: 2,
      concurrency_cap: 2,
      required: false,
      write_level: 'comment',
    },
  ],
  policy: {
    communication_mode: 'hub_and_spoke',
    worktree_policy: 'per_slot',
    budget_class: 'medium',
    quality_class: 'standard',
  },
})

// 2. Spawn a team instance (caller must be chief_of_staff)
const instance = await invokeTeam({
  template_id: template.template_id,
  workspace_id: 'ws_main',
  project_id: 'proj_01J...',
  purpose: 'Implement OAuth2 login flow',
  task_id: 'task_01J...',
  caller_agent_id: 'agent_cos_01J...',
  caller_role: 'chief_of_staff',
})

// 3. Update status as the team progresses
await heartbeatTeam({
  instance_id: instance.instance_id,
  status: 'running',
  resolved_slots: { lead: ['agent_eng_01J...'] },
})

// 4. Check slot occupancy and concurrency violations
const status = await getTeamStatus({
  instance_id: instance.instance_id,
  workspace_id: 'ws_main',
})
// status.slot_occupancy['lead'] → { current: 1, max: 1, agents: ['agent_eng_01J...'] }
// status.concurrency_cap_violations → [] (empty = no violations)

// 5. Complete (or fail/cancel) the team
await completeTeam({ instance_id: instance.instance_id, final_status: 'completed' })

// 6. List active instances for a project
const active = await listTeamInstances({
  workspace_id: 'ws_main',
  project_id: 'proj_01J...',
  status_category: 'active',
})
```

### Check if a team can start (before invoking)

```typescript
import { canStartTeam } from '@fulcrum/teams'
import { getDb } from '@fulcrum/core'

const decision = canStartTeam(getDb(), {
  workspace_id: 'ws_main',
  project_id: 'proj_01J...',
  template_id: template.template_id,
})
if (!decision.allowed) {
  console.log(decision.reason)   // e.g. 'per-template concurrency cap reached (2/2)'
  console.log(decision.counts)   // { global: 5, project: 3, template: 2 }
}
```

## API

```typescript
// Templates
createTeamTemplate(input: CreateTeamTemplateInput): Promise<TeamTemplate>

// Instance lifecycle
invokeTeam(input: InvokeTeamInput): Promise<TeamInstance>
heartbeatTeam(input: HeartbeatTeamInput): Promise<TeamInstance>
completeTeam(input: CompleteTeamInput): Promise<TeamInstance>

// Queries
listTeamInstances(input: ListTeamInstancesInput): Promise<TeamInstance[]>
getTeamStatus(input: GetTeamStatusInput): Promise<TeamStatus>

// Scheduler (lower-level, used internally by invokeTeam)
canStartTeam(db, input, config?: SchedulerConfig): ScheduleDecision
```

### Input types

| Type | Key fields |
|---|---|
| `CreateTeamTemplateInput` | `name`, `slots`, `description?`, `policy?` |
| `InvokeTeamInput` | `template_id`, `workspace_id`, `purpose`, `caller_agent_id`, `caller_role`, `project_id?`, `task_id?`, `initial_slots?` |
| `HeartbeatTeamInput` | `instance_id`, `status`, `resolved_slots?` |
| `CompleteTeamInput` | `instance_id`, `final_status` (`completed` \| `failed` \| `cancelled`) |
| `ListTeamInstancesInput` | `workspace_id`, `project_id?`, `status_category?`, `limit?`, `offset?` |
| `GetTeamStatusInput` | `instance_id`, `workspace_id` |
| `SchedulerConfig` | `global_cap?` (8), `per_project_cap?` (4), `per_template_cap?` (2) |

## Database tables owned

This package owns tables: `team_templates`, `team_instances`, `team_members`.
