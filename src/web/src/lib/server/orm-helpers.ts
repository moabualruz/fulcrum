/**
 * ORM helper functions replacing kernel compatibility helpers through Kysely.
 */

import type { EntityManager } from "@mikro-orm/postgresql";
import { randomUUID } from "node:crypto";

export function ormSqlConnection(manager: EntityManager) {
  return manager.getConnection();
}

export interface AppendEventInput {
  orgId: string;
  projectId?: string | null;
  actor: string;
  subjectKind: string;
  subjectId: string;
  verb: string;
  payload?: Record<string, unknown>;
}

export async function appendEventOrm(
  em: EntityManager,
  input: AppendEventInput,
): Promise<{ id: string }> {
  const id = randomUUID();
  await em.getKysely<any>()
    .insertInto("events")
    .values({
      id,
      org_id: input.orgId,
      project_id: input.projectId ?? null,
      subject_kind: input.subjectKind,
      subject_id: input.subjectId,
      verb: input.verb,
      payload: { actor: input.actor, ...(input.payload ?? {}) },
    })
    .execute();
  return { id };
}

export interface IndexSearchInput {
  orgId: string;
  projectId?: string | null;
  sourceKind: string;
  sourceId: string;
  title: string;
  body: string;
  labels?: string[];
}

export async function indexSearchDocumentOrm(
  em: EntityManager,
  input: IndexSearchInput,
): Promise<void> {
  const id = randomUUID();
  const db = em.getKysely<any>();
  const existing = await db
    .selectFrom("search_documents")
    .select(["id"])
    .where("org_id", "=", input.orgId)
    .where("entity_kind", "=", input.sourceKind)
    .where("entity_id", "=", input.sourceId)
    .executeTakeFirst();
  const values = {
    title: input.title,
    body: input.body,
    labels: input.labels ?? [],
    updated_at: new Date(),
    project_id: input.projectId ?? null,
  };
  if (existing) {
    await db.updateTable("search_documents").set(values).where("id", "=", existing.id).execute();
    return;
  }
  await db
    .insertInto("search_documents")
    .values({
      id,
      org_id: input.orgId,
      entity_kind: input.sourceKind,
      entity_id: input.sourceId,
      ...values,
    })
    .execute();
}

export interface EnqueueJobInput {
  orgId: string;
  projectId?: string | null;
  queue: string;
  kind: string;
  payload?: Record<string, unknown>;
  maxAttempts?: number;
  availableAt?: Date;
}

export async function enqueueJobOrm(
  em: EntityManager,
  input: EnqueueJobInput,
): Promise<{ id: string }> {
  const id = randomUUID();
  await em.getKysely<any>()
    .insertInto("jobs")
    .values({
      id,
      org_id: input.orgId,
      project_id: input.projectId ?? null,
      queue: input.queue,
      kind: input.kind,
      payload: input.payload ?? {},
      status: "queued",
      max_attempts: input.maxAttempts ?? 3,
      available_at: input.availableAt ?? new Date(),
    })
    .execute();
  return { id };
}
