import type { EntityManager } from "@mikro-orm/postgresql";

import { RelationshipService, type RelationshipType } from "../../services/RelationshipService.ts";
import { summarizeRelationships, type RelationshipBucket } from "./summary.ts";
import type { TraceRef, TraceSpine } from "../trace/schemas.ts";

export interface RelationshipsAppContext {
  orgId: string;
  userId: string;
}

function relationshipService(em: EntityManager): RelationshipService {
  return new RelationshipService(em);
}

export async function createRelationship(
  em: EntityManager,
  appCtx: RelationshipsAppContext,
  input: {
    sourceTaskId: string;
    targetTaskId: string;
    type: RelationshipType;
    userId?: string;
  },
) {
  return relationshipService(em).create(
    appCtx.orgId,
    input.sourceTaskId,
    input.targetTaskId,
    input.type,
    input.userId ?? appCtx.userId,
  );
}

export async function deleteRelationship(
  em: EntityManager,
  appCtx: RelationshipsAppContext,
  relationshipId: string,
) {
  return relationshipService(em).delete(appCtx.orgId, relationshipId);
}

export async function listRelationshipsForTask(
  em: EntityManager,
  appCtx: RelationshipsAppContext,
  taskId: string,
) {
  return relationshipService(em).listForTask(appCtx.orgId, taskId);
}

export async function listTaskBlockers(
  em: EntityManager,
  appCtx: RelationshipsAppContext,
  taskId: string,
) {
  return relationshipService(em).listBlockers(appCtx.orgId, taskId);
}

export async function listBlockedItems(
  em: EntityManager,
  appCtx: RelationshipsAppContext,
  projectId: string,
) {
  return relationshipService(em).getBlockedItems(appCtx.orgId, projectId);
}

export async function listTasksBlockedBy(
  em: EntityManager,
  appCtx: RelationshipsAppContext,
  taskId: string,
) {
  return relationshipService(em).listBlockedBy(appCtx.orgId, taskId);
}

export async function markTaskAsDuplicate(
  em: EntityManager,
  appCtx: RelationshipsAppContext,
  input: {
    sourceTaskId: string;
    targetTaskId: string;
    autoClose?: boolean;
    transferWatchers?: boolean;
  },
) {
  return relationshipService(em).markAsDuplicate(appCtx.orgId, input.sourceTaskId, input.targetTaskId, {
    autoClose: input.autoClose,
    transferWatchers: input.transferWatchers,
  });
}

export function summarizeEntityRelationships(input: {
  entity: TraceRef;
  trace: TraceSpine;
  refs: TraceRef[];
  include?: RelationshipBucket[];
}) {
  return summarizeRelationships(input);
}
