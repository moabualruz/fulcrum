/**
 * Project entity — minimal representation for WorkflowService.
 *
 * Phase 05 Plan 01 migration adds workflow_config, methodology,
 * and enabled_task_types columns to the projects table.
 * This entity models those columns for service-layer access.
 *
 * C7: MikroORM v7 ES Stage-3 decorator pattern (@mikro-orm/decorators/es).
 */

import {
  Entity,
  ManyToOne,
  PrimaryKey,
  Property,
} from "@mikro-orm/decorators/es";
import { OptionalProps } from "@mikro-orm/core";

import { Org } from "../auth/Org.ts";

export type WorkflowConfig = {
  transitions?: Record<string, string[]>;
};

@Entity({ tableName: "projects" })
export class Project {
  [OptionalProps]?:
    | "createdAt"
    | "updatedAt"
    | "workflowConfig"
    | "methodology"
    | "enabledTaskTypes";

  @PrimaryKey({ type: "uuid", defaultRaw: "gen_random_uuid()" })
  id!: string;

  @ManyToOne(() => Org, {
    fieldName: "org_id",
    nullable: false,
    deleteRule: "cascade",
  })
  org!: Org;

  @Property({ type: "string" })
  name!: string;

  @Property({
    type: "json",
    fieldName: "workflow_config",
    nullable: true,
  })
  workflowConfig: WorkflowConfig | null = null;

  @Property({
    type: "string",
    fieldName: "methodology",
    default: "kanban",
  })
  methodology: "scrum" | "kanban" | "none" = "kanban";

  @Property({
    type: "json",
    fieldName: "enabled_task_types",
    nullable: true,
  })
  enabledTaskTypes: string[] | null = null;

  @Property({ type: "datetime", fieldName: "created_at", defaultRaw: "now()" })
  createdAt!: Date;

  @Property({ type: "datetime", fieldName: "updated_at", defaultRaw: "now()" })
  updatedAt!: Date;
}
