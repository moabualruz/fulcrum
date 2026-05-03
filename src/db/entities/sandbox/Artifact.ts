/**
 * Artifact entity — Sandcastle harvested run artifacts (P4#03).
 *
 * C2/Q22: org-scoped indexes cover run/task artifact lookups.
 * C6/C7: schema via MikroORM v7 decorator class, not app-code SQL.
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
import { AgentRun } from "../orchestration/AgentRun.ts";
import { Task } from "../tasks/Task.ts";
import { ArtifactRepository } from "../../repositories/sandbox/ArtifactRepository.ts";

@Entity({ tableName: "artifacts", repository: () => ArtifactRepository })
@Index({
  name: "idx_artifacts_org_path",
  properties: ["org", "path"],
})
@Index({
  name: "artifacts_org_run",
  properties: ["org", "run"],
})
@Index({
  name: "artifacts_org_task",
  properties: ["org", "task"],
})
export class Artifact {
  [OptionalProps]?:
    | "task"
    | "mime"
    | "sizeBytes"
    | "checksumSha256"
    | "retentionUntil"
    | "metadataJson"
    | "createdAt";

  @PrimaryKey({ type: "uuid", defaultRaw: "gen_random_uuid()" })
  id!: string;

  @ManyToOne(() => Org, {
    fieldName: "org_id",
    nullable: false,
    deleteRule: "cascade",
  })
  org!: Org;

  @ManyToOne(() => AgentRun, {
    fieldName: "run_id",
    nullable: false,
    deleteRule: "cascade",
  })
  run!: AgentRun;

  @ManyToOne(() => Task, {
    fieldName: "task_id",
    nullable: true,
    deleteRule: "set null",
  })
  task?: Task;

  @Property({ type: "string" })
  filename!: string;

  @Property({ type: "string", nullable: true })
  mime?: string;

  @Property({ type: "bigint", fieldName: "size_bytes", nullable: true })
  sizeBytes?: bigint;

  @Property({ type: "string" })
  path!: string;

  @Property({ type: "string", fieldName: "checksum_sha256", nullable: true })
  checksumSha256?: string;

  @Property({ type: "datetime", fieldName: "retention_until", nullable: true })
  retentionUntil?: Date;

  @Property({ type: "json", fieldName: "metadata_json", nullable: true })
  metadataJson?: Record<string, unknown>;

  @Property({ type: "datetime", fieldName: "created_at", defaultRaw: "now()" })
  createdAt!: Date;
}
