/**
 * Task entity — tasks domain (Pillar 6 stub + P3#02 eligibility columns).
 *
 * Stub: base columns (id, org, createdAt) + composite index land in Pillar 1
 * migration. Pillar 6 (Task management) adds domain columns (title, status,
 * assignee, priority, …) via its own migration.
 *
 * P3#02 additive columns (eligibility for Symphony dispatch):
 *   - blockedByIds: list of task IDs that block this task from dispatch.
 *   - workflowId:   FK-by-value to workflow_definitions.id (nullable).
 *   - status:       dispatch-eligibility filter ("ready" = eligible).
 *   - priority:     dispatch ordering (lower = higher priority).
 * P3#02 partial index: tasks_dispatch_eligible (org, status, priority,
 *   created_at) WHERE status = 'ready' — added by P3#02 migration via addSql().
 *
 * C2: Composite (org_id, created_at) index from day 1.
 * C6: No plaintext SQL — schema via @Entity decorator class.
 * C7: MikroORM v7 ES Stage-3 decorator pattern (@mikro-orm/decorators/es).
 *     Stage-3 decorators do NOT emit reflect-metadata type info — explicit
 *     `type` is required on every @Property/@PrimaryKey decorator.
 * C8: @Entity({ repository }) wires TaskRepository.
 */

import {
  Entity,
  PrimaryKey,
  Property,
  ManyToOne,
  Index,
} from "@mikro-orm/decorators/es";
import { OptionalProps } from "@mikro-orm/core";
import { Org } from "../auth/Org.ts";
import { Repo } from "../repos/Repo.ts";
import { TaskRepository } from "../../repositories/tasks/TaskRepository.ts";
import type { TaskDependencies } from "./schemas.ts";

@Entity({ tableName: "tasks", repository: () => TaskRepository })
@Index({
  name: "idx_tasks_org_created",
  properties: ["org", "createdAt"],
})
@Index({
  name: "tasks_id_org_unique",
  expression:
    'CREATE UNIQUE INDEX "tasks_id_org_unique" ON "tasks" ("id", "org_id")',
})
@Index({
  name: "tasks_org_sprint_status",
  properties: ["org", "sprint", "status"],
})
@Index({
  name: "tasks_org_parent",
  properties: ["org", "parent"],
})
@Index({
  name: "tasks_custom_fields_gin",
  expression:
    'CREATE INDEX "tasks_custom_fields_gin" ON "tasks" USING GIN ("custom_fields")',
})
@Index({
  name: "tasks_dependencies_gin",
  expression:
    'CREATE INDEX "tasks_dependencies_gin" ON "tasks" USING GIN ("dependencies")',
})
@Index({
  name: "tasks_org_external_id",
  expression:
    'CREATE UNIQUE INDEX "tasks_org_external_id" ON "tasks" ("org_id", "external_id") WHERE "external_id" IS NOT NULL',
})
@Index({
  name: "tasks_org_repo",
  expression:
    'CREATE INDEX "tasks_org_repo" ON "tasks" ("org_id", "repo_id") WHERE "repo_id" IS NOT NULL',
})
export class Task {
  [OptionalProps]?:
    | "createdAt"
    | "updatedAt"
    | "title"
    | "description"
    | "blockedByIds"
    | "workflowId"
    | "status"
    | "priority"
    | "sprint"
    | "customFields"
    | "points"
    | "parent"
    | "dependencies"
    | "externalId"
    | "repo"
    | "deletedAt";

  @PrimaryKey({ type: "uuid", defaultRaw: "gen_random_uuid()" })
  id!: string;

  @ManyToOne(() => Org, { fieldName: "org_id", nullable: false })
  org!: Org;

  @Property({ type: "datetime", fieldName: "created_at", defaultRaw: "now()" })
  createdAt!: Date;

  @Property({ type: "datetime", fieldName: "updated_at", defaultRaw: "now()" })
  updatedAt!: Date;

  @Property({ type: "string", default: "Untitled task" })
  title: string = "Untitled task";

  @Property({ type: "text", nullable: true })
  description: string | null = null;

  // P3#02 eligibility columns — added by Migration20260502000001.
  @Property({ type: "array", fieldName: "blocked_by_ids", default: [] })
  blockedByIds: string[] = [];

  @Property({ type: "string", fieldName: "workflow_id", nullable: true })
  workflowId: string | null = null;

  @Property({ type: "string", fieldName: "status", nullable: true })
  status: string | null = null;

  @Property({ type: "integer", fieldName: "priority", nullable: true })
  priority: number | null = null;

  @Property({ type: "uuid", fieldName: "sprint_id", nullable: true, lazy: true })
  sprint?: string | null;

  @Property({
    type: "json",
    fieldName: "custom_fields",
    defaultRaw: "'{}'::jsonb",
    returning: false,
    lazy: true,
  })
  customFields: Record<string, unknown> = {};

  @Property({ type: "integer", fieldName: "points", nullable: true, lazy: true })
  points?: number | null;

  @ManyToOne(() => Task, {
    fieldName: "parent_id",
    nullable: true,
    deleteRule: "set null",
    lazy: true,
  })
  parent?: Task | null;

  @Property({
    type: "json",
    fieldName: "dependencies",
    defaultRaw: '\'{"blocks": [], "blocked_by": []}\'::jsonb',
    returning: false,
    lazy: true,
  })
  dependencies: TaskDependencies = { blocks: [], blocked_by: [] };

  @Property({ type: "string", fieldName: "external_id", nullable: true, lazy: true })
  externalId?: string | null;

  // P9#01 — optional repo association.
  @ManyToOne(() => Repo, {
    fieldName: "repo_id",
    nullable: true,
    deleteRule: "set null",
    lazy: true,
  })
  repo?: Repo | null;

  @Property({ type: "datetime", fieldName: "deleted_at", nullable: true })
  deletedAt: Date | null = null;
}
