import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, test } from "bun:test";
import { openPglite } from "../../../../product-kernel/db/pglite.ts";
import { runMigrations } from "../../../../product-kernel/db/migrate.ts";
import {
  createLocalOrg,
  createProject,
  type EventRow,
} from "../../../../product-kernel/store/repositories.ts";
import { newUlid } from "../../../../product-kernel/ids.ts";
import type { ProductDb } from "../../../../product-kernel/db/types.ts";
import {
  createArtifactForRun,
  deleteArtifactAction,
  listArtifacts,
  readArtifactDetail,
} from "./artifacts.ts";

const scratch = mkdtempSync(join(tmpdir(), "fulcrum-web-artifacts-"));

afterAll(() => {
  rmSync(scratch, { recursive: true, force: true });
});

async function freshDb(name: string): Promise<{
  db: ProductDb;
  orgId: string;
  projectId: string;
  runId: string;
}> {
  const db = await openPglite(join(scratch, name));
  await runMigrations(db);
  const org = await createLocalOrg(db, { slug: "default", name: "Default" });
  const project = await createProject(db, { orgId: org.id, slug: "alpha", name: "Alpha" });
  const runId = newUlid();
  await db.query(
    `INSERT INTO agent_runs (id, org_id, project_id, agent, status)
     VALUES ($1, $2, $3, 'codex', 'succeeded')`,
    [runId, org.id, project.id],
  );
  return { db, orgId: org.id, projectId: project.id, runId };
}

async function events(db: ProductDb, subjectId: string): Promise<EventRow[]> {
  return db.query<EventRow>(`SELECT * FROM events WHERE subject_id = $1 ORDER BY id`, [subjectId]);
}

describe("server actions: artifacts", () => {
  test("createArtifactForRun stores row and links run via edges", async () => {
    const { db, orgId, projectId, runId } = await freshDb("create");
    try {
      const file = join(scratch, "output.txt");
      writeFileSync(file, "hello artifact", "utf8");
      const artifact = await createArtifactForRun(db, {
        orgId,
        projectId,
        runId,
        kind: "text",
        title: "output.txt",
        bodyPath: file,
        mime: "text/plain",
      });

      const rows = await listArtifacts(db, { orgId, projectId });
      expect(rows).toHaveLength(1);
      expect(rows[0]?.id).toBe(artifact.id);
      expect(rows[0]?.preview).toBe("hello artifact");

      const edges = await db.query<{ rel: string }>(
        `SELECT rel FROM edges WHERE from_kind = 'agent_run' AND from_id = $1 AND to_kind = 'artifact' AND to_id = $2`,
        [runId, artifact.id],
      );
      expect(edges[0]?.rel).toBe("produced");
    } finally {
      await db.close();
    }
  });

  test("readArtifactDetail exposes content, download path, and retention days", async () => {
    const { db, orgId, projectId, runId } = await freshDb("detail");
    try {
      const file = join(scratch, "report.ts");
      writeFileSync(file, "const x = 1;\n", "utf8");
      const artifact = await createArtifactForRun(db, {
        orgId,
        projectId,
        runId,
        kind: "code",
        title: "report.ts",
        bodyPath: file,
        mime: "text/typescript",
      });

      const detail = await readArtifactDetail(db, { orgId, id: artifact.id });
      expect(detail?.content).toBe("const x = 1;\n");
      expect(detail?.downloadHref).toBe(`/artifacts/${artifact.id}/download`);
      expect(detail?.retentionDaysRemaining).toBe(30);
    } finally {
      await db.close();
    }
  });

  test("deleteArtifactAction removes artifact row and emits deleted event", async () => {
    const { db, orgId, projectId, runId } = await freshDb("delete");
    try {
      const file = join(scratch, "delete.txt");
      writeFileSync(file, "delete me", "utf8");
      const artifact = await createArtifactForRun(db, {
        orgId,
        projectId,
        runId,
        kind: "text",
        title: "delete.txt",
        bodyPath: file,
        mime: "text/plain",
      });

      await deleteArtifactAction(db, artifact.id, orgId);
      const rows = await listArtifacts(db, { orgId });
      expect(rows).toEqual([]);
      expect((await events(db, artifact.id)).find((e) => e.verb === "deleted")).toBeTruthy();
    } finally {
      await db.close();
    }
  });
});
