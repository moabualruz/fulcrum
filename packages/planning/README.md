# @fulcrum/planning

Project planning domain for Fulcrum agent systems. Provides epics, issues, PRDs, implementation plans, task relations, and code review workflows — all persisted in the shared SQLite database from `@fulcrum/core`.

## What it does

- **Epics** — high-level work groupings with status lifecycle (`backlog → in_progress → done`)
- **Issues** — decomposed work items, nestable via `parent_issue_id`, linkable to epics
- **PRDs** — product requirement documents with draft/review/approved/archived lifecycle
- **Plans** — implementation plans linked to PRDs and issues
- **Task Relations** — directed relationships between tasks (`blocks`, `follows`, `conflicts_with`, etc.)
- **Reviews** — code/artifact/worktree review records with status tracking

## Setup

Requires `@fulcrum/core` to be initialized first (migrations applied, DB available).

```typescript
import { runMigrations } from '@fulcrum/core'
runMigrations()  // planning tables are included in core migrations
```

## Usage

```typescript
import { createEpic, createIssue, createReview, addTaskRelation } from '@fulcrum/planning'

// Create an epic
const epic = await createEpic({
  workspace_id: 'ws_main',
  project_id: 'proj_1',
  title: 'Authentication system',
  priority: 'high',
})

// Create an issue under the epic
const issue = await createIssue({
  workspace_id: 'ws_main',
  project_id: 'proj_1',
  epic_id: epic.epic_id,
  title: 'Implement OAuth2 login flow',
  priority: 'high',
  estimate_type: 'story_points',
  estimate_value: 5,
})

// Create a nested sub-issue
const sub = await createIssue({
  workspace_id: 'ws_main',
  project_id: 'proj_1',
  parent_issue_id: issue.issue_id,
  title: 'Add Google provider',
})

// Open a code review for a task
const review = await createReview({
  workspace_id: 'ws_main',
  project_id: 'proj_1',
  target_type: 'task',
  target_id: 'task_01HXYZ',
  reviewer_agent_id: 'agent_reviewer',
})

// Mark it approved
await updateReview({
  review_id: review.review_id,
  workspace_id: 'ws_main',
  status: 'approved',
  summary: 'Looks good — no issues found',
})

// Add a task dependency
await addTaskRelation({
  workspace_id: 'ws_01HABC',
  task_id: 'task_01HABC',
  target_task_id: 'task_01HXYZ',
  relation_type: 'blocks',
})
```

## API

### Epics
| Function | Description |
|---|---|
| `createEpic(input)` | Create an epic in `backlog` status |
| `updateEpic(input)` | Update title, description, priority, or status (optimistic lock) |
| `listEpics(input)` | List epics filtered by project, status, or status category |

### Issues
| Function | Description |
|---|---|
| `createIssue(input)` | Create an issue, optionally linked to an epic or parent issue |
| `updateIssue(input)` | Update title, status, assignee, estimate, or labels (optimistic lock) |
| `listIssues(input)` | List issues filtered by epic, parent, status, assignee, or project |

### PRDs
| Function | Description |
|---|---|
| `createPRD(input)` | Create a PRD in `draft` status, optionally linked to an epic |
| `updatePRD(input)` | Update title, description, status, or linked epic (optimistic lock) |
| `listPRDs(input)` | List PRDs filtered by project or status |

### Plans
| Function | Description |
|---|---|
| `createPlan(input)` | Create an implementation plan, optionally linked to a PRD |
| `updatePlan(input)` | Update title, description, status, or linked PRD (optimistic lock) |
| `listPlans(input)` | List plans filtered by project or status |
| `linkIssueToPlan(input)` | Associate an issue with a plan |

### Task Relations
| Function | Description |
|---|---|
| `addTaskRelation(input)` | Add a directed relation between two tasks |
| `removeTaskRelation(input)` | Remove a specific relation |
| `getTaskRelations(input)` | Get all relations for a task |
| `getBlockers(input)` | Get tasks that block the given task in a workspace |

### Reviews
| Function | Description |
|---|---|
| `createReview(input)` | Open a review for a task, artifact, or worktree |
| `updateReview(input)` | Update review status (`approved`, `changes_requested`, `rejected`) and summary |
| `getReview(reviewId, workspaceId)` | Fetch a single review by ID |
| `listReviews(input)` | List reviews filtered by target, status, or reviewer |

## Types

Key status enums:

| Type | Values |
|---|---|
| `EpicStatus` | `backlog`, `in_progress`, `done`, `cancelled` |
| `IssueStatus` | `backlog`, `ready`, `in_progress`, `blocked`, `in_review`, `done`, `cancelled` |
| `PRDStatus` | `draft`, `review`, `approved`, `archived` |
| `PlanStatus` | `draft`, `active`, `completed`, `archived` |
| `ReviewStatus` | `pending`, `changes_requested`, `approved`, `rejected` |
| `TaskRelationType` | `blocks`, `blocked_by`, `follows`, `preceded_by`, `relates`, `duplicates`, `requires_context_from`, `must_merge_before`, `conflicts_with`, `reviewed_by`, `verifies` |

## Database tables owned

This package does not own any tables directly. It reads and writes to tables migrated and owned by `@fulcrum/core`: `epics`, `issues`, `issue_labels`, `prds`, `plans`, `plan_issues`, `prd_plans`, `task_relations`, `task_labels`.
