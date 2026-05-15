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
 */

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  Index,
  JoinColumn,
} from "typeorm";
import { Org } from "@identity-access/infrastructure/database/entities/auth/Org.ts";
import { Repo } from "@integration-hub/infrastructure/database/entities/repos/Repo.ts";
import type { TaskDependencies } from "./schemas.ts";

@Entity("tasks")
@Index("idx_tasks_org_created", ["org", "createdAt"])
// Expression index: CREATE UNIQUE INDEX "tasks_id_org_unique" ON "tasks" ("id", "org_id")
@Index()
@Index("tasks_org_sprint_status", ["org", "sprint", "status"])
@Index("tasks_org_parent", ["org", "parent"])
// Expression index: CREATE INDEX "tasks_custom_fields_gin" ON "tasks" USING GIN ("custom_fields")
// Expression index: CREATE INDEX "tasks_dependencies_gin" ON "tasks" USING GIN ("dependencies")
// Expression index: CREATE UNIQUE INDEX "tasks_org_external_id" ON "tasks" ("org_id", "external_id") WHERE "external_id" IS NOT NULL
// Expression index: CREATE INDEX "tasks_org_repo" ON "tasks" ("org_id", "repo_id") WHERE "repo_id" IS NOT NULL
export class Task {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @ManyToOne(() => Org)
  @JoinColumn({ name: "org_id" })
  org!: Org;

  @Column({ type: "timestamptz", name: "created_at", default: () => "now()" })
  createdAt!: Date;

  @Column({ type: "timestamptz", name: "updated_at", default: () => "now()" })
  updatedAt!: Date;

  @Column({ default: "Untitled task" })
  title: string = "Untitled task";

  @Column({ type: "text", nullable: true })
  description: string | null = null;

  @Column({ type: "jsonb", name: "tiptap_content", default: () => `'{"type":"doc","content":[{"type":"paragraph"}]}'::jsonb` })
  tiptapContent: Record<string, unknown> = {
    type: "doc",
    content: [{ type: "paragraph" }],
  };

  // P3#02 eligibility columns — added by Migration20260502000001.
  @Column({ type: "simple-array", name: "blocked_by_ids", default: "" })
  blockedByIds: string[] = [];

  @Column({ name: "workflow_id", nullable: true })
  workflowId: string | null = null;

  @Column({ name: "status", nullable: true })
  status: string | null = null;

  @Column({ type: "integer", name: "priority", nullable: true })
  priority: number | null = null;

  @Column({ name: "sprint_id", nullable: true })
  sprint?: string | null;

  @Column({ type: "jsonb", name: "custom_fields", default: () => "'{}'" })
  customFields: Record<string, unknown> = {};

  @Column({ type: "integer", name: "points", nullable: true })
  points?: number | null;

  @ManyToOne(() => Task, { onDelete: "SET NULL", nullable: true })
  @JoinColumn({ name: "parent_id" })
  parent?: Task | null;

  @Column({ type: "jsonb", name: "dependencies", default: () => `'{"blocks": [], "blocked_by": []}'::jsonb` })
  dependencies: TaskDependencies = { blocks: [], blocked_by: [] };

  @Column({ name: "external_id", nullable: true })
  externalId?: string | null;

  // P9#01 — optional repo association.
  @ManyToOne(() => Repo, { onDelete: "SET NULL", nullable: true })
  @JoinColumn({ name: "repo_id" })
  repo?: Repo | null;

  @Column({ type: "timestamptz", name: "deleted_at", nullable: true })
  deletedAt: Date | null = null;

  // task workflow columns added by Migration20260505100000
  @Column({ type: "date", name: "due_date", nullable: true })
  dueDate: Date | null = null;

  @Column({ type: "date", name: "start_date", nullable: true })
  startDate: Date | null = null;

  @Column({ type: "timestamptz", name: "started_at", nullable: true })
  startedAt: Date | null = null;

  @Column({ name: "assignee_id", nullable: true })
  assigneeId: string | null = null;

  @Column({ type: "simple-array", name: "labels", default: "" })
  labels: string[] = [];

  @Column({ name: "project_id", nullable: true })
  projectId: string | null = null;

  @Column({ name: "task_type", default: "task" })
  taskType: string = "task";

  @Column({ type: "integer", name: "sequence_number", nullable: true })
  sequenceNumber: number | null = null;

  @Column({ type: "timestamptz", name: "archived_at", nullable: true })
  archivedAt: Date | null = null;

  @Column({ name: "template_id", nullable: true })
  templateId: string | null = null;
}
