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

  @Column({ name: "comment_id" })
  commentId!: string;

  @Column({ name: "user_id" })
  userId!: string;

  @Column()
  emoji!: string;

  @Column({ type: "timestamptz", name: "created_at", default: () => "now()" })
  createdAt!: Date;
}
