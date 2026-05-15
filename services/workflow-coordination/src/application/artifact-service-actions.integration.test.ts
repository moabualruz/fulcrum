import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

import { DEFAULT_ORG_ID } from "@platform-core/infrastructure/application-database/seed.ts";
import { createTestOrm, type TestOrm } from "@test-support/application-database.ts";
import {
  deleteArtifactAction,
  getArtifactStats,
  listArtifacts,
  readArtifactDetail,
} from "@workflow-coordination/application/artifact-service-actions.ts";

let db: TestOrm | null = null;
let scratch: string | null = null;

afterEach(async () => {
  await db?.close();
  db = null;
  if (scratch) await rm(scratch, { recursive: true, force: true });
  scratch = null;
});

async function freshDb(): Promise<TestOrm> {
  db = await createTestOrm();
  return db;
}

async function createProject(em: TestOrm["em"]): Promise<string> {
  const id = randomUUID();
  await em.getConnection().execute(
    `INSERT INTO projects (id, org_id, slug, name, description, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, now(), now())`,
    [id, DEFAULT_ORG_ID, `artifact-service-${id.slice(0, 8)}`, "Artifact Service Project", "Integration coverage"],);
  return id;
}

async function createRun(em: TestOrm["em"]): Promise<string> {
  const id = randomUUID();
  await em.getConnection().execute(
    `INSERT INTO agent_runs (id, org_id, agent_name, status, created_at, started_at)
     VALUES (?, ?, ?, ?, now(), now())`,
    [id, DEFAULT_ORG_ID, "artifact-service-test", "succeeded"],);
  return id;
}

async function insertArtifact(
  em: TestOrm["em"],
  input: {
    projectId: string;
    runId: string;
    bodyPath: string;
    title: string;
    mime: string;
    kind?: string;
    archived?: boolean;
    size?: number;
  },): Promise<string> {
  const id = randomUUID();
  await em.getConnection().execute(
    `INSERT INTO artifacts
       (id, org_id, project_id, run_id, kind, title, body_path, sha256, size, mime, archived, path, filename, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, now())`,
    [
      id,
      DEFAULT_ORG_ID,
      input.projectId,
      input.runId,
      input.kind ?? "log",
      input.title,
      input.bodyPath,
      `sha-${id}`,
      input.size ?? 12,
      input.mime,
      input.archived ?? false,
      input.bodyPath,
      `${input.title}.txt`,
    ],);
  return id;
}

describe("artifact service with real MikroORM persistence", () => {
  test("lists, filters, reads detail content, computes stats, and deletes rows", async () => {
    const testDb = await freshDb();
    const em = testDb.em.fork();
    const projectId = await createProject(em);
    const runId = await createRun(em);
    scratch = await mkdtemp(join(tmpdir(), "fulcrum-artifact-service-"));
    const textPath = join(scratch, "run-log.txt");
    await writeFile(textPath, "real artifact content\n");

    const textId = await insertArtifact(em, {
      projectId,
      runId,
      bodyPath: textPath,
      title: "Run Log",
      mime: "text/plain",
      kind: "log",
      size: 22,
    });
    await insertArtifact(em, {
      projectId,
      runId,
      bodyPath: join(scratch, "archived.bin"),
      title: "Archived Binary",
      mime: "application/octet-stream",
      kind: "binary",
      archived: true,
      size: 100,
    });

    const visible = await listArtifacts(em, DEFAULT_ORG_ID, { projectId });
    expect(visible).toHaveLength(1);
    expect(visible[0]).toMatchObject({
      id: textId,
      org_id: DEFAULT_ORG_ID,
      project_id: projectId,
      kind: "log",
      title: "Run Log",
      body_path: textPath,
      sha256: `sha-${textId}`,
      size: 22,
      mime: "text/plain",
      archived: false,
    });

    const archived = await listArtifacts(em, DEFAULT_ORG_ID, { projectId, includeArchived: true });
    expect(archived).toHaveLength(2);
    expect(await listArtifacts(em, DEFAULT_ORG_ID, { projectId, mime: "text/plain", kind: "log" })).toHaveLength(1);
    expect(await listArtifacts(em, DEFAULT_ORG_ID, { projectId, mime: "application/json" })).toEqual([]);

    const detail = await readArtifactDetail(em, { orgId: DEFAULT_ORG_ID, id: textId });
    if (!detail) throw new Error("expected artifact detail");
    expect(detail).toMatchObject({
      id: textId,
      downloadHref: `/artifacts/${textId}/download`,
      content: "real artifact content\n",
    });
    expect(detail.retentionDaysRemaining).toBeGreaterThan(0);

    expect(await getArtifactStats(em, DEFAULT_ORG_ID, projectId)).toEqual({ totalBytes: 122, count: 2 });
    await deleteArtifactAction(em, textId, DEFAULT_ORG_ID);
    expect(await readArtifactDetail(em, { orgId: DEFAULT_ORG_ID, id: textId })).toBeNull;
  });

  test("returns null content for missing text body and null detail for unknown artifact", async () => {
    const testDb = await freshDb();
    const em = testDb.em.fork();
    const projectId = await createProject(em);
    const runId = await createRun(em);
    const id = await insertArtifact(em, {
      projectId,
      runId,
      bodyPath: "/tmp/fulcrum-missing-artifact-body.txt",
      title: "Missing Body",
      mime: "text/plain",
    });

    const detail = await readArtifactDetail(em, { orgId: DEFAULT_ORG_ID, id });
    expect(detail?.content).toBeNull;
    expect(await readArtifactDetail(em, { orgId: DEFAULT_ORG_ID, id: randomUUID() })).toBeNull;
  });
});
