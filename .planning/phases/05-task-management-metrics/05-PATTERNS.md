# Phase 5: Task Management + Metrics — Pattern Map

**Mapped:** 2026-05-05
**Files analyzed:** 34 new/modified files
**Analogs found:** 32 / 34

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/db/entities/tasks/TaskComment.ts` | entity | CRUD | `src/db/entities/tasks/Sprint.ts` | exact |
| `src/db/entities/tasks/TaskWatcher.ts` | entity | CRUD | `src/db/entities/tasks/MetricsCache.ts` | exact |
| `src/db/entities/tasks/CommentReaction.ts` | entity | CRUD | `src/db/entities/tasks/MetricsCache.ts` | exact |
| `src/db/entities/tasks/TaskRelationship.ts` | entity | CRUD | `src/db/entities/tasks/Task.ts` | exact |
| `src/db/entities/tasks/ProjectAutomation.ts` | entity | event-driven | `src/db/entities/tasks/Sprint.ts` | role-match |
| `src/db/entities/tasks/FieldDependencyRule.ts` | entity | CRUD | `src/db/entities/tasks/MetricsCache.ts` | exact |
| `src/db/entities/tasks/Task.ts` (extend) | entity | CRUD | self | extend |
| `src/db/entities/tasks/Sprint.ts` (extend) | entity | CRUD | self | extend |
| `src/db/entities/tasks/MetricsCache.ts` (extend) | entity | batch | self | extend |
| `src/db/entities/core/Event.ts` (extend) | entity | event-driven | self | extend |
| `src/db/migrations/Migration20260505XXXXXX_phase5_task_entities.ts` | migration | batch | `src/db/migrations/Migration20260505042000_skill_supply_chain.ts` | exact |
| `src/services/CommentService.ts` | service | CRUD | `src/services/TaskService.ts` | exact |
| `src/services/ReportService.ts` | service | batch | `src/services/SprintService.ts` | role-match |
| `src/services/AutomationService.ts` | service | event-driven | `src/services/TaskService.ts` | role-match |
| `src/services/WorkflowService.ts` | service | request-response | `src/services/SprintService.ts` | role-match |
| `src/workers/metrics-rollup.ts` | worker | batch | `src/workers/registry.ts` | exact |
| `src/server/trpc/routers/comments.ts` | router | CRUD | `src/server/trpc/routers/tasks.ts` | exact |
| `src/server/trpc/routers/reports.ts` | router | request-response | `src/server/trpc/routers/sprints.ts` | role-match |
| `src/server/trpc/routers/automations.ts` | router | CRUD | `src/server/trpc/routers/tasks.ts` | exact |
| `src/server/trpc/routers/workflows.ts` | router | request-response | `src/server/trpc/routers/sprints.ts` | role-match |
| `src/web/src/lib/components/tasks/TaskDetailPanel.svelte` | component | request-response | `src/web/src/lib/components/tasks/TaskTable.svelte` | role-match |
| `src/web/src/lib/components/tasks/TaskComments.svelte` | component | CRUD | `src/web/src/lib/components/tasks/TaskList.svelte` | role-match |
| `src/web/src/lib/components/tasks/WatcherList.svelte` | component | CRUD | `src/web/src/lib/components/tasks/TaskList.svelte` | role-match |
| `src/web/src/lib/components/tasks/BulkActionBar.svelte` | component | event-driven | `src/web/src/lib/components/tasks/TaskTable.svelte` | exact |
| `src/web/src/lib/components/reports/BurndownChart.svelte` | component | batch | none | no-analog |
| `src/web/src/lib/components/reports/VelocityChart.svelte` | component | batch | none | no-analog |
| `src/web/src/lib/components/reports/CfdChart.svelte` | component | batch | none | no-analog |
| `src/web/src/lib/components/reports/CycleTimeChart.svelte` | component | batch | none | no-analog |
| `src/web/src/routes/projects/[id]/gantt/+page.svelte` | route | request-response | `src/web/src/lib/components/tasks/TaskTable.svelte` | role-match |
| `src/web/src/routes/projects/[id]/reports/+page.svelte` (rewrite) | route | batch | self | rewrite |

---

## Pattern Assignments

### `src/db/entities/tasks/TaskComment.ts` (entity, CRUD)

**Analog:** `src/db/entities/tasks/Sprint.ts`

**Imports pattern** (`Sprint.ts` lines 1-13):
```typescript
import {
  Entity,
  Index,
  ManyToOne,
  PrimaryKey,
  Property,
} from "@mikro-orm/decorators/es";
import { OptionalProps } from "@mikro-orm/core";

import { Org } from "../auth/Org.ts";
```

**Core entity pattern** (`Sprint.ts` lines 28-98, adapted for TaskComment):
```typescript
@Entity({ tableName: "task_comments" })
@Index({ name: "task_comments_task_id", properties: ["taskId"] })
@Index({ name: "task_comments_org_task", properties: ["org", "taskId"] })
export class TaskComment {
  [OptionalProps]?:
    | "createdAt"
    | "updatedAt"
    | "resolved"
    | "resolvedAt"
    | "resolvedBy"
    | "parentCommentId";

  @PrimaryKey({ type: "uuid", defaultRaw: "gen_random_uuid()" })
  id!: string;

  @ManyToOne(() => Org, { fieldName: "org_id", nullable: false, deleteRule: "cascade" })
  org!: Org;

  // CRITICAL: explicit `type` on every @Property — Stage-3 decorators do NOT use reflect-metadata
  @Property({ type: "uuid", fieldName: "task_id" })
  taskId!: string;

  @Property({ type: "uuid", fieldName: "author_id" })
  authorId!: string;

  @Property({
    type: "json",
    fieldName: "body",
    defaultRaw: "'{}'::jsonb",
    returning: false,
  })
  body: Record<string, unknown> = {};

  @Property({ type: "boolean", default: false })
  resolved: boolean = false;

  @Property({ type: "uuid", fieldName: "resolved_by", nullable: true })
  resolvedBy: string | null = null;

  @Property({ type: "datetime", fieldName: "resolved_at", nullable: true })
  resolvedAt: Date | null = null;

  @Property({ type: "uuid", fieldName: "parent_comment_id", nullable: true })
  parentCommentId: string | null = null;

  @Property({ type: "datetime", fieldName: "created_at", defaultRaw: "now()" })
  createdAt!: Date;

  @Property({ type: "datetime", fieldName: "updated_at", defaultRaw: "now()" })
  updatedAt!: Date;
}
```

---

### `src/db/entities/tasks/TaskWatcher.ts` (entity, CRUD)

**Analog:** `src/db/entities/tasks/MetricsCache.ts`

**Core entity pattern** (`MetricsCache.ts` lines 1-73, adapted):
```typescript
@Entity({ tableName: "task_watchers" })
@Unique({ name: "task_watchers_task_user_unique", properties: ["taskId", "userId"] })
@Index({ name: "task_watchers_task_id", properties: ["taskId"] })
export class TaskWatcher {
  [OptionalProps]?: "createdAt";

  @PrimaryKey({ type: "uuid", defaultRaw: "gen_random_uuid()" })
  id!: string;

  @ManyToOne(() => Org, { fieldName: "org_id", nullable: false, deleteRule: "cascade" })
  org!: Org;

  @Property({ type: "uuid", fieldName: "task_id" })
  taskId!: string;

  @Property({ type: "uuid", fieldName: "user_id" })
  userId!: string;

  // source enum: why subscribed (manual | mention | assign | create)
  @Property({
    type: "string",
    check: "source in ('manual','mention','assign','create')",
  })
  source!: "manual" | "mention" | "assign" | "create";

  @Property({ type: "datetime", fieldName: "created_at", defaultRaw: "now()" })
  createdAt!: Date;
}
```

---

### `src/db/entities/tasks/CommentReaction.ts` (entity, CRUD)

**Analog:** `src/db/entities/tasks/MetricsCache.ts`

**Core entity pattern:**
```typescript
@Entity({ tableName: "comment_reactions" })
@Unique({ name: "comment_reactions_unique", properties: ["commentId", "userId", "emoji"] })
@Index({ name: "comment_reactions_comment_id", properties: ["commentId"] })
export class CommentReaction {
  [OptionalProps]?: "createdAt";

  @PrimaryKey({ type: "uuid", defaultRaw: "gen_random_uuid()" })
  id!: string;

  @ManyToOne(() => Org, { fieldName: "org_id", nullable: false, deleteRule: "cascade" })
  org!: Org;

  @Property({ type: "uuid", fieldName: "comment_id" })
  commentId!: string;

  @Property({ type: "uuid", fieldName: "user_id" })
  userId!: string;

  // 6 standard reactions: 👍 👎 😄 🎉 😕 ❤️
  @Property({ type: "string" })
  emoji!: string;

  @Property({ type: "datetime", fieldName: "created_at", defaultRaw: "now()" })
  createdAt!: Date;
}
```

---

### `src/db/entities/tasks/TaskRelationship.ts` (entity, CRUD)

**Analog:** `src/db/entities/tasks/Task.ts`

**Imports pattern** (`Task.ts` lines 24-35):
```typescript
import {
  Entity,
  PrimaryKey,
  Property,
  ManyToOne,
  Index,
} from "@mikro-orm/decorators/es";
import { OptionalProps } from "@mikro-orm/core";
import { Org } from "../auth/Org.ts";
```

**Core entity pattern:**
```typescript
@Entity({ tableName: "task_relationships" })
@Unique({ name: "task_relationships_unique", properties: ["fromTaskId", "toTaskId", "type"] })
@Index({ name: "task_relationships_from_task", properties: ["fromTaskId"] })
@Index({ name: "task_relationships_to_task", properties: ["toTaskId"] })
export class TaskRelationship {
  [OptionalProps]?: "createdAt";

  @PrimaryKey({ type: "uuid", defaultRaw: "gen_random_uuid()" })
  id!: string;

  @ManyToOne(() => Org, { fieldName: "org_id", nullable: false, deleteRule: "cascade" })
  org!: Org;

  @Property({ type: "uuid", fieldName: "from_task_id" })
  fromTaskId!: string;

  @Property({ type: "uuid", fieldName: "to_task_id" })
  toTaskId!: string;

  // blocks | blocked_by | relates_to | duplicate_of
  @Property({
    type: "string",
    check: "type in ('blocks','blocked_by','relates_to','duplicate_of')",
  })
  type!: "blocks" | "blocked_by" | "relates_to" | "duplicate_of";

  @Property({ type: "uuid", fieldName: "created_by", nullable: true })
  createdBy: string | null = null;

  @Property({ type: "datetime", fieldName: "created_at", defaultRaw: "now()" })
  createdAt!: Date;
}
```

---

### `src/db/entities/tasks/ProjectAutomation.ts` (entity, event-driven)

**Analog:** `src/db/entities/tasks/Sprint.ts`

**Core entity pattern:**
```typescript
@Entity({ tableName: "project_automations" })
@Index({ name: "project_automations_project_id", properties: ["projectId"] })
export class ProjectAutomation {
  [OptionalProps]?: "createdAt" | "updatedAt" | "enabled" | "executionCount" | "condition";

  @PrimaryKey({ type: "uuid", defaultRaw: "gen_random_uuid()" })
  id!: string;

  @ManyToOne(() => Org, { fieldName: "org_id", nullable: false, deleteRule: "cascade" })
  org!: Org;

  @Property({ type: "uuid", fieldName: "project_id" })
  projectId!: string;

  @Property({ type: "string" })
  name!: string;

  @Property({ type: "string", fieldName: "trigger_type" })
  triggerType!: string;

  @Property({
    type: "json",
    fieldName: "trigger_config",
    defaultRaw: "'{}'::jsonb",
    returning: false,
  })
  triggerConfig: Record<string, unknown> = {};

  @Property({
    type: "json",
    fieldName: "condition",
    nullable: true,
    returning: false,
  })
  condition: Record<string, unknown> | null = null;

  @Property({ type: "string", fieldName: "action_type" })
  actionType!: string;

  @Property({
    type: "json",
    fieldName: "action_config",
    defaultRaw: "'{}'::jsonb",
    returning: false,
  })
  actionConfig: Record<string, unknown> = {};

  @Property({ type: "boolean", default: true })
  enabled: boolean = true;

  @Property({ type: "integer", fieldName: "execution_count", default: 0 })
  executionCount: number = 0;

  @Property({ type: "datetime", fieldName: "created_at", defaultRaw: "now()" })
  createdAt!: Date;

  @Property({ type: "datetime", fieldName: "updated_at", defaultRaw: "now()" })
  updatedAt!: Date;
}
```

---

### `src/db/entities/tasks/FieldDependencyRule.ts` (entity, CRUD)

**Analog:** `src/db/entities/tasks/MetricsCache.ts`

**Core entity pattern:**
```typescript
@Entity({ tableName: "field_dependency_rules" })
@Index({ name: "field_dependency_rules_project_id", properties: ["projectId"] })
export class FieldDependencyRule {
  [OptionalProps]?: "createdAt";

  @PrimaryKey({ type: "uuid", defaultRaw: "gen_random_uuid()" })
  id!: string;

  @ManyToOne(() => Org, { fieldName: "org_id", nullable: false, deleteRule: "cascade" })
  org!: Org;

  @Property({ type: "uuid", fieldName: "project_id" })
  projectId!: string;

  @Property({ type: "uuid", fieldName: "source_field_id" })
  sourceFieldId!: string;

  @Property({ type: "string", fieldName: "source_value" })
  sourceValue!: string;

  @Property({ type: "uuid", fieldName: "target_field_id" })
  targetFieldId!: string;

  // show | hide | require
  @Property({
    type: "string",
    check: "action in ('show','hide','require')",
  })
  action!: "show" | "hide" | "require";

  @Property({ type: "datetime", fieldName: "created_at", defaultRaw: "now()" })
  createdAt!: Date;
}
```

---

### `src/db/entities/tasks/Task.ts` — extend (entity, CRUD)

**Action:** Add missing columns per RESEARCH.md entity audit. Extend `[OptionalProps]` union and add properties after existing ones.

**Extension pattern** (add after `deletedAt` property, line 182 of `Task.ts`):
```typescript
// Phase 5 domain columns — Migration20260505XXXXXX adds these to DB
@Property({ type: "date", fieldName: "due_date", nullable: true })
dueDate: Date | null = null;

@Property({ type: "date", fieldName: "start_date", nullable: true })
startDate: Date | null = null;

@Property({ type: "datetime", fieldName: "started_at", nullable: true })
startedAt: Date | null = null;

@Property({ type: "string", fieldName: "assignee_id", nullable: true })
assigneeId: string | null = null;

// text[] via @Property({ type: "array" }) — PostgreSQL native array
@Property({ type: "array", fieldName: "labels", default: [] })
labels: string[] = [];

@Property({ type: "uuid", fieldName: "project_id", nullable: true })
projectId: string | null = null;
```

**Also add to `[OptionalProps]`** (line 76):
```typescript
| "dueDate"
| "startDate"
| "startedAt"
| "assigneeId"
| "labels"
| "projectId"
```

---

### `src/db/entities/tasks/Sprint.ts` — extend (entity, CRUD)

**Action:** Add `retrospectiveNotes` and `closedSummary` per D-29.

**Extension pattern** (add after `retroDocId` property, line 92):
```typescript
@Property({
  type: "json",
  fieldName: "retrospective_notes",
  nullable: true,
  returning: false,
})
retrospectiveNotes: Record<string, unknown> | null = null;

@Property({
  type: "json",
  fieldName: "closed_summary",
  nullable: true,
  returning: false,
})
closedSummary: {
  carried: number;
  added: number;
  removed: number;
  scope_change_pct: number;
} | null = null;
```

**Also add to `[OptionalProps]`** (line 40):
```typescript
| "retrospectiveNotes"
| "closedSummary"
```

---

### `src/db/entities/tasks/MetricsCache.ts` — extend (entity, batch)

**Action:** Add D-32 columns for two-layer analytics model.

**Extension pattern** (add after `wipCount`, before `updatedAt`):
```typescript
// D-32: scope_type discriminator
@Property({
  type: "string",
  fieldName: "scope_type",
  default: "sprint",
  check: "scope_type in ('sprint','project','epic')",
})
scopeType: "sprint" | "project" | "epic" = "sprint";

@Property({ type: "uuid", fieldName: "scope_id", nullable: true })
scopeId: string | null = null;

@Property({ type: "integer", fieldName: "points_total", default: 0 })
pointsTotal: number = 0;

@Property({ type: "integer", fieldName: "tasks_total", default: 0 })
tasksTotal: number = 0;

@Property({
  type: "json",
  fieldName: "status_counts",
  defaultRaw: "'{}'::jsonb",
  returning: false,
})
statusCounts: Record<string, number> = {};

// Legacy column from product-kernel raw SQL — add to entity to avoid ORM mismatch
@Property({ type: "string", fieldName: "metric_kind", nullable: true })
metricKind: string | null = null;
```

**Also add to `[OptionalProps]`**:
```typescript
| "scopeType"
| "scopeId"
| "pointsTotal"
| "tasksTotal"
| "statusCounts"
| "metricKind"
```

---

### `src/db/migrations/Migration20260505XXXXXX_phase5_task_entities.ts` (migration, batch)

**Analog:** `src/db/migrations/Migration20260505042000_skill_supply_chain.ts`

**Full migration class pattern** (lines 1-79):
```typescript
import { Migration } from "@mikro-orm/migrations";

export class Migration20260505XXXXXX_phase5_task_entities extends Migration {
  static isLossy = true;  // alters existing tables

  override async up(): Promise<void> {
    // 1. Extend tasks table (missing domain columns)
    this.addSql(`alter table "tasks" add column if not exists "due_date" date`);
    this.addSql(`alter table "tasks" add column if not exists "start_date" date`);
    this.addSql(`alter table "tasks" add column if not exists "started_at" timestamptz`);
    this.addSql(`alter table "tasks" add column if not exists "assignee_id" uuid`);
    this.addSql(`alter table "tasks" add column if not exists "labels" text[] not null default '{}'`);
    this.addSql(`alter table "tasks" add column if not exists "project_id" uuid`);

    // 2. Extend sprints table
    this.addSql(`alter table "sprints" add column if not exists "retrospective_notes" jsonb`);
    this.addSql(`alter table "sprints" add column if not exists "closed_summary" jsonb`);

    // 3. Extend metrics_cache table (D-32)
    this.addSql(`alter table "metrics_cache" add column if not exists "scope_type" varchar(20) not null default 'sprint' check (scope_type in ('sprint','project','epic'))`);
    this.addSql(`alter table "metrics_cache" add column if not exists "scope_id" uuid`);
    this.addSql(`alter table "metrics_cache" add column if not exists "points_total" integer not null default 0`);
    this.addSql(`alter table "metrics_cache" add column if not exists "tasks_total" integer not null default 0`);
    this.addSql(`alter table "metrics_cache" add column if not exists "status_counts" jsonb not null default '{}'::jsonb`);
    this.addSql(`alter table "metrics_cache" add column if not exists "metric_kind" varchar(255)`);

    // 4. Extend events table (D-34)
    this.addSql(`alter table "events" add column if not exists "field_name" varchar(255)`);
    this.addSql(`alter table "events" add column if not exists "from_value" jsonb`);
    this.addSql(`alter table "events" add column if not exists "to_value" jsonb`);

    // 5. New tables
    this.addSql(`
      create table "task_comments" (
        "id" uuid not null default gen_random_uuid(),
        "org_id" uuid not null references "orgs"("id") on delete cascade,
        "task_id" uuid not null,
        "author_id" uuid not null,
        "body" jsonb not null default '{}'::jsonb,
        "parent_comment_id" uuid null references "task_comments"("id") on delete cascade,
        "resolved" boolean not null default false,
        "resolved_by" uuid null,
        "resolved_at" timestamptz null,
        "created_at" timestamptz not null default now(),
        "updated_at" timestamptz not null default now(),
        primary key ("id")
      )
    `);
    this.addSql(`create index "task_comments_task_id" on "task_comments" ("task_id")`);
    this.addSql(`create index "task_comments_org_task" on "task_comments" ("org_id", "task_id")`);

    this.addSql(`
      create table "task_watchers" (
        "id" uuid not null default gen_random_uuid(),
        "org_id" uuid not null references "orgs"("id") on delete cascade,
        "task_id" uuid not null,
        "user_id" uuid not null,
        "source" varchar(20) not null check (source in ('manual','mention','assign','create')),
        "created_at" timestamptz not null default now(),
        primary key ("id"),
        unique ("task_id", "user_id")
      )
    `);

    this.addSql(`
      create table "comment_reactions" (
        "id" uuid not null default gen_random_uuid(),
        "org_id" uuid not null references "orgs"("id") on delete cascade,
        "comment_id" uuid not null references "task_comments"("id") on delete cascade,
        "user_id" uuid not null,
        "emoji" varchar(10) not null,
        "created_at" timestamptz not null default now(),
        primary key ("id"),
        unique ("comment_id", "user_id", "emoji")
      )
    `);

    this.addSql(`
      create table "task_relationships" (
        "id" uuid not null default gen_random_uuid(),
        "org_id" uuid not null references "orgs"("id") on delete cascade,
        "from_task_id" uuid not null,
        "to_task_id" uuid not null,
        "type" varchar(20) not null check (type in ('blocks','blocked_by','relates_to','duplicate_of')),
        "created_by" uuid null,
        "created_at" timestamptz not null default now(),
        primary key ("id"),
        unique ("from_task_id", "to_task_id", "type")
      )
    `);
    this.addSql(`create index "task_relationships_from_task" on "task_relationships" ("from_task_id")`);
    this.addSql(`create index "task_relationships_to_task" on "task_relationships" ("to_task_id")`);

    this.addSql(`
      create table "project_automations" (
        "id" uuid not null default gen_random_uuid(),
        "org_id" uuid not null references "orgs"("id") on delete cascade,
        "project_id" uuid not null,
        "name" varchar(255) not null,
        "trigger_type" varchar(100) not null,
        "trigger_config" jsonb not null default '{}'::jsonb,
        "condition" jsonb null,
        "action_type" varchar(100) not null,
        "action_config" jsonb not null default '{}'::jsonb,
        "enabled" boolean not null default true,
        "execution_count" integer not null default 0,
        "created_at" timestamptz not null default now(),
        "updated_at" timestamptz not null default now(),
        primary key ("id")
      )
    `);

    this.addSql(`
      create table "field_dependency_rules" (
        "id" uuid not null default gen_random_uuid(),
        "org_id" uuid not null references "orgs"("id") on delete cascade,
        "project_id" uuid not null,
        "source_field_id" uuid not null,
        "source_value" varchar(255) not null,
        "target_field_id" uuid not null,
        "action" varchar(20) not null check (action in ('show','hide','require')),
        "created_at" timestamptz not null default now(),
        primary key ("id")
      )
    `);

    // 6. Add backlog to task_status_categories check constraint (D-22)
    // and standardize to US spelling 'canceled'
    this.addSql(`
      alter table "task_statuses"
        drop constraint if exists "task_statuses_category_check"
    `);
    this.addSql(`
      alter table "task_statuses"
        add constraint "task_statuses_category_check"
        check (category in ('backlog','unstarted','started','completed','canceled'))
    `);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "field_dependency_rules" cascade`);
    this.addSql(`drop table if exists "project_automations" cascade`);
    this.addSql(`drop table if exists "task_relationships" cascade`);
    this.addSql(`drop table if exists "comment_reactions" cascade`);
    this.addSql(`drop table if exists "task_watchers" cascade`);
    this.addSql(`drop table if exists "task_comments" cascade`);
    this.addSql(`alter table "events" drop column if exists "field_name"`);
    this.addSql(`alter table "events" drop column if exists "from_value"`);
    this.addSql(`alter table "events" drop column if exists "to_value"`);
    // MetricsCache and Task column drops omitted (isLossy = true)
  }
}
```

---

### `src/services/CommentService.ts` (service, CRUD)

**Analog:** `src/services/TaskService.ts`

**Imports pattern** (`TaskService.ts` lines 1-9):
```typescript
import { TRPCError } from "@trpc/server";
import type { EntityManager } from "@mikro-orm/postgresql";

import { Event } from "../db/entities/core/Event.ts";
import { Org } from "../db/entities/auth/Org.ts";
import { TaskComment } from "../db/entities/tasks/TaskComment.ts";
import { CommentReaction } from "../db/entities/tasks/CommentReaction.ts";
import { tipTapDocToText } from "../db/tasks-rich-text.ts";
```

**Service class pattern** (`TaskService.ts` lines 52-53, 80-95):
```typescript
export class CommentService {
  constructor(private readonly em: EntityManager) {}

  async list(orgId: string, taskId: string): Promise<CommentOutput[]> {
    const comments = await this.em.find(
      TaskComment,
      { org: orgId, taskId } as never,
      { orderBy: { createdAt: "ASC" } },
    );
    return comments.map(serializeComment);
  }

  async create(orgId: string, input: {
    taskId: string;
    authorId: string;
    body: Record<string, unknown>;
    parentCommentId?: string | null;
  }): Promise<CommentOutput> {
    const comment = this.em.create(TaskComment, {
      org: this.em.getReference(Org, orgId),
      taskId: input.taskId,
      authorId: input.authorId,
      body: input.body,
      parentCommentId: input.parentCommentId ?? null,
    });
    this.em.persist(comment);
    await emitCommentEvent(/* ctx */, { verb: "task.comment_added", ... });
    await this.em.flush();
    return serializeComment(comment);
  }

  async resolve(orgId: string, id: string, resolvedBy: string): Promise<CommentOutput | null> {
    const comment = await this.em.findOne(TaskComment, { org: orgId, id } as never);
    if (!comment) return null;
    comment.resolved = true;
    comment.resolvedBy = resolvedBy;
    comment.resolvedAt = new Date();
    comment.updatedAt = new Date();
    await this.em.flush();
    return serializeComment(comment);
  }
}
```

**Event emission pattern** (`TaskService.ts` lines 370-389):
```typescript
async function emitCommentEvent(ctx: { orgId: string; em: EntityManager | null }, input: {
  verb: "task.comment_added" | "task.comment_resolved";
  taskId: string;
  payload: Record<string, unknown>;
}): Promise<void> {
  if (!ctx.em) return;
  const event = ctx.em.create(Event, {
    org: ctx.em.getReference(Org, ctx.orgId),
    verb: input.verb,
    subjectKind: "task",
    subjectId: input.taskId,
    payload: input.payload,
    createdAt: new Date(),
  });
  ctx.em.persist(event);
}
```

---

### `src/services/ReportService.ts` (service, batch)

**Analog:** `src/services/SprintService.ts`

**Imports pattern** (`SprintService.ts` lines 1-8):
```typescript
import { TRPCError } from "@trpc/server";
import type { EntityManager } from "@mikro-orm/postgresql";

import { MetricsCache } from "../db/entities/tasks/MetricsCache.ts";
import { Task } from "../db/entities/tasks/Task.ts";
import { Sprint } from "../db/entities/tasks/Sprint.ts";
import { Event } from "../db/entities/core/Event.ts";
```

**Query method pattern** (`SprintService.ts` lines 52-66):
```typescript
export class ReportService {
  constructor(private readonly em: EntityManager) {}

  async getBurndown(orgId: string, input: {
    sprintId: string;
    dateRange?: { from: Date; to: Date };
  }): Promise<BurndownPoint[]> {
    // Layer 2 first (metrics_cache snapshots), fall back to Layer 1 (events)
    const snapshots = await this.em.find(
      MetricsCache,
      { scopeType: "sprint", scopeId: input.sprintId } as never,
      { orderBy: { date: "ASC" } },
    );
    return snapshots.map(serializeBurndownPoint);
  }

  async getCycleTime(orgId: string, input: {
    projectId: string;
    dateRange: { from: Date; to: Date };
  }): Promise<CycleTimePoint[]> {
    // Layer 1: query task_events for status_change to completed
    const rows = await this.em.getConnection().execute(
      `select task_id, min(created_at) filter (where to_value->>'status' = 'started') as started_at,
              max(created_at) filter (where to_value->>'status' = 'completed') as completed_at
       from events
       where org_id = ? and verb = 'task.status_changed'
         and created_at between ? and ?
       group by task_id
       having min(created_at) filter (where to_value->>'status' = 'started') is not null`,
      [orgId, input.dateRange.from, input.dateRange.to],
    );
    return rows.map(serializeCycleTimePoint);
  }
}
```

---

### `src/services/AutomationService.ts` (service, event-driven)

**Analog:** `src/services/TaskService.ts` + `src/subscriptions/event-bus.ts`

**EventBus subscription pattern** (`event-bus.ts` lines 54-59):
```typescript
import { getEventBus } from "../subscriptions/event-bus.ts";
import { ProjectAutomation } from "../db/entities/tasks/ProjectAutomation.ts";

export class AutomationService {
  private readonly unsubscribes: Array<() => void> = [];
  private readonly chainDepth = new Map<string, number>(); // D-91 cycle detection

  start(): void {
    const bus = getEventBus();
    this.unsubscribes.push(
      bus.subscribe("project.*.tasks", async (event) => {
        await this.evaluateAutomations(event.payload as Record<string, unknown>);
      }),
    );
  }

  stop(): void {
    this.unsubscribes.forEach((fn) => fn());
    this.unsubscribes.length = 0;
  }

  private async evaluateAutomations(payload: Record<string, unknown>): Promise<void> {
    const originatingEventId = String(payload.eventId ?? "");
    const depth = this.chainDepth.get(originatingEventId) ?? 0;
    if (depth >= 5) {
      // D-91: max 5 chained executions per originating event
      console.warn(`AutomationService: cycle detection halt at depth 5 for event ${originatingEventId}`);
      return;
    }
    this.chainDepth.set(originatingEventId, depth + 1);
    // ... evaluate and execute matching automations
  }
}
```

---

### `src/services/WorkflowService.ts` (service, request-response)

**Analog:** `src/services/SprintService.ts`

**Validation method pattern** (`SprintService.ts` lines 126-146, adapted):
```typescript
export class WorkflowService {
  constructor(private readonly em: EntityManager) {}

  async validateTransition(orgId: string, input: {
    projectId: string;
    taskId: string;
    fromStatus: string;
    toStatus: string;
  }): Promise<{ allowed: boolean; reason?: string }> {
    // Load workflow transition graph for project
    // Check directed edge fromStatus → toStatus exists
    // Return { allowed: true } or { allowed: false, reason: "..." }
    const transitions = await this.getTransitionGraph(orgId, input.projectId);
    const allowed = transitions.get(input.fromStatus)?.has(input.toStatus) ?? false;
    if (!allowed) {
      return {
        allowed: false,
        reason: `Transition from '${input.fromStatus}' to '${input.toStatus}' is not allowed by project workflow.`,
      };
    }
    return { allowed: true };
  }
}
```

---

### `src/workers/metrics-rollup.ts` (worker, batch)

**Analog:** `src/workers/registry.ts`

**Worker registration pattern** (`registry.ts` lines 39-70):
```typescript
import {
  createWorkerRegistry,
  assertRecordPayload,
  assertStringField,
  type WorkerRegistry,
} from "./registry.ts";
import type { EntityManager } from "@mikro-orm/postgresql";
import { MetricsCache } from "../db/entities/tasks/MetricsCache.ts";

export interface MetricsRollupPayload {
  scope_type: "sprint" | "project" | "epic";
  scope_id: string;
  org_id: string;
}

export function registerMetricsRollupJob(
  registry: WorkerRegistry,
  getEm: () => EntityManager,
): void {
  registry.registerTask<MetricsRollupPayload>(
    "metrics_rollup",
    (payload) => {
      assertRecordPayload(payload, "metrics_rollup");
      assertStringField(payload as Record<string, unknown>, "scope_id", "metrics_rollup");
      assertStringField(payload as Record<string, unknown>, "scope_type", "metrics_rollup");
      assertStringField(payload as Record<string, unknown>, "org_id", "metrics_rollup");
    },
    async (payload) => {
      const em = getEm();
      // Upsert MetricsCache row for (scope_type, scope_id, date=today)
      // Aggregate task counts + point sums from tasks table
      // em.getConnection().execute(...)
      await em.flush();
    },
  );
}
```

---

### `src/server/trpc/routers/comments.ts` (router, CRUD)

**Analog:** `src/server/trpc/routers/tasks.ts`

**Imports + schema pattern** (`tasks.ts` lines 1-11):
```typescript
import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { permissionedProcedure } from "../../../trpc/middleware.ts";
import { t } from "../../../trpc/trpc.ts";
import { CommentService } from "../../../services/CommentService.ts";
```

**requireService helper pattern** (`sprints.ts` lines 90-95):
```typescript
function requireService(ctx: { em: EntityManager | null }): CommentService {
  if (!ctx.em) {
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "EntityManager could not be resolved." });
  }
  return new CommentService(ctx.em);
}
```

**Router procedures pattern** (`tasks.ts` lines 125-197):
```typescript
export const commentsRouter = t.router({
  list: permissionedProcedure({ resource: "comments", action: "list" })
    .input(z.object({ taskId: z.uuid() }))
    .output(z.array(CommentOutputSchema))
    .query(async ({ ctx, input }) => {
      if (!ctx.em) return [];
      return requireService(ctx).list(ctx.orgId, input.taskId);
    }),

  create: permissionedProcedure({ resource: "comments", action: "create" })
    .input(CreateCommentInputSchema)
    .output(CommentOutputSchema)
    .mutation(async ({ ctx, input }) => {
      return requireService(ctx).create(ctx.orgId, {
        ...input,
        authorId: ctx.userId ?? "",
      });
    }),

  resolve: permissionedProcedure({ resource: "comments", action: "resolve" })
    .input(z.object({ id: z.uuid() }))
    .output(CommentOutputSchema.nullable())
    .mutation(async ({ ctx, input }) => {
      return requireService(ctx).resolve(ctx.orgId, input.id, ctx.userId ?? "");
    }),

  delete: permissionedProcedure({ resource: "comments", action: "delete" })
    .input(z.object({ id: z.uuid() }))
    .output(CommentOutputSchema.nullable())
    .mutation(async ({ ctx, input }) => {
      return requireService(ctx).delete(ctx.orgId, input.id);
    }),

  addReaction: permissionedProcedure({ resource: "comments", action: "addReaction" })
    .input(z.object({ commentId: z.uuid(), emoji: z.string().max(10) }))
    .output(z.object({ added: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      return requireService(ctx).addReaction(ctx.orgId, input.commentId, ctx.userId ?? "", input.emoji);
    }),
});

export type CommentsRouter = typeof commentsRouter;
```

---

### `src/server/trpc/routers/reports.ts` (router, request-response)

**Analog:** `src/server/trpc/routers/sprints.ts`

**Output schema + query pattern** (`sprints.ts` lines 10-25, 99-106):
```typescript
import { z } from "zod";
import { permissionedProcedure } from "../../../trpc/middleware.ts";
import { t } from "../../../trpc/trpc.ts";
import { ReportService } from "../../../services/ReportService.ts";

const DateRangeSchema = z.object({
  from: z.date(),
  to: z.date(),
});

const BurndownPointSchema = z.object({
  date: z.date(),
  pointsRemaining: z.number(),
  pointsCompleted: z.number(),
  scopeTotal: z.number(),
});

export const reportsRouter = t.router({
  burndown: permissionedProcedure({ resource: "reports", action: "get" })
    .input(z.object({ sprintId: z.uuid(), dateRange: DateRangeSchema.optional() }))
    .output(z.array(BurndownPointSchema))
    .query(async ({ ctx, input }) => {
      if (!ctx.em) return [];
      return new ReportService(ctx.em).getBurndown(ctx.orgId, input);
    }),

  velocity: permissionedProcedure({ resource: "reports", action: "get" })
    .input(z.object({ projectId: z.uuid(), lastN: z.number().int().min(1).max(20).optional() }))
    .output(z.array(/* VelocityPointSchema */z.unknown()))
    .query(async ({ ctx, input }) => {
      if (!ctx.em) return [];
      return new ReportService(ctx.em).getVelocity(ctx.orgId, input);
    }),

  // ... cycleTime, cfd, throughput, wipOverTime, workload, etc.
  exportCsv: permissionedProcedure({ resource: "reports", action: "get" })
    .input(z.object({ reportType: z.string(), scopeId: z.uuid(), scopeType: z.string() }))
    .output(z.string()) // CSV as string
    .query(async ({ ctx, input }) => {
      if (!ctx.em) return "";
      return new ReportService(ctx.em).exportCsv(ctx.orgId, input);
    }),
});

export type ReportsRouter = typeof reportsRouter;
```

---

### `src/server/trpc/routers/automations.ts` (router, CRUD)

**Analog:** `src/server/trpc/routers/tasks.ts`

**Pattern:** Same `permissionedProcedure` + `requireService` structure as `comments.ts`. Key procedures: `list`, `create`, `update`, `delete`, `toggle` (enable/disable), `listTemplates`.

---

### `src/server/trpc/routers/workflows.ts` (router, request-response)

**Analog:** `src/server/trpc/routers/sprints.ts`

**Pattern:** Same `requireService` pattern. Key procedures: `getTransitions` (list allowed transitions for project), `validateTransition` (check if move is allowed), `updateTransitions` (admin sets allowed transitions graph).

---

### `src/web/src/lib/components/tasks/TaskDetailPanel.svelte` (component, request-response)

**Analog:** `src/web/src/lib/components/tasks/TaskTable.svelte`

**Svelte 5 component pattern** (`TaskTable.svelte` lines 1-34):
```svelte
<script lang="ts">
  import { cn } from "$lib/utils.js";
  // Type-safe Props interface — Svelte 5 runes mode
  interface Props {
    taskId: string;
    projectId: string;
    onClose?: () => void;
  }
  const { taskId, projectId, onClose }: Props = $props();

  // Reactive state with $state rune
  let task = $state<TaskOutput | null>(null);
  let activeTab = $state<"comments" | "activity">("comments");
  let loading = $state(true);
</script>

<!-- Right side panel — preserves board context (D-16) -->
<aside
  data-task-detail-panel
  data-task-id={taskId}
  class={cn("fixed inset-y-0 right-0 z-50 w-[480px] border-l border-border bg-background shadow-lg")}
>
  <!-- sections: title, status/priority bar, description, subtasks, dependencies, custom fields, comments, watchers -->
</aside>
```

---

### `src/web/src/lib/components/tasks/TaskComments.svelte` (component, CRUD)

**Analog:** `src/web/src/lib/components/tasks/TaskList.svelte`

**Svelte 5 list component pattern** (`TaskList.svelte` lines 1-32):
```svelte
<script lang="ts">
  import { cn } from "$lib/utils.js";

  interface Props {
    taskId: string;
    orgId: string;
  }
  const { taskId, orgId }: Props = $props();

  // $state for comment list + new comment draft
  let comments = $state<CommentOutput[]>([]);
  let draft = $state<Record<string, unknown>>({ type: "doc", content: [{ type: "paragraph" }] });
</script>

<section data-task-comments class={cn("flex flex-col gap-3")}>
  {#each comments as comment (comment.id)}
    <!-- Comment card with resolve button + reactions -->
  {/each}
  <!-- TipTap editor for new comment draft -->
</section>
```

---

### `src/web/src/lib/components/tasks/BulkActionBar.svelte` (component, event-driven)

**Analog:** `src/web/src/lib/components/tasks/TaskTable.svelte`

**Bulk action toolbar pattern** (`TaskTable.svelte` lines 201-227) — the existing `data-bulk-action-bar` div is the exact pattern to extract into a standalone component:
```svelte
<script lang="ts">
  interface Props {
    selectedCount: number;
    pending?: boolean;
    onAction: (action: BulkTaskAction, value: unknown) => Promise<void>;
    onClearSelection: () => void;
  }
  const { selectedCount, pending = false, onAction, onClearSelection }: Props = $props();
</script>

{#if selectedCount >= 2}
  <div
    data-bulk-action-bar
    class={cn("fixed bottom-4 left-1/2 z-30 flex -translate-x-1/2 ... shadow-lg")}
  >
    <span data-bulk-selection-count class={cn("font-medium")}>{selectedCount} selected</span>
    <!-- action buttons: assignee, status, sprint, label, priority, move, delete -->
  </div>
{/if}
```

---

### Chart components (BurndownChart.svelte, VelocityChart.svelte, CfdChart.svelte, CycleTimeChart.svelte)

**No direct analog** — no LayerChart components exist yet. Use RESEARCH.md D-56..D-59 patterns.

**CRITICAL guard pattern** — must wrap all LayerChart usage:
```svelte
<script lang="ts">
  import { browser } from "$app/environment";
  // Client-only dynamic import (D-57) — LayerChart uses D3/SVG which requires browser DOM
  // SSR crash pattern to avoid: never import layerchart at module level
  let ChartComponent = $state<unknown>(null);

  $effect(() => {
    if (browser) {
      import("layerchart").then((mod) => {
        ChartComponent = mod.LineChart; // or BarChart, AreaChart, etc.
      });
    }
  });
</script>

{#if browser && ChartComponent}
  <!-- render chart -->
{:else}
  <!-- loading skeleton or data table fallback -->
{/if}
```

**Color tokens** — use existing CSS vars, extend as needed:
```css
/* existing: --chart-1 through --chart-5 in app.css */
/* Phase 5 adds: --chart-6 through --chart-8 */
```

---

### `src/web/src/routes/projects/[id]/reports/+page.svelte` (route, batch — rewrite)

**Anti-pattern to eliminate** (from RESEARCH.md Pitfall 1):
```typescript
// WRONG — do not keep this pattern in the rewrite:
// src/web/src/routes/projects/[id]/reports/+page.server.ts
import { openProductDb } from "$lib/server/db"; // ARCH-01 violation
```

**Correct pattern** (tRPC client call from page, matching board/sprints pattern):
```typescript
// +page.server.ts — thin loader only, no business logic
import { trpc } from "$lib/server/trpc.ts";
export async function load({ params, locals }) {
  // Defer data fetching to client-side tRPC calls
  // or pre-fetch via tRPC server-side client
  return { projectId: params.id };
}
```

---

## Shared Patterns

### Authentication / Authorization
**Source:** `src/server/trpc/routers/tasks.ts` lines 8, 126
**Apply to:** All new tRPC routers (comments, reports, automations, workflows)
```typescript
import { permissionedProcedure } from "../../../trpc/middleware.ts";
import { t } from "../../../trpc/trpc.ts";

// Every procedure:
permissionedProcedure({ resource: "<resource>", action: "<action>" })
  .input(InputSchema)
  .output(OutputSchema)
  .query(/* or .mutation */ async ({ ctx, input }) => {
    if (!ctx.em) return /* empty/null */;
    return requireService(ctx).method(ctx.orgId, input);
  });
```

### Org-scoping (IDOR prevention)
**Source:** `src/services/TaskService.ts` lines 57-61, `SprintService.ts` lines 52-66
**Apply to:** All new service methods
```typescript
// ALL queries must filter by orgId — prevents cross-org data access
const results = await this.em.find(Entity, { org: orgId, ...rest } as never, opts);
```

### Event emission
**Source:** `src/services/TaskService.ts` lines 370-389
**Apply to:** CommentService (comment_added, comment_resolved), AutomationService (automation.executed), WorkflowService (workflow.transition_denied)
```typescript
async function emitEvent(ctx: { orgId: string; em: EntityManager | null }, input: {
  verb: string;
  subjectKind: string;
  subjectId: string;
  payload: Record<string, unknown>;
  // Phase 5 additions (D-34) — add when Event entity has these columns:
  fieldName?: string;
  fromValue?: unknown;
  toValue?: unknown;
}): Promise<void> {
  if (!ctx.em) return;
  const event = ctx.em.create(Event, {
    org: ctx.em.getReference(Org, ctx.orgId),
    verb: input.verb,
    subjectKind: input.subjectKind,
    subjectId: input.subjectId,
    payload: input.payload,
    createdAt: new Date(),
  });
  ctx.em.persist(event);
  // Do NOT flush here — outer transaction boundary handles flush
}
```

### Transactional mutation
**Source:** `src/services/TaskService.ts` lines 118-141
**Apply to:** CommentService bulk operations, AutomationService action execution
```typescript
await this.em.transactional(async (txEm) => {
  // All mutations inside transaction
  // em.persist() each entity
  // Single flush at end (automatic on transactional exit)
});
```

### MikroORM entity declaration
**Source:** `src/db/entities/tasks/Task.ts` lines 24-35, `Sprint.ts` lines 1-13
**Apply to:** All 6 new entities
```typescript
// CRITICAL rules:
// 1. Always import from "@mikro-orm/decorators/es" (not "@mikro-orm/core")
// 2. Every @Property MUST have explicit `type` — Stage-3 decorators do NOT use reflect-metadata
// 3. Every entity needs [OptionalProps]? union for optional fields
// 4. jsonb columns: type: "json", defaultRaw: "'{}'::jsonb", returning: false
// 5. Cascade delete via deleteRule: "cascade" on @ManyToOne to Org
```

### Svelte 5 component structure
**Source:** `src/web/src/lib/components/tasks/TaskTable.svelte` lines 1-34
**Apply to:** All new Svelte components
```svelte
<script lang="ts">
  import { cn } from "$lib/utils.js";
  // Typed Props interface (not type Props = {...})
  interface Props { ... }
  const { ... }: Props = $props();
  // Reactive state
  let x = $state<Type>(initial);
  // Derived
  const y = $derived(expression);
</script>

<!-- data-* attributes for test targeting (existing convention) -->
<section data-component-name ...>
```

### WorkerRegistry registration
**Source:** `src/workers/registry.ts` lines 39-70
**Apply to:** `src/workers/metrics-rollup.ts`
```typescript
// Must call assertRecordPayload first, then assertStringField for each required field
// Handler is async, receives typed payload after assertion
// Register once — WorkerTaskAlreadyRegisteredError if called twice
```

---

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `src/web/src/lib/components/reports/BurndownChart.svelte` | component | batch | No LayerChart components exist; use D-56..D-59 RESEARCH patterns + browser guard |
| `src/web/src/lib/components/reports/VelocityChart.svelte` | component | batch | Same — no chart components exist yet |
| `src/web/src/lib/components/reports/CfdChart.svelte` | component | batch | Same |
| `src/web/src/lib/components/reports/CycleTimeChart.svelte` | component | batch | Same |

---

## Critical Ordering Note

**Migration-first constraint:** The Task entity is missing `assigneeId`, `labels`, `dueDate`, `startDate`, `startedAt`, `projectId` columns. NOTHING in Phase 5 can proceed until:
1. Migration runs adding these columns to DB
2. Task entity class declares these properties

All other files depend on the complete Task entity. Plan wave 0 as: migration → entity extensions → service additions → routers → UI.

**Reports anti-pattern fix:** `src/web/src/routes/projects/[id]/reports/+page.server.ts` uses `openProductDb()` raw SQL — ARCH-01 violation. The reports route rewrite MUST migrate to the new `reportsRouter` tRPC endpoint. Do not add LayerChart to the page until this is fixed.

---

## Metadata

**Analog search scope:** `src/db/entities/tasks/`, `src/services/`, `src/server/trpc/routers/`, `src/workers/`, `src/web/src/lib/components/tasks/`, `src/subscriptions/`
**Files scanned:** 14 source files read directly
**Pattern extraction date:** 2026-05-05
