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
import { Org } from "../auth/Org.ts";
import { TaskRepository } from "../../repositories/tasks/TaskRepository.ts";

@Entity({ tableName: "tasks", repository: () => TaskRepository })
@Index({
  name: "idx_tasks_org_created",
  properties: ["org", "createdAt"],
})
export class Task {
  @PrimaryKey({ type: "uuid", defaultRaw: "gen_random_uuid()" })
  id!: string;

  @ManyToOne(() => Org, { fieldName: "org_id", nullable: false })
  org!: Org;

  @Property({ type: "datetime", fieldName: "created_at", defaultRaw: "now()" })
  createdAt!: Date;

  // P3#02 eligibility columns — added by Migration20260502000001.
  @Property({ type: "array", fieldName: "blocked_by_ids", default: [] })
  blockedByIds: string[] = [];

  @Property({ type: "string", fieldName: "workflow_id", nullable: true })
  workflowId: string | null = null;

  @Property({ type: "string", fieldName: "status", nullable: true })
  status: string | null = null;

  @Property({ type: "integer", fieldName: "priority", nullable: true })
  priority: number | null = null;
}
