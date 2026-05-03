import {
  Entity,
  Index,
  ManyToOne,
  PrimaryKey,
  Property,
} from "@mikro-orm/decorators/es";
import { OptionalProps } from "@mikro-orm/core";

import { Org } from "../auth/Org.ts";

@Entity({ tableName: "connector_sync_log" })
@Index({
  name: "connector_sync_log_org_connector",
  properties: ["org", "connector"],
})
export class ConnectorSyncLog {
  [OptionalProps]?: "lastRunAt" | "error";

  @PrimaryKey({ type: "uuid", defaultRaw: "gen_random_uuid()" })
  id!: string;

  @ManyToOne(() => Org, {
    fieldName: "org_id",
    nullable: false,
    deleteRule: "cascade",
  })
  org!: Org;

  @Property({ type: "string" })
  connector!: string;

  @Property({ type: "string" })
  status!: string;

  @Property({ type: "datetime", fieldName: "last_run_at", defaultRaw: "now()" })
  lastRunAt!: Date;

  @Property({ type: "text", nullable: true })
  error: string | null = null;
}
