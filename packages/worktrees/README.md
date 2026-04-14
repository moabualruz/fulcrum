# @fulcrum/worktrees

Code worktree lifecycle management — worktree provisioning, artifact tracking, and code review workflows for agent-driven development.

## Key Concepts

| Concept | Description |
|---|---|
| `Worktree` | An isolated git workspace tied to a branch, task, or agent run. Progresses through a strict status lifecycle. |
| `WorktreeStatus` | `allocated` → `dirty` → `ready_for_merge` → `merged` / `discarded` |
| `Artifact` | An output file (PRD, plan, diff, report, etc.) owned by a task, run, or worktree. Has a `status` (`draft` / `final` / `archived`) and an optional `content_hash`. |
| `ArtifactType` | `prd`, `plan`, `review`, `test_report`, `code_diff`, `log`, `spec`, `diagram`, `document`, `config` |
| `Review` | A review request against a `task`, `artifact`, or `worktree`. Tracks `status` (`pending` / `changes_requested` / `approved` / `rejected`) and an optional `reviewer_agent_id`. |
| `Handoff` | Structured handoff record from one agent to another — goal, scope, constraints, done criteria, artifact contract reference, and handoff mode. |
| `ArtifactContract` | Declares which artifacts are required/optional for a task to be considered merge-ready. |
| Merge queue | FIFO queue of `ready_for_merge` worktrees. Processing is policy-gated to `integration_worker` role. |

### Worktree lifecycle

```
allocated → dirty → ready_for_merge → merged
                                    ↘ discarded
↓ (any state except merged/discarded)
discarded
```

## Usage

### Allocating a worktree

```typescript
import { allocateWorktree } from '@fulcrum/worktrees'

const wt = await allocateWorktree({
  workspace_id: 'ws_01',
  project_id: 'proj_01',
  branch_name: 'feature/my-task',
  path: '/tmp/worktrees/my-task',
  task_id: 'task_42',   // optional
})
// wt.status === 'allocated'
// wt.worktree_id === 'wt_01J...'
```

### Transitioning through the lifecycle

```typescript
import { markDirty, markReadyForMerge, enqueueMerge } from '@fulcrum/worktrees'

// Agent has made changes
await markDirty({ worktree_id: wt.worktree_id })

// Agent has finished and passed checks
await markReadyForMerge({ worktree_id: wt.worktree_id })

// Signal intent to merge (validates state, priority hint for future use)
await enqueueMerge({ worktree_id: wt.worktree_id })
```

### Processing the merge queue (integration_worker only)

```typescript
import { processMergeQueue } from '@fulcrum/worktrees'

const results = await processMergeQueue('proj_01', 'integration_worker')
// results[0].success === true
// results[0].merged_at === '2026-...'
```

### Discarding a worktree

```typescript
import { discardWorktree } from '@fulcrum/worktrees'

await discardWorktree({ worktree_id: wt.worktree_id, reason: 'stale branch' })
```

### Inspecting the merge queue

```typescript
import { listMergeQueue } from '@fulcrum/worktrees'

const queue = await listMergeQueue('proj_01')
// Returns ready_for_merge worktrees ordered FIFO by created_at
```

## API

### Worktree lifecycle

| Function | Signature | Description |
|---|---|---|
| `allocateWorktree` | `(input: AllocateWorktreeInput) => Promise<Worktree>` | Create a new worktree in `allocated` state |
| `markDirty` | `(input: MarkDirtyInput) => Promise<Worktree>` | Transition `allocated` → `dirty` (agent has written changes) |
| `markReadyForMerge` | `(input: MarkReadyInput) => Promise<Worktree>` | Transition `dirty` → `ready_for_merge` |
| `enqueueMerge` | `(input: EnqueueMergeInput) => Promise<void>` | Validate worktree is `ready_for_merge`; priority hint for future use |
| `processMergeQueue` | `(projectId, callerRole) => Promise<MergeResult[]>` | Policy-gated (integration_worker only): mark all queued worktrees `merged` |
| `discardWorktree` | `(input: DiscardWorktreeInput) => Promise<void>` | Mark worktree `discarded`; blocks if already `merged` or `discarded` |
| `listMergeQueue` | `(projectId: string) => Promise<Worktree[]>` | List all `ready_for_merge` worktrees for a project (FIFO) |

### Types

| Type | Values / Shape |
|---|---|
| `WorktreeStatus` | `'allocated' \| 'dirty' \| 'ready_for_merge' \| 'merged' \| 'discarded'` |
| `ArtifactStatus` | `'draft' \| 'final' \| 'archived'` |
| `ArtifactType` | `'prd' \| 'plan' \| 'review' \| 'test_report' \| 'code_diff' \| 'log' \| 'spec' \| 'diagram' \| 'document' \| 'config'` |
| `ReviewStatus` | `'pending' \| 'changes_requested' \| 'approved' \| 'rejected'` |
| `ReviewTargetType` | `'task' \| 'artifact' \| 'worktree'` |
| `HandoffMode` | `'brief' \| 'contextual' \| 'artifact_first_brief' \| 'branched_session'` |
| `MergeResult` | `{ worktree_id, branch_name, success, error?, merged_at? }` |
