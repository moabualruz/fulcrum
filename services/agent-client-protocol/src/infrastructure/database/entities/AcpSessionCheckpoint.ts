import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from "typeorm";
import { AcpSession } from "./AcpSession.ts";

export type AcpSessionCheckpointKind = "git" | "file" | "message";

@Entity("fulcrum_session_checkpoints")
export class AcpSessionCheckpoint {
  @PrimaryColumn({ type: "varchar", length: 128 })
  id!: string;

  @Column({ name: "session_id", type: "varchar", length: 128 })
  sessionId!: string;

  @ManyToOne(() => AcpSession, { onDelete: "CASCADE" })
  @JoinColumn({ name: "session_id" })
  session!: AcpSession;

  @Column({ type: "varchar", length: 16 })
  kind!: AcpSessionCheckpointKind;

  @Column({ type: "varchar", length: 512 })
  ref!: string;

  @Column({ name: "turn_index", type: "integer" })
  turnIndex!: number;

  @Column({ name: "message_uuid", type: "varchar", length: 128 })
  messageUuid!: string;

  @Column({ type: "varchar", length: 240, nullable: true })
  label!: string | null;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;
}

