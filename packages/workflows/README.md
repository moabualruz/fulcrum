# @fulcrum/workflows

DAG-based workflow engine — define, register, and execute multi-step agent workflows with typed step transitions and run state tracking.

## Key Concepts

| Concept | Description |
|---|---|
| `WorkflowDefinition` | Named, versioned workflow with an ordered set of `WorkflowStepDef` nodes |
| `WorkflowStepDef` | A single step: `step_type`, `config`, optional `depends_on` list, retry + timeout limits |
| `WorkflowStepType` | 21 step types — `prompt_user`, `spawn_agent`, `create_task`, `wait_for_task`, `branch`, `parallel`, `gate`, `complete`, and more |
| `WorkflowStepState` | Runtime state for one step: `status`, `result`, `error`, `attempts`, timestamps |
| `WorkflowRun` | Full execution record — links the run to a workspace/project/task, tracks all step states, `current_step_id`, `handoff_refs`, `artifact_refs` |
| `WorkflowRegistry` | In-process store for `WorkflowDefinition` objects; includes 4 built-in workflows (`grill-me`, `write-a-prd`, `prd-to-plan`, `prd-to-issues`) |
| Engine | Pure DAG functions: `nextReadySteps()` (dependency resolution), `initStepStates()`, `computeStatusCategory()` |

### Step lifecycle

```
pending → running → completed
                 ↘ waiting (prompt_user / wait_for_task — resumes via resumeWorkflow)
                 ↘ failed
                 ↘ skipped
```

### Run status

`created` → `running` → `waiting_input` / `waiting_dependency` → `completed` / `failed` / `cancelled`

## Usage

### Defining and registering a workflow

```typescript
import { registry } from '@fulcrum/workflows'
import type { WorkflowDefinition } from '@fulcrum/workflows'

const myWorkflow: WorkflowDefinition = {
  name: 'triage-issue',
  version: '1.0',
  description: 'Triage an incoming issue and assign it',
  steps: [
    { step_id: 'read', step_type: 'read_memory', name: 'Load project context', config: {} },
    { step_id: 'classify', step_type: 'spawn_agent', name: 'Classify issue', config: { role: 'classifier' }, depends_on: ['read'] },
    { step_id: 'assign', step_type: 'create_task', name: 'Create follow-up task', config: {}, depends_on: ['classify'] },
    { step_id: 'done', step_type: 'complete', name: 'Complete', config: {}, depends_on: ['assign'] },
  ],
}

registry.register(myWorkflow)
```

### Starting a run

```typescript
import { startWorkflow } from '@fulcrum/workflows'

const run = await startWorkflow({
  workflow_name: 'triage-issue',
  workspace_id: 'ws_01',
  project_id: 'proj_01',
  task_id: 'task_42',
})
// run.status === 'running'
// run.current_step_id === 'read'
```

### Advancing a step

```typescript
import { stepWorkflow } from '@fulcrum/workflows'

const run = await stepWorkflow({
  wf_id: run.wf_id,
  workspace_id: 'ws_01',
  step_id: 'read',
  result: { context: 'loaded' },
})
// 'read' is now completed; 'classify' is now running
```

### Pausing and resuming (prompt_user / wait_for_task)

```typescript
// Pause — call stepWorkflow without a result
await stepWorkflow({ wf_id, workspace_id, step_id: 'ask' })
// run.status === 'waiting_input'

// Resume — provide the user's answer
import { resumeWorkflow } from '@fulcrum/workflows'
const resumed = await resumeWorkflow({
  wf_id,
  workspace_id: 'ws_01',
  resume_data: { answer: 'Build a widget' },
})
```

### Cancelling a run

```typescript
import { cancelWorkflow } from '@fulcrum/workflows'

await cancelWorkflow({ wf_id, workspace_id: 'ws_01', reason: 'superseded' })
```

### Listing available workflows

```typescript
import { listWorkflows } from '@fulcrum/workflows'

const defs = await listWorkflows()
// Returns all registered WorkflowDefinition objects
```

## API

### Registry

| Function / Method | Signature | Description |
|---|---|---|
| `registry.register` | `(def: WorkflowDefinition) => void` | Register a custom workflow definition |
| `registry.getDefinition` | `(name: string) => WorkflowDefinition \| undefined` | Look up a definition by name |
| `registry.listAll` | `() => WorkflowDefinition[]` | List all registered definitions |

### Workflow runs

| Function | Signature | Description |
|---|---|---|
| `startWorkflow` | `(input: StartWorkflowInput) => Promise<WorkflowRun>` | Create a run and advance first ready steps to `running` |
| `stepWorkflow` | `(input: StepWorkflowInput) => Promise<WorkflowRun>` | Complete (or pause) one step; advance next ready steps |
| `resumeWorkflow` | `(input: ResumeWorkflowInput) => Promise<WorkflowRun>` | Resume a `waiting_input` or `waiting_dependency` run |
| `cancelWorkflow` | `(input: CancelWorkflowInput) => Promise<WorkflowRun>` | Cancel a run with an optional reason |
| `getWorkflowRun` | `(input: GetWorkflowRunInput) => Promise<WorkflowRun>` | Fetch the current state of a run |
| `listWorkflows` | `() => Promise<WorkflowDefinition[]>` | Return all registered workflow definitions |

### Engine (pure functions)

| Function | Signature | Description |
|---|---|---|
| `nextReadySteps` | `(states, defs) => string[]` | Return step IDs whose dependencies are all `completed` |
| `initStepStates` | `(defs) => WorkflowStepState[]` | Initialise all steps as `pending` |
| `computeStatusCategory` | `(states) => 'active' \| 'blocked' \| 'done'` | Derive top-level status category from step states |

## Built-in Workflows

| Name | Description |
|---|---|
| `grill-me` | Interactive discovery — ask questions, search web, read + write memory |
| `write-a-prd` | PRD generation from memory + user prompts via `prd_planner` agent |
| `prd-to-plan` | Generate implementation plan from PRD via `implementation_planner` agent |
| `prd-to-issues` | Decompose PRD into issues via `issue_decomposer` agent |
