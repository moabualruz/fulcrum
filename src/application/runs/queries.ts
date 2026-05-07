import type { EntityManager } from "@mikro-orm/postgresql";
import { readFile } from "node:fs/promises";

import { AgentRun } from "../../db/entities/orchestration/AgentRun.ts";
import { AppForbiddenError, AppNotFoundError } from "../errors.ts";
import { ormSqlConnection } from "../orm-helpers.ts";
import type { AppContext, RunDetailDto, RunDto } from "./types.ts";

export async function listRuns(em: EntityManager, ctx: AppContext): Promise<RunDto[]> {
  const runs = await em.find(AgentRun, { org: ctx.orgId } as never, { orderBy: { createdAt: "DESC", id: "ASC" } });
  return runs.map(serializeRun);
}

export async function getRun(em: EntityManager, ctx: AppContext, id: string): Promise<RunDto> {
  const run = await em.findOne(AgentRun, { id } as never);
  if (!run) throw new AppNotFoundError(`Run not found: ${id}`);
  if (run.org.id !== ctx.orgId) throw new AppForbiddenError(`Run does not belong to org: ${ctx.orgId}`);
  return serializeRun(run);
}

export async function getRunDetail(em: EntityManager, ctx: AppContext, id: string): Promise<RunDetailDto> {
  const run = await em.findOne(AgentRun, { id } as never, { populate: ["task"] as never });
  if (!run) throw new AppNotFoundError(`Run not found: ${id}`);
  if (run.org.id !== ctx.orgId) throw new AppForbiddenError(`Run does not belong to org: ${ctx.orgId}`);
  return {
    ...serializeRun(run),
    projectId: run.task?.projectId ?? ctx.projectId ?? null,
    model: run.agentVersion ?? null,
    parentRunId: null,
    startedAt: run.startedAt,
    endedAt: null,
    transcriptPath: run.transcriptPath ?? null,
    workspaceDiffPath: run.workspaceDiffPath ?? null,
  };
}

export function serializeRun(run: AgentRun): RunDto {
  return {
    id: run.id,
    orgId: run.org.id,
    agentName: run.agentName ?? null,
    status: run.status ?? null,
    prompt: run.threadId ?? null,
    createdAt: run.createdAt,
  };
}

export interface ProjectRunRow {
  id: string;
  agent: string;
  model: string | null;
  status: string;
  symphony_state: string | null;
  started_at: string;
  ended_at: string | null;
  last_error_kind: string | null;
  retry_count: number;
  workspace_path: string | null;
}

export interface AgentRunDetailRow extends ProjectRunRow {
  org_id: string;
  project_id: string | null;
  prompt: string | null;
  parent_run_id: string | null;
  transcript_path: string | null;
}

export interface RunEventRow {
  id: string;
  org_id: string;
  project_id: string | null;
  subject_kind: string;
  subject_id: string;
  verb: string;
  payload: Record<string, unknown>;
  actor: string;
  created_at: string | Date;
}

export async function listProjectRuns(em: EntityManager, ctx: AppContext): Promise<ProjectRunRow[]> {
  const rows = await ormSqlConnection(em).execute<ProjectRunRow[]>(
    `SELECT id, agent, model, status, symphony_state, started_at, ended_at,
            last_error_kind, retry_count, workspace_path
       FROM agent_runs
      WHERE org_id = $1 AND project_id = $2
      ORDER BY started_at DESC`,
    [ctx.orgId, ctx.projectId ?? null],
  );
  return rows.map((row) => ({
    ...row,
    started_at: isoStamp(row.started_at),
    ended_at: nullableIsoStamp(row.ended_at),
  }));
}

export async function getProjectRunPageData(
  em: EntityManager,
  ctx: AppContext,
  runId: string,
): Promise<{ run: AgentRunDetailRow; transcript: string | null; events: Array<RunEventRow & { created_at: string }> }> {
  const conn = ormSqlConnection(em);
  const rows = await conn.execute<AgentRunDetailRow[]>(
    `SELECT id, org_id, project_id, agent, model, prompt, status,
            symphony_state, parent_run_id, started_at, ended_at,
            transcript_path, last_error_kind, retry_count, workspace_path
       FROM agent_runs WHERE id = $1 AND org_id = $2 AND project_id = $3`,
    [runId, ctx.orgId, ctx.projectId ?? null],
  );
  const raw = rows[0];
  if (!raw) throw new AppNotFoundError("Run not found");
  const run = {
    ...raw,
    started_at: isoStamp(raw.started_at),
    ended_at: nullableIsoStamp(raw.ended_at),
  };

  let transcript: string | null = null;
  if (run.transcript_path) {
    try {
      transcript = await readFile(run.transcript_path, "utf8");
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code !== "ENOENT" && code !== "ENOTDIR") throw err;
    }
  }

  const eventRows = await conn.execute<RunEventRow[]>(
    `SELECT * FROM events
      WHERE subject_kind = 'agent_run' AND subject_id = $1
        AND org_id = $2
      ORDER BY created_at DESC, id DESC`,
    [run.id, ctx.orgId],
  );
  const events = eventRows.map((event) => ({
    ...event,
    created_at: isoStamp(event.created_at),
  }));
  return { run, transcript, events };
}

function isoStamp(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : value;
}

function nullableIsoStamp(value: string | Date | null): string | null {
  if (value === null) return null;
  return isoStamp(value);
}
