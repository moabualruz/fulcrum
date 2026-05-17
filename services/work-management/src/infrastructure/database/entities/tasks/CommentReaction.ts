import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  Unique,
} from "typeorm";

@Entity("comment_reactions")
@Unique("comment_reactions_uniq", ["commentId", "userId", "emoji"])
export class CommentReaction {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "varchar", name: "comment_id" })
  commentId!: string;

  @Column({ type: "varchar", name: "user_id" })
  userId!: string;

  @Column({ type: "varchar" })
  emoji!: string;

  @Column({ type: "timestamptz", name: "created_at", default: () => "now()" })
  createdAt!: Date;
}
