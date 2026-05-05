import {
  Entity,
  PrimaryKey,
  Property,
  Unique,
} from "@mikro-orm/decorators/es";
import { OptionalProps } from "@mikro-orm/core";

@Entity({ tableName: "yjs_snapshots" })
export class YjsSnapshot {
  [OptionalProps]?: "updatedAt";

  @PrimaryKey({ type: "uuid", defaultRaw: "gen_random_uuid()" })
  id!: string;

  @Property({ type: "string", fieldName: "doc_name", unique: true })
  docName!: string;

  @Property({ type: "blob", fieldName: "state" })
  state!: Buffer;

  @Property({ type: "datetime", fieldName: "updated_at", defaultRaw: "now()" })
  updatedAt!: Date;
}
