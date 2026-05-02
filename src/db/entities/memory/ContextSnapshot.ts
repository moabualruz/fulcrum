/**
 * ContextSnapshot entity — replay/debug store for assembled context bundles.
 */

import {
  Entity,
  Index,
  ManyToOne,
  PrimaryKey,
  Property,
} from "@mikro-orm/decorators/es";
import { OptionalProps } from "@mikro-orm/core";
import { Org } from "../auth/Org.ts";

@Entity({ tableName: "context_snapshots" })
@Index({ name: "context_snapshots_run", properties: ["org", "runId"] })
@Index({ name: "context_snapshots_task", properties: ["org", "taskId"] })
export class ContextSnapshot {
  [OptionalProps]?: "runId" | "taskId";

  @PrimaryKey({ type: "uuid", defaultRaw: "gen_random_uuid()" })
  id!: string;

  @ManyToOne(() => Org, {
    fieldName: "org_id",
    nullable: false,
    deleteRule: "cascade",
  })
  org!: Org;

  @Property({ type: "uuid", fieldName: "run_id", nullable: true })
  runId: string | null = null;

  @Property({ type: "uuid", fieldName: "task_id", nullable: true })
  taskId: string | null = null;

  @Property({ type: "json", fieldName: "bundle_blob" })
  bundleBlob!: Record<string, unknown>;

  @Property({ type: "integer", fieldName: "token_count" })
  tokenCount!: number;

  @Property({ type: "json", fieldName: "slice_sizes" })
  sliceSizes!: Record<string, number>;
}
