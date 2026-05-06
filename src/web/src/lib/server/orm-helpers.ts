/**
 * ORM helper functions replacing kernel compatibility raw SQL helpers.
 *
 * Where entity stubs lack full column mappings, we use em.getConnection().execute()
 * for raw SQL through the unified MikroORM connection. This consolidates all DB
 * access through one layer (ARCH-01) while retaining correctness (ARCH-02).
 */

import type { EntityManager } from "@mikro-orm/postgresql";
import { randomUUID } from "node:crypto";

export interface AppendEventInput {
  orgId: string;
  projectId?: string | null;
  actor: string;
  subjectKind: string;
  subjectId: string;
  verb: string;
  payload?: Record<string, unknown>;
}

/** Create an event row via the EM connection (Event entity is partial stub). */
export async function appendEventOrm(
  em: EntityManager,
  input: AppendEventInput,
): Promise<{ id: string }> {
  const id = randomUUID();
  await em.getConnection().execute(
    `INSERT INTO events (id, org_id, project_id, actor, subject_kind, subject_id, verb, payload)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?::jsonb)`,
    [
      id,
      input.orgId,
      input.projectId ?? null,
      input.actor,
      input.subjectKind,
      input.subjectId,
      input.verb,
      JSON.stringify(input.payload ?? {}),
    ],
  );
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

/** Upsert a search_documents row (SearchDocument entity is partial stub). */
export async function indexSearchDocumentOrm(
  em: EntityManager,
  input: IndexSearchInput,
): Promise<void> {
  const id = randomUUID();
  const labels = input.labels ?? [];
  const arrayLiteral = `{${labels.map((l) => `"${l.replace(/"/g, '\\"')}"`).join(",")}}`;
  await em.getConnection().execute(
    `INSERT INTO search_documents (id, org_id, project_id, source_kind, source_id, title, body, labels)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?::text[])
     ON CONFLICT (org_id, source_kind, source_id) DO UPDATE
       SET title = EXCLUDED.title,
           body = EXCLUDED.body,
           labels = EXCLUDED.labels,
           updated_at = now()`,
    [
      id,
      input.orgId,
      input.projectId ?? null,
      input.sourceKind,
      input.sourceId,
      input.title,
      input.body,
      arrayLiteral,
    ],
  );
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

/** Enqueue a job row (Job entity is partial stub). */
export async function enqueueJobOrm(
  em: EntityManager,
  input: EnqueueJobInput,
): Promise<{ id: string }> {
  const id = randomUUID();
  await em.getConnection().execute(
    `INSERT INTO jobs
       (id, org_id, project_id, queue, kind, payload, status, max_attempts, available_at)
     VALUES (?, ?, ?, ?, ?, ?::jsonb, 'queued', ?, ?)`,
    [
      id,
      input.orgId,
      input.projectId ?? null,
      input.queue,
      input.kind,
      JSON.stringify(input.payload ?? {}),
      input.maxAttempts ?? 3,
      (input.availableAt ?? new Date()).toISOString(),
    ],
  );
  return { id };
}
