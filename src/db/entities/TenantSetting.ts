import {
  Entity,
  Index,
  PrimaryKey,
  Property,
  Unique,
} from "@mikro-orm/decorators/es";
import { OptionalProps } from "@mikro-orm/core";
import { TenantSettingRepository } from "../repositories/TenantSettingRepository.ts";

@Entity({ tableName: "tenant_settings", repository: () => TenantSettingRepository })
@Unique({ name: "uq_tenant_settings_org_key", properties: ["orgId", "key"] })
@Index({ name: "tenant_settings_org_key_idx", properties: ["orgId", "key"] })
export class TenantSetting {
  [OptionalProps]?: "createdAt" | "updatedAt";

  @PrimaryKey({ type: "uuid", defaultRaw: "gen_random_uuid()" })
  id!: string;

  @Property({ type: "uuid", fieldName: "org_id" })
  orgId!: string;

  @Property({ type: "string" })
  key!: string;

  @Property({ type: "json", defaultRaw: "'{}'::jsonb" })
  value!: unknown;

  @Property({ type: "datetime", fieldName: "created_at", defaultRaw: "now()" })
  createdAt!: Date;

  @Property({ type: "datetime", fieldName: "updated_at", defaultRaw: "now()", onUpdate: () => new Date() })
  updatedAt!: Date;
}
