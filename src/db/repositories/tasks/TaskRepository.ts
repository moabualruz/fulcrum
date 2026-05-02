/**
 * TaskRepository — tasks domain (Pillar 6).
 *
 * Stub repository — Pillar 6 fills in domain methods.
 *
 * C6/C7: No raw SQL; all queries via EntityManager + repository methods.
 * C8: needle-di @injectable(); extends EntityRepository<Task>.
 */

import { injectable } from "@needle-di/core";
import { EntityRepository } from "@mikro-orm/postgresql";
import type { Task } from "../../entities/tasks/Task.ts";

@injectable()
export class TaskRepository extends EntityRepository<Task> {}
