/**
 * WorkflowDefinition entity — orchestration domain (Pillar 3, P3#02).
 *
 * Stores per-project (or org-wide) workflow templates that control how Symphony
 * dispatches tasks: prompt template, config, and optional project scope.
 *
 * projectId nullable = org-wide default workflow (COALESCE trick in unique index).
 * Unique: (org, COALESCE(project_id, nil_uuid), name) — enforced by migration addSql().
 * List:   (org, project_id) — standard composite @Index.
 *
 * C2: org_id-scoped from day 1. Composite list index covers tenant-scoped queries.
 * C6: No plaintext SQL — schema via @Entity decorator class.
 * C7: MikroORM v7 ES Stage-3 decorator pattern (@mikro-orm/decorators/es).
 * C8: @Entity({ repository }) wires WorkflowDefinitionRepository.
 * C9: src/db/entities/orchestration/WorkflowDefinition.ts.
 *
 * COALESCE note: the unique expression index
 *   CREATE UNIQUE INDEX "idx_wf_def_org_project_name_unique" ON "workflow_definitions"
 *   ("org_id", COALESCE("project_id", '00000000-0000-0000-0000-000000000000'), "name")
 * cannot be expressed via @Unique({ properties }) because MikroORM does not support
 * COALESCE in property-array form. The migration class emits it via addSql() (sanctioned
 * C6 escape hatch). The @Index expression below preserves it in ORM metadata for tooling.
 */

import {
  Entity,
  PrimaryKey,
  Property,
  ManyToOne,
  Index,
} from "@mikro-orm/decorators/es";
import { Org } from "../auth/Org.ts";
import { WorkflowDefinitionRepository } from "../../repositories/orchestration/WorkflowDefinitionRepository.ts";

@Entity({
  tableName: "workflow_definitions",
  repository: () => WorkflowDefinitionRepository,
})
@Index({
  name: "idx_wf_def_org_project",
  properties: ["org", "projectId"],
})
@Index({
  name: "idx_wf_def_org_project_name_unique",
  expression: `CREATE UNIQUE INDEX "idx_wf_def_org_project_name_unique" ON "workflow_definitions" ("org_id", COALESCE("project_id", '00000000-0000-0000-0000-000000000000'), "name")`,
})
export class WorkflowDefinition {
  @PrimaryKey({ type: "uuid", defaultRaw: "gen_random_uuid()" })
  id!: string;

  @ManyToOne(() => Org, { fieldName: "org_id", nullable: false })
  org!: Org;

  @Property({ type: "uuid", fieldName: "project_id", nullable: true })
  projectId: string | null = null;

  @Property({ type: "string", fieldName: "name" })
  name!: string;

  @Property({ type: "text", fieldName: "config_yaml" })
  configYaml!: string;

  @Property({ type: "text", fieldName: "prompt_md" })
  promptMd!: string;

  @Property({ type: "datetime", fieldName: "created_at", defaultRaw: "now()" })
  createdAt!: Date;

  @Property({ type: "datetime", fieldName: "updated_at", defaultRaw: "now()" })
  updatedAt!: Date;
}
