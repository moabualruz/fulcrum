import { afterEach, describe, expect, test } from "bun:test";

import { Org } from "@identity-access/infrastructure/database/entities/auth/Org.ts";
import { DEFAULT_ORG_ID } from "@platform-core/infrastructure/application-database/seed.ts";
import { createTestOrm, type TestOrm } from "@test-support/application-database.ts";
import { AppForbiddenError, AppNotFoundError, AppValidationError } from "@platform-core/domain/errors.ts";
import { dispatchRun, dispatchTaskRun } from "@execution-orchestration/application/runs/commands.ts";
import {
  getProjectRunPageData,
  getRun,
  getRunDetail,
  listProjectRuns,
  listRunRows,
  listRuns,
  loadRunsPageData,
} from "@execution-orchestration/application/runs/queries.ts";
import type { AppContext } from "@execution-orchestration/application/runs/types.ts";

const OTHER_ORG_ID = "11111111-1111-4111-8111-111111111111";

let db: TestOrm | null = null;

afterEach(async () => {
  await db?.close();
  db = null;
});

async function freshDb(): Promise<TestOrm> {
  db = await createTestOrm();
  return db;
}

function ctx(orgId = DEFAULT_ORG_ID): AppContext {
  return { orgId, userId: "user-runs", projectId: null };
}

async function createProjectAndTask(em: TestOrm["em"]) {
  const projectId = crypto.randomUUID();
  const taskId = crypto.randomUUID();
  await em.getConnection().execute(
    `INSERT INTO projects (id, org_id, slug, name, description, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, now(), now())`,
    [projectId, DEFAULT_ORG_ID, `runs-${projectId.slice(0, 8)}`, "Runs Project", "Run read model coverage"],
  );
  await em.getConnection().execute(
    `INSERT INTO tasks (id, org_id, project_id, title, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, now(), now())`,
    [taskId, DEFAULT_ORG_ID, projectId, "Dispatch target", "pending"],
  );
  return { projectId, taskId };
}

describe("application runs commands and queries", () => {
  test("dispatchRun, listRuns, and getRun round-trip through MikroORM", async () => {
    const testDb = await freshDb();
    const em = testDb.em;
    const created = await dispatchRun(em, ctx(), {
      agentName: "codex",
      prompt: "Run tests",
    });

    expect(created).toMatchObject({ orgId: DEFAULT_ORG_ID, agentName: "codex", status: "queued" });
    expect(await listRuns(em, ctx())).toHaveLength(1);
    await expect(getRun(em, ctx(), created.id)).resolves.toMatchObject({ id: created.id });
  });

  test("dispatchRun validation failure throws AppValidationError", async () => {
    const testDb = await freshDb();
    await expect(dispatchRun(testDb.em, ctx(), { agentName: "" })).rejects.toBeInstanceOf(AppValidationError);
  });

  test("getRun not-found throws AppNotFoundError", async () => {
    const testDb = await freshDb();
    await expect(getRun(testDb.em, ctx(), "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa")).rejects.toBeInstanceOf(AppNotFoundError);
  });

  test("cross-org run access throws AppForbiddenError", async () => {
    const testDb = await freshDb();
    const em = testDb.em;
    await em.save(em.create(Org, { id: OTHER_ORG_ID, name: "Other", slug: "other", createdAt: new Date(), updatedAt: new Date() }));
    const other = await dispatchRun(em, ctx(OTHER_ORG_ID), { agentName: "codex" });
    await expect(getRun(em, ctx(), other.id)).rejects.toBeInstanceOf(AppForbiddenError);
  });

  test("run read models derive project scope, transcript, artifacts, events, and recovery from real rows", async () => {
    const testDb = await freshDb();
    const em = testDb.em;
    const { projectId, taskId } = await createProjectAndTask(em);
    const transcriptPath = `/tmp/fulcrum-run-${crypto.randomUUID()}.jsonl`;
    await Bun.write(transcriptPath, JSON.stringify({ role: "assistant", content: "real transcript" }));
    const run = await dispatchTaskRun(em, { ...ctx(), projectId }, {
      taskId,
      agent: "codex",
      model: "gpt-real",
      prompt: "Use the real query path",
    });
    await em.getConnection().execute(
      `UPDATE agent_runs
          SET transcript_path = ?, workspace_path = ?, attempt_count = ?, last_error_kind = ?, next_retry_at = now() + interval '1 hour'
        WHERE id = ?`,
      [transcriptPath, "/tmp/workspace", 2, "timeout", run.id],
    );
    const artifactId = crypto.randomUUID();
    await em.getConnection().execute(
      `INSERT INTO artifacts (id, org_id, project_id, run_id, task_id, filename, path, mime, size_bytes, checksum_sha256, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, now())`,
      [artifactId, DEFAULT_ORG_ID, projectId, run.id, taskId, "log.txt", "runs/log.txt", "text/plain", 42, "abc123"],
    );
    await em.getConnection().execute(
      `INSERT INTO events (id, org_id, project_id, actor, subject_kind, subject_id, verb, payload, created_at)
       VALUES (?, ?, ?, ?, 'agent_run', ?, 'failed', ?::jsonb, now())`,
      [crypto.randomUUID(), DEFAULT_ORG_ID, projectId, "system", run.id, JSON.stringify({ reason: "timeout" })],
    );

    const projectCtx = { ...ctx(), projectId };
    const rows = await listRunRows(em, projectCtx, { agent: "codex", status: "queued", range: "24h" });
    expect(rows).toEqual([
      expect.objectContaining({ id: run.id, agent: "codex", model: "gpt-real", project_id: projectId, status: "queued" }),
    ]);
    await expect(listProjectRuns(em, projectCtx)).resolves.toEqual([
      expect.objectContaining({ id: run.id, agent: "codex", model: "gpt-real", retry_count: 2, workspace_path: "/tmp/workspace" }),
    ]);

    const detail = await getRunDetail(em, projectCtx, run.id);
    expect(detail).toMatchObject({
      id: run.id,
      projectId,
      model: "gpt-real",
      transcriptPath,
      workspacePath: "/tmp/workspace",
    });
    expect(detail.observability.artifacts).toEqual([
      expect.objectContaining({ id: artifactId, filename: "log.txt", lifecycleState: "created" }),
    ]);
    expect(detail.observability.audit).toEqual(expect.arrayContaining([
      expect.objectContaining({ verb: "failed", payload: { reason: "timeout" } }),
    ]));
    expect(detail.observability.recovery).toMatchObject({ retryable: true, retryCount: 2, lastErrorKind: "timeout" });

    const page = await getProjectRunPageData(em, projectCtx, run.id);
    expect(page.transcript).toContain("real transcript");
    expect(page.artifacts).toEqual([expect.objectContaining({ id: artifactId, downloadHref: `/artifacts/${artifactId}/download` })]);
    expect(page.events).toEqual(expect.arrayContaining([expect.objectContaining({ verb: "failed" })]));
    await expect(loadRunsPageData(em, projectCtx, { projectId })).resolves.toMatchObject({
      runs: [expect.objectContaining({ id: run.id })],
      projects: [expect.objectContaining({ id: projectId, name: "Runs Project" })],
      tasks: [expect.objectContaining({ id: taskId, title: "Dispatch target" })],
    });
  });

  test("run detail handles no-task runs, null project filters, missing transcript files, and access errors", async () => {
    const testDb = await freshDb();
    const em = testDb.em;
    const run = await dispatchRun(em, ctx(), {
      agentName: "codex",
      prompt: "Investigate without task",
    });
    await em.getConnection().execute(
      `UPDATE agent_runs
          SET status = ?, transcript_path = ?, attempt_count = ?, last_error_kind = NULL
        WHERE id = ?`,
      ["succeeded", `/tmp/fulcrum-missing-${crypto.randomUUID()}.jsonl`, 0, run.id],
    );

    const rows = await listRunRows(em, ctx(), { projectId: null, range: "all" });
    expect(rows).toEqual([
      expect.objectContaining({
        id: run.id,
        project_id: null,
        agent: "codex",
        status: "succeeded",
        iteration_count: 0,
      }),
    ]);

    const detail = await getRunDetail(em, ctx(), run.id);
    expect(detail.projectId).toBeNull();
    expect(detail.observability.context).toEqual({
      sourceRefs: [],
      warnings: ["run has no task context"],
      scope: { projectId: null, taskId: null, includeGlobal: false },
    });
    expect(detail.observability.recovery).toMatchObject({
      retryable: false,
      retryCount: 0,
      nextRetryAt: null,
      lastErrorKind: null,
    });
    expect(detail.observability.artifacts).toEqual([]);
    expect(detail.observability.audit).toEqual([]);

    const page = await getProjectRunPageData(em, ctx(), run.id);
    expect(page.transcript).toBeNull();
    expect(page.run).toMatchObject({ id: run.id, project_id: null, status: "succeeded" });
    expect(page.artifacts).toEqual([]);
    expect(page.events).toEqual([]);

    await expect(getRunDetail(em, ctx(OTHER_ORG_ID), run.id)).rejects.toBeInstanceOf(AppForbiddenError);
    await expect(getRunDetail(em, ctx(), "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa")).rejects.toBeInstanceOf(AppNotFoundError);
    await expect(getProjectRunPageData(em, { ...ctx(), projectId: crypto.randomUUID() }, run.id)).rejects.toBeInstanceOf(AppNotFoundError);
  });
});
