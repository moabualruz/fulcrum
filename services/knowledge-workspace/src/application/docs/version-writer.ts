import type { EntityManager } from "typeorm";
import { randomUUID } from "node:crypto";

import { Org } from "@identity-access/infrastructure/database/entities/auth/Org.ts";
import { User } from "@identity-access/infrastructure/database/entities/auth/User.ts";
import { Document } from "@knowledge-workspace/infrastructure/database/entities/docs/Document.ts";
import { DocVersion } from "@knowledge-workspace/infrastructure/database/entities/docs/DocVersion.ts";

export interface DocJsonDelta {
  ops: Array<{ path: string[]; value: Record<string, unknown> }>;
}

export interface WriteDocVersionInput {
  orgId: string;
  doc: Document;
  authorId?: string | null;
  restoreOf?: DocVersion | null;
  now?: Date;
  snapshotEvery?: number;
  deltaElapsedMs?: (startedAt: number) => number;
  slowDeltaCount?: { value: number };
}

const DEFAULT_SNAPSHOT_EVERY = 10;
const LARGE_DOC_BYTES = 500_000;
const DELTA_TIMEOUT_MS = 200;

function snapshotEvery(input: number | undefined): number {
  if (input && Number.isInteger(input) && input > 0) return input;
  const env = Number.parseInt(process.env.DOC_SNAPSHOT_EVERY ?? "", 10);
  return Number.isInteger(env) && env > 0 ? env : DEFAULT_SNAPSHOT_EVERY;
}

function jsonClone(value: Record<string, unknown>): Record<string, unknown> {
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}

function jsonBytes(value: Record<string, unknown>): number {
  return Buffer.byteLength(JSON.stringify(value), "utf8");
}

function calendarDay(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function computeDelta(to: Record<string, unknown>): DocJsonDelta {
  return { ops: [{ path: [], value: jsonClone(to) }] };
}

export async function writeDocVersion(
  em: EntityManager,
  input: WriteDocVersionInput,
): Promise<DocVersion> {
  const now = input.now ?? new Date();
  const latest = await em.findOne(DocVersion, { where: {
    org: input.orgId,
    doc: input.doc.id,
  } as never, order: { versionNum: "DESC" } });
  const versionNum = (latest?.versionNum ?? 0) + 1;
  const cadence = snapshotEvery(input.snapshotEvery);
  const firstSaveOfDay = latest ? calendarDay(latest.createdAt) !== calendarDay(now) : true;
  let shouldSnapshot = versionNum === 1 || versionNum % cadence === 0 || firstSaveOfDay;
  let delta: DocJsonDelta | null = null;

  if (!shouldSnapshot) {
    const startedAt = performance.now();
    delta = computeDelta(input.doc.contentJson);
    const elapsed = input.deltaElapsedMs?.(startedAt) ?? performance.now() - startedAt;
    if (jsonBytes(input.doc.contentJson) > LARGE_DOC_BYTES && elapsed > DELTA_TIMEOUT_MS) {
      shouldSnapshot = true;
      delta = null;
      input.slowDeltaCount && (input.slowDeltaCount.value += 1);
      console.warn(
        `[docs.version-writer] slow delta ${elapsed.toFixed(1)}ms for doc ${input.doc.id}; wrote snapshot`,
      );
    }
  }

  const author = input.authorId
    ? await em.findOne(User, { where: { org: { id: input.orgId }, id: input.authorId  } as never })
    : null;
  const version = em.create(DocVersion, {
    id: randomUUID(),
    org: { id: input.orgId } as Org,
    doc: input.doc,
    versionNum,
    snapshot: shouldSnapshot ? jsonClone(input.doc.contentJson) : null,
    delta: shouldSnapshot ? null : delta,
    bodyMdSnapshot: input.doc.bodyMd,
    author,
    restoreOf: input.restoreOf ?? null,
    createdAt: now,
  } as never);
  await em.save(version);
  return version;
}
