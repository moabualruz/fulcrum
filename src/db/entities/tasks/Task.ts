/**
 * Task entity — tasks domain (Pillar 6 stub).
 *
 * Stub: only the columns required for the FK + composite index land here.
 * Pillar 6 (Task management) will ADD additional columns (title, status,
 * assignee, priority, …) via its own migration class — the org FK and
 * composite index never need to be re-declared.
 *
 * C2: Composite (org_id, created_at desc) index from day 1.
 * C6: No plaintext SQL — schema via @Entity decorator class.
 * C7: MikroORM v7 ES Stage-3 decorator pattern (@mikro-orm/decorators/es).
 *     Stage-3 decorators do NOT emit reflect-metadata type info — explicit
 *     `type` is required on every @Property/@PrimaryKey decorator.
 * C8: @Entity({ repository }) wires TaskRepository.
 */

import {
  Entity,
  PrimaryKey,
  Property,
  ManyToOne,
  Index,
} from "@mikro-orm/decorators/es";
import { Org } from "../auth/Org.ts";
import { TaskRepository } from "../../repositories/tasks/TaskRepository.ts";

@Entity({ tableName: "tasks", repository: () => TaskRepository })
@Index({
  name: "idx_tasks_org_created",
  properties: ["org", "createdAt"],
})
export class Task {
  @PrimaryKey({ type: "uuid", defaultRaw: "gen_random_uuid()" })
  id!: string;

  @ManyToOne(() => Org, { fieldName: "org_id", nullable: false })
  org!: Org;

  @Property({ type: "datetime", fieldName: "created_at", defaultRaw: "now()" })
  createdAt!: Date;
}
