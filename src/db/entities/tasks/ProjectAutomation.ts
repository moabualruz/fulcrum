import {
  Entity,
  Index,
  ManyToOne,
  PrimaryKey,
  Property,
} from "@mikro-orm/decorators/es";
import { OptionalProps } from "@mikro-orm/core";

import { Org } from "../auth/Org.ts";

@Entity({ tableName: "project_automations" })
@Index({ name: "project_automations_project_enabled", properties: ["projectId", "enabled"] })
export class ProjectAutomation {
  [OptionalProps]?:
    | "createdAt"
    | "updatedAt"
    | "enabled"
    | "executionCount"
    | "triggerConfig"
    | "actionConfig";

  @PrimaryKey({ type: "uuid", defaultRaw: "gen_random_uuid()" })
  id!: string;

  @ManyToOne(() => Org, {
    fieldName: "org_id",
    nullable: false,
    deleteRule: "cascade",
  })
  org!: Org;

  @Property({ type: "uuid", fieldName: "project_id" })
  projectId!: string;

  @Property({ type: "string" })
  name!: string;

  @Property({ type: "string", fieldName: "trigger_type" })
  triggerType!: string;

  @Property({ type: "json", fieldName: "trigger_config", nullable: true })
  triggerConfig: object | null = null;

  @Property({ type: "json", nullable: true })
  condition: object | null = null;

  @Property({ type: "string", fieldName: "action_type" })
  actionType!: string;

  @Property({ type: "json", fieldName: "action_config", nullable: true })
  actionConfig: object | null = null;

  @Property({ type: "boolean", default: true })
  enabled: boolean = true;

  @Property({ type: "integer", fieldName: "execution_count", default: 0 })
  executionCount: number = 0;

  @Property({ type: "datetime", fieldName: "created_at", defaultRaw: "now()" })
  createdAt!: Date;

  @Property({ type: "datetime", fieldName: "updated_at", defaultRaw: "now()" })
  updatedAt!: Date;
}
