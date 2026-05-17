import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn, Index } from "typeorm";
import { Org } from "@identity-access/infrastructure/database/entities/auth/Org.ts";
import { Task } from "./Task.ts";

@Entity("time_entries")
@Index("time_entries_org_task", ["org", "task"])
@Index("time_entries_org_user", ["org", "userId"])
export class TimeEntry {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @ManyToOne(() => Org, { nullable: false })
  @JoinColumn({ name: "org_id" })
  org!: Org;

  @ManyToOne(() => Task, { nullable: false })
  @JoinColumn({ name: "task_id" })
  task!: Task;

  @Column({ name: "user_id", type: "varchar", nullable: false })
  userId!: string;

  @Column({ name: "duration_minutes", type: "int", nullable: false })
  durationMinutes!: number;

  @Column({ name: "description", type: "text", nullable: true })
  description: string | null = null;

  @Column({ name: "logged_date", type: "date", nullable: false })
  loggedDate!: string;

  @CreateDateColumn({ name: "created_at" })
  createdAt?: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt?: Date;
}
