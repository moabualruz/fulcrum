/**
 * AgentProfile entity — persisted Sandcastle agent profile registry (P4#04).
 *
 * C2/Q22: org-scoped unique profile names prevent duplicate built-ins per org.
 * C6/C7: schema via MikroORM v7 decorator class, not app-code SQL.
 */

import {
  Entity,
  PrimaryKey,
  Property,
  ManyToOne,
  Unique,
} from "@mikro-orm/decorators/es";
import { OptionalProps } from "@mikro-orm/core";
import { Org } from "../auth/Org.ts";
import { AgentProfileRepository } from "../../repositories/sandbox/AgentProfileRepository.ts";

@Entity({ tableName: "agent_profiles", repository: () => AgentProfileRepository })
@Unique({
  name: "agent_profiles_org_name",
  properties: ["org", "name"],
})
export class AgentProfile {
  [OptionalProps]?:
    | "cliPath"
    | "skillFolder"
    | "defaultFlags"
    | "authEnvVars"
    | "maxIterations"
    | "defaultTimeout"
    | "lastTestedAt"
    | "testPassed"
    | "createdAt"
    | "updatedAt";

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

  @Property({ type: "string", fieldName: "cli_path", nullable: true })
  cliPath?: string;

  @Property({ type: "string", fieldName: "skill_folder", nullable: true })
  skillFolder?: string;

  @Property({ type: "array", fieldName: "default_flags", nullable: true })
  defaultFlags?: string[];

  @Property({ type: "array", fieldName: "auth_env_vars", nullable: true })
  authEnvVars?: string[];

  @Property({ type: "integer", fieldName: "max_iterations", default: 10 })
  maxIterations: number = 10;

  @Property({ type: "integer", fieldName: "default_timeout", default: 600000 })
  defaultTimeout: number = 600000;

  @Property({ type: "datetime", fieldName: "last_tested_at", nullable: true })
  lastTestedAt?: Date;

  @Property({ type: "boolean", fieldName: "test_passed", nullable: true })
  testPassed?: boolean;

  @Property({ type: "datetime", fieldName: "created_at", defaultRaw: "now()" })
  createdAt!: Date;

  @Property({
    type: "datetime",
    fieldName: "updated_at",
    defaultRaw: "now()",
    onUpdate: () => new Date(),
  })
  updatedAt!: Date;
}
