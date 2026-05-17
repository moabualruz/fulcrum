import "reflect-metadata";

import { Inject, Injectable } from "@nestjs/common";
import { DataSource, type EntityManager } from "typeorm";

import {
  FulcrumContextBundleEntity,
  type FulcrumMemory,
  FulcrumMemoryEntity,
  type FulcrumMemoryLink,
  FulcrumMemoryLinkEntity,
  FulcrumRunEventEntity,
} from "@execution-orchestration/infrastructure/database/run-context.entities.ts";

export interface WorkContextTraceInput {
  projectId: string;
  traceId: string;
  taskId?: string | null;
  runId?: string | null;
  contextBundle: {
    id: string;
    purpose: string;
    sourceRefs: Array<Record<string, unknown>>;
    bundleJson: Record<string, unknown>;
    tokenCount: number;
    sourceCounts: Record<string, number>;
  };
  memory: {
    id: string;
    scope: string;
    kind: string;
    body: string;
    tags: string[];
    importance: string;
    source: string;
    sourceRef: Record<string, unknown>;
    archived?: boolean;
  };
  memoryLinks: Array<{
    id: string;
    targetKind: string;
    targetId: string;
  }>;
  runEvents: Array<{
    id: string;
    sequence: number;
    domain: string;
    mutationType: string;
    targetKind: string;
    targetId: string;
    agentId?: string | null;
    taskLineageId?: string | null;
    payload?: Record<string, unknown>;
  }>;
}

export interface WorkContextPersistenceSummary {
  traceId: string;
  projectId: string;
  contextBundleIds: string[];
  memoryIds: string[];
  memoryLinks: Array<{ targetKind: string; targetId: string }>;
  runEvents: Array<{
    id: string;
    runId: string;
    sequence: number;
    domain: string;
    mutationType: string;
    targetKind: string;
    targetId: string;
  }>;
}

function sortStrings(values: string[]): string[] {
  return [...values].sort((a, b) => a.localeCompare(b));
}

function normalizeRawRows<T>(value: unknown): T[] {
  if (!Array.isArray(value)) return [];
  if (Array.isArray(value[0])) return value[0] as T[];
  return value as T[];
}

export class WorkContextPersistenceService {
  constructor(private readonly dataSource: DataSource) {}

  async persistContextTrace(input: WorkContextTraceInput): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      await this.persistContextBundle(manager, input);
      await this.persistMemory(manager, input);
      await this.persistRunEvents(manager, input);
    });
  }

  async loadContextTrace(traceId: string): Promise<WorkContextPersistenceSummary> {
    const contextRows = await this.dataSource.query(
      `SELECT id AS "id", project_id AS "projectId"
       FROM fulcrum_context_bundles
       WHERE trace_id = $1
       ORDER BY id ASC`,
      [traceId],);
    const memoryRows = await this.dataSource.query(
      `SELECT id AS "id", project_id AS "projectId"
       FROM fulcrum_memories
       WHERE trace_id = $1
       ORDER BY id ASC`,
      [traceId],);
    const linkRows = await this.dataSource.query(
      `SELECT target_kind AS "targetKind", target_id AS "targetId", project_id AS "projectId"
       FROM fulcrum_memory_links
       WHERE trace_id = $1
       ORDER BY target_kind ASC, target_id ASC`,
      [traceId],);
    const runEventRows = await this.dataSource.query(
      `SELECT
         id AS "id",
         run_id AS "runId",
         sequence AS "sequence",
         domain AS "domain",
         mutation_type AS "mutationType",
         target_kind AS "targetKind",
         target_id AS "targetId",
         project_id AS "projectId"
       FROM fulcrum_run_events
       WHERE trace_id = $1
       ORDER BY sequence ASC`,
      [traceId],);
    const contexts = normalizeRawRows<{ id: string; projectId: string }>(contextRows);
    const memories = normalizeRawRows<{ id: string; projectId: string | null }>(memoryRows);
    const links = normalizeRawRows<{ targetKind: string; targetId: string; projectId: string | null }>(linkRows);
    const runEvents = normalizeRawRows<{
      id: string;
      runId: string;
      sequence: number;
      domain: string;
      mutationType: string;
      targetKind: string;
      targetId: string;
      projectId: string;
    }>(runEventRows);

    const projectId =
      contexts[0]?.projectId ??
      memories[0]?.projectId ??
      links[0]?.projectId ??
      runEvents[0]?.projectId ??
      "";

    return {
      traceId,
      projectId: projectId ?? "",
      contextBundleIds: sortStrings(contexts.map((context) => context.id)),
      memoryIds: sortStrings(memories.map((memory) => memory.id)),
      memoryLinks: links.map((link) => ({
        targetKind: link.targetKind,
        targetId: link.targetId,
      })),
      runEvents: runEvents.map((event) => ({
        id: event.id,
        runId: event.runId,
        sequence: event.sequence,
        domain: event.domain,
        mutationType: event.mutationType,
        targetKind: event.targetKind,
        targetId: event.targetId,
      })),
    };
  }

  private async persistContextBundle(
    manager: EntityManager,
    input: WorkContextTraceInput,): Promise<void> {
    await manager.getRepository(FulcrumContextBundleEntity).save({
      id: input.contextBundle.id,
      projectId: input.projectId,
      traceId: input.traceId,
      taskId: input.taskId ?? null,
      runId: input.runId ?? null,
      purpose: input.contextBundle.purpose,
      sourceRefs: input.contextBundle.sourceRefs,
      bundleJson: input.contextBundle.bundleJson,
      tokenCount: input.contextBundle.tokenCount,
      sourceCounts: input.contextBundle.sourceCounts,
    });
  }

  private async persistMemory(
    manager: EntityManager,
    input: WorkContextTraceInput,): Promise<void> {
    const memoryRepository = manager.getRepository(FulcrumMemoryEntity);
    const memoryRow = {...input.memory,
      projectId: input.projectId,
      traceId: input.traceId,
      archived: input.memory.archived ?? false,
    } satisfies FulcrumMemory;
    await memoryRepository.upsert(
      memoryRow as Parameters<typeof memoryRepository.upsert>[0],
      ["id"],);

    const linkRepository = manager.getRepository(FulcrumMemoryLinkEntity);
    const linkRows = input.memoryLinks.map((link) => ({...link,
      projectId: input.projectId,
      memoryId: input.memory.id,
      traceId: input.traceId,
    }) satisfies FulcrumMemoryLink);
    await linkRepository.upsert(
      linkRows as Parameters<typeof linkRepository.upsert>[0],
      ["id"],);
  }

  private async persistRunEvents(
    manager: EntityManager,
    input: WorkContextTraceInput,): Promise<void> {
    await manager.getRepository(FulcrumRunEventEntity).save(
      input.runEvents.map((event) => ({...event,
        projectId: input.projectId,
        runId: input.runId ?? "",
        taskId: input.taskId ?? null,
        traceId: input.traceId,
        agentId: event.agentId ?? null,
        taskLineageId: event.taskLineageId ?? null,
        payload: event.payload ?? {},
      })),);
  }
}

Inject(DataSource)(WorkContextPersistenceService, undefined, 0);
Injectable()(WorkContextPersistenceService);
