import { afterEach, describe, expect, test } from "bun:test";
import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";

import { resolveArtifactStoreRoot } from "@workflow-coordination/infrastructure/artifacts/storage.ts";
import { Org } from "@identity-access/infrastructure/database/entities/auth/Org.ts";
import { DEFAULT_ORG_ID } from "@platform-core/infrastructure/application-database/seed.ts";
import { createTestOrm, type TestOrm } from "@test-support/application-database.ts";
import { AppForbiddenError, AppNotFoundError, AppValidationError } from "@platform-core/domain/errors.ts";
import { createArtifact } from "@workflow-coordination/application/artifacts/commands.ts";
import { getArtifact, getArtifactDetail, getArtifactStats, listArtifactRows, listArtifacts } from "@workflow-coordination/application/artifacts/queries.ts";
import type { AppContext } from "@workflow-coordination/domain/artifact.ts";

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
  return { orgId, userId: "user-artifacts", projectId: null };
}

async function createArtifactGraph(em: TestOrm["em"]) {
  const projectId = crypto.randomUUID();
  const taskId = crypto.randomUUID();
  const runId = crypto.randomUUID();
  await em.getConnection().execute(
    `INSERT INTO projects (id, org_id, slug, name, description, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, now(), now())`,
    [projectId, DEFAULT_ORG_ID, `artifacts-${projectId.slice(0, 8)}`, "Artifacts Project", "Artifact read model coverage"],
  );
  await em.getConnection().execute(
    `INSERT INTO tasks (id, org_id, project_id, title, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, now(), now())`,
    [taskId, DEFAULT_ORG_ID, projectId, "Artifact task", "pending"],
  );
  await em.getConnection().execute(
    `INSERT INTO agent_runs (id, org_id, task_id, agent_name, status, started_at, created_at)
     VALUES (?, ?, ?, ?, ?, now(), now())`,
    [runId, DEFAULT_ORG_ID, taskId, "codex", "succeeded"],
  );
  return { projectId, taskId, runId };
}

describe("application artifacts commands and queries", () => {
  test("createArtifact, listArtifacts, and getArtifact round-trip through MikroORM", async () => {
    const testDb = await freshDb();
    const em = testDb.em;
    const created = await createArtifact(em, ctx(), {
      filename: "summary.md",
      path: "/tmp/summary.md",
      mime: "text/markdown",
    });

    expect(created).toMatchObject({ orgId: DEFAULT_ORG_ID, filename: "summary.md", path: "/tmp/summary.md" });
    expect(await listArtifacts(em, ctx())).toHaveLength(1);
    await expect(getArtifact(em, ctx(), created.id)).resolves.toMatchObject({ id: created.id });
  });

  test("createArtifact validation failure throws AppValidationError", async () => {
    const testDb = await freshDb();
    await expect(createArtifact(testDb.em, ctx(), { filename: "", path: "" })).rejects.toBeInstanceOf(AppValidationError);
  });

  test("getArtifact not-found throws AppNotFoundError", async () => {
    const testDb = await freshDb();
    await expect(getArtifact(testDb.em, ctx(), "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa")).rejects.toBeInstanceOf(AppNotFoundError);
  });

  test("cross-org artifact access throws AppForbiddenError", async () => {
    const testDb = await freshDb();
    const em = testDb.em;
    await em.save(Org, { id: OTHER_ORG_ID, name: "Other", slug: "other", createdAt: new Date(), updatedAt: new Date() } as never);
    const other = await createArtifact(em, ctx(OTHER_ORG_ID), { filename: "other.txt", path: "/tmp/other.txt" });
    await expect(getArtifact(em, ctx(), other.id)).rejects.toBeInstanceOf(AppForbiddenError);
  });

  test("artifact rows, stats, and detail content use real artifact tables and storage guard", async () => {
    const testDb = await freshDb();
    const em = testDb.em;
    const { projectId, taskId, runId } = await createArtifactGraph(em);
    const bodyPath = "application-artifacts/readme.txt";
    const fullPath = join(resolveArtifactStoreRoot(), bodyPath);
    await mkdir(dirname(fullPath), { recursive: true });
    await Bun.write(fullPath, "artifact body\nline two");
    const visibleId = crypto.randomUUID();
    const archivedId = crypto.randomUUID();
    await em.getConnection().execute(
      `INSERT INTO artifacts (id, org_id, project_id, run_id, task_id, filename, title, kind, path, body_path, mime, size_bytes, size, checksum_sha256, sha256, archived, metadata_json, created_at)
       VALUES
         (?, ?, ?, ?, ?, ?, ?, 'file', ?, ?, ?, ?, ?, ?, ?, false, ?::jsonb, now()),
         (?, ?, ?, ?, ?, ?, ?, 'file', ?, ?, ?, ?, ?, ?, ?, true, ?::jsonb, now() - interval '1 hour')`,
      [
        visibleId,
        DEFAULT_ORG_ID,
        projectId,
        runId,
        taskId,
        "readme.txt",
        "readme.txt",
        bodyPath,
        bodyPath,
        "text/plain",
        18,
        18,
        "sha-visible",
        "sha-visible",
        JSON.stringify({ lifecycleState: "captured" }),
        archivedId,
        DEFAULT_ORG_ID,
        projectId,
        runId,
        taskId,
        "archive.bin",
        "archive.bin",
        "application-artifacts/archive.bin",
        "application-artifacts/archive.bin",
        "application/octet-stream",
        7,
        7,
        "sha-archived",
        "sha-archived",
        JSON.stringify({}),
      ],
    );

    const projectCtx = { ...ctx(), projectId };
    await expect(listArtifactRows(em, projectCtx, { projectId })).resolves.toEqual([
      expect.objectContaining({ id: visibleId, project_id: projectId, run_id: runId, task_id: taskId, kind: "file", title: "readme.txt", archived: false, size: 18 }),
    ]);
    await expect(listArtifactRows(em, projectCtx, { projectId, includeArchived: true })).resolves.toHaveLength(2);
    await expect(listArtifactRows(em, projectCtx, { projectId, runId, taskId, mime: "text/plain", kind: "file" })).resolves.toEqual([
      expect.objectContaining({ id: visibleId }),
    ]);
    await expect(listArtifactRows(em, projectCtx, { projectId, kind: "log" })).resolves.toEqual([]);
    await expect(getArtifactStats(em, projectCtx, projectId)).resolves.toEqual({ totalBytes: 25, count: 2 });

    const detail = await getArtifactDetail(em, projectCtx, visibleId);
    expect(detail).toMatchObject({
      id: visibleId,
      org_id: DEFAULT_ORG_ID,
      project_id: projectId,
      body_path: fullPath,
      content: "artifact body\nline two",
      downloadHref: `/artifacts/${visibleId}/download`,
      archived: false,
    });
    await expect(getArtifactDetail(em, { ...projectCtx, projectId: crypto.randomUUID() }, visibleId)).rejects.toBeInstanceOf(AppNotFoundError);
  });
});
