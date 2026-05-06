import {
  Entity,
  Index,
  ManyToOne,
  PrimaryKey,
  Property,
} from "@mikro-orm/decorators/es";
import { OptionalProps } from "@mikro-orm/core";

import { Org } from "../auth/Org.ts";

@Entity({ tableName: "audit_exports" })
@Index({
  name: "audit_exports_org_project",
  properties: ["org", "projectId"],
})
export class AuditExport {
  [OptionalProps]?: "filters" | "createdAt" | "updatedAt";

  @PrimaryKey({ type: "uuid", defaultRaw: "gen_random_uuid()" })
  id!: string;

  @ManyToOne(() => Org, { fieldName: "org_id", nullable: false, deleteRule: "cascade" })
  org!: Org;

  @Property({ type: "string", fieldName: "project_id" })
  projectId!: string;

  @Property({ type: "string", fieldName: "requested_by_user_id" })
  requestedByUserId!: string;

  @Property({ type: "string" })
  status!: string;

  @Property({ type: "string" })
  format!: string;

  @Property({ type: "json" })
  filters: Record<string, unknown> = {};

  @Property({ type: "string", fieldName: "download_url", nullable: true })
  downloadUrl?: string | null;

  @Property({ type: "datetime", fieldName: "created_at", defaultRaw: "now()" })
  createdAt!: Date;

  @Property({ type: "datetime", fieldName: "updated_at", defaultRaw: "now()" })
  updatedAt!: Date;
}
