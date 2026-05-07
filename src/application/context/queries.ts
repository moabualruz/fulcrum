import type { EntityManager } from "@mikro-orm/postgresql";

import { listDocs } from "../docs/queries.ts";
import { listMemories } from "../memory/web-queries.ts";
import { ormSqlConnection } from "../orm-helpers.ts";
import type { AppContext } from "../tasks/types.ts";

export interface ProjectOption {
  id: string;
  name: string;
}

export interface TaskOption {
  id: string;
  title: string;
  status: string;
}

export interface DocSlice {
  id: string;
  title: string;
  body_excerpt: string;
}

export interface MemorySlice {
  id: string;
  key: string;
  body: string;
  scope: string;
}

export interface RunSlice {
  id: string;
  agent: string;
  status: string;
  started_at: string;
}

export interface ArtifactSlice {
  id: string;
  title: string;
  kind: string;
}

export interface ContextBundle {
  memories: MemorySlice[];
  documents: DocSlice[];
  recentRuns: RunSlice[];
  artifacts: ArtifactSlice[];
  tokenBudget: { used: number; total: number };
}

export async function loadContextPreviewOptions(
  em: EntityManager,
  ctx: AppContext,
  selectedProjectId: string | null,
): Promise<{ projects: ProjectOption[]; tasks: TaskOption[] }> {
  const conn = ormSqlConnection(em);
  const projects = await conn.execute<ProjectOption[]>(
    `SELECT id, name FROM projects WHERE org_id = $1 ORDER BY name ASC`,
    [ctx.orgId],
  );
  const tasks = selectedProjectId
    ? await conn.execute<TaskOption[]>(
        `SELECT id, title, status FROM tasks
           WHERE org_id = $1 AND project_id = $2
           ORDER BY updated_at DESC LIMIT 50`,
        [ctx.orgId, selectedProjectId],
      )
    : [];
  return { projects, tasks };
}

export async function loadContextBundle(
  em: EntityManager,
  ctx: AppContext,
  input: { selectedProjectId: string | null; selectedTaskId: string },
): Promise<ContextBundle> {
  const conn = ormSqlConnection(em);
  const memories = (await listMemories(em, {
    orgId: ctx.orgId,
    projectId: input.selectedProjectId,
    limit: 20,
  })).map((memory) => ({
    id: memory.id,
    key: memory.key,
    body: memory.body,
    scope: memory.scope,
  }));

  const documents = (await listDocs(em, ctx, {}))
    .filter((doc) => !input.selectedProjectId || doc.projectId === input.selectedProjectId)
    .slice(0, 50)
    .map((doc) => ({
      id: doc.id,
      title: doc.title,
      body_excerpt: doc.bodyMd.slice(0, 300),
    }));

  const recentRuns = (await conn.execute<Array<{ id: string; agent: string | null; status: string | null; started_at: string | Date }>>(
    `SELECT ar.id, ar.agent_name AS agent, ar.status, ar.started_at
       FROM agent_runs ar
       LEFT JOIN tasks t ON t.id = ar.task_id
      WHERE ar.org_id = $1 AND ($2::text IS NULL OR t.project_id = $2)
      ORDER BY ar.started_at DESC LIMIT 10`,
    [ctx.orgId, input.selectedProjectId],
  )).map((run) => ({
    id: run.id,
    agent: run.agent ?? "",
    status: run.status ?? "",
    started_at: isoStamp(run.started_at),
  }));

  const artifacts = await conn.execute<ArtifactSlice[]>(
    `SELECT id, filename AS title, 'artifact'::text AS kind
       FROM artifacts
      WHERE task_id = $1 AND org_id = $2
      ORDER BY created_at DESC`,
    [input.selectedTaskId, ctx.orgId],
  );

  const totalBudget = 8000;
  const allText = [
    ...memories.map((memory) => `${memory.key}: ${memory.body}`),
    ...documents.map((doc) => `${doc.title}: ${doc.body_excerpt}`),
    ...recentRuns.map((run) => `${run.agent} ${run.status}`),
    ...artifacts.map((artifact) => `${artifact.kind}: ${artifact.title}`),
  ].join("\n");
  return {
    memories,
    documents,
    recentRuns,
    artifacts,
    tokenBudget: { used: Math.min(estimateTokens(allText), totalBudget), total: totalBudget },
  };
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function isoStamp(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : value;
}
