import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  Unique,
  UpdateDateColumn,
} from "typeorm";

@Entity("yjs_snapshots")
@Unique("yjs_snapshots_doc_name_unique", ["docName"])
export class YjsSnapshot {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "doc_name", unique: true })
  docName!: string;

  @Column({ type: "bytea" })
  state!: Buffer;

  @UpdateDateColumn({ type: "timestamptz", name: "updated_at" })
  updatedAt!: Date;
}
