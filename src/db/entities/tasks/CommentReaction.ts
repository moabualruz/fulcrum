import {
  Entity,
  PrimaryKey,
  Property,
  Unique,
} from "@mikro-orm/decorators/es";
import { OptionalProps } from "@mikro-orm/core";

@Entity({ tableName: "comment_reactions" })
@Unique({ name: "comment_reactions_uniq", properties: ["commentId", "userId", "emoji"] })
export class CommentReaction {
  [OptionalProps]?: "createdAt";

  @PrimaryKey({ type: "uuid", defaultRaw: "gen_random_uuid()" })
  id!: string;

  @Property({ type: "uuid", fieldName: "comment_id" })
  commentId!: string;

  @Property({ type: "uuid", fieldName: "user_id" })
  userId!: string;

  @Property({ type: "string" })
  emoji!: string;

  @Property({ type: "datetime", fieldName: "created_at", defaultRaw: "now()" })
  createdAt!: Date;
}
