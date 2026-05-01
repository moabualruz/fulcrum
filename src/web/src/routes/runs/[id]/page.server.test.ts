import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { openPglite } from "../../../../../product-kernel/db/pglite.ts";
import { runMigrations } from "../../../../../product-kernel/db/migrate.ts";
import { createLocalOrg, createProject } from "../../../../../product-kernel/store/repositories.ts";
import { newUlid } from "../../../../../product-kernel/ids.ts";
import type { ProductDb } from "../../../../../product-kernel/db/types.ts";

let scratch: string;

beforeEach(() => {
  scratch = mkdtempSync(join(tmpdir(), "fulcrum-web-runs-detail-"));
  process.env["FULCRUM_HOME"] = scratch;
});

afterEach(() => {
  delete process.env["FULCRUM_HOME"];
  rmSync(scratch, { recursive: true, force: true });
});

async function freshDb(): Promise<{ db: ProductDb; orgId: string; projectId: string }> {
  const dbDir = join(scratch, "state", "product", "db");
  mkdirSync(dbDir, { recursive: true });
  const db = await openPglite(join(dbDir, "main"));
  await runMigrations(db);
  const org = await createLocalOrg(db, { slug: "default", name: "Default" });
  const project = await createProject(db, {
    orgId: org.id,
    slug: "alpha",
    name: "Alpha",
  });
  return { db, orgId: org.id, projectId: project.id };
}

async function seedRun(
  db: ProductDb,
  orgId: string,
  projectId: string,
  status: "queued" | "running" | "succeeded" | "failed" | "cancelled",
  transcriptPath: string | null = null,
): Promise<string> {
  const id = newUlid();
  await db.query(
    `INSERT INTO agent_runs
      (id, org_id, project_id, agent, model, prompt, status, transcript_path)
     VALUES ($1, $2, $3, 'codex', 'gpt-5', 'do thing', $4, $5)`,
    [id, orgId, projectId, status, transcriptPath],
  );
  return id;
}

interface RedirectError {
  status: number;
  location: string;
}

function isRedirect(e: unknown): e is RedirectError {
  return (
    typeof e === "object" &&
    e !== null &&
    "status" in e &&
    "location" in e &&
    typeof (e as RedirectError).status === "number"
  );
}

describe("/runs/[id] +page.server.ts", () => {
  test("load returns run + null transcript when transcript_path missing", async () => {
    const { db, orgId, projectId } = await freshDb();
    let id: string;
    try {
      id = await seedRun(db, orgId, projectId, "succeeded", null);
    } finally {
      await db.close();
    }
    const mod = await import(`./+page.server.ts?cachebust=${Date.now()}`);
    const result = await mod.load({ params: { id } } as Parameters<typeof mod.load>[0]);
    expect(result.run.id).toBe(id);
    expect(result.run.status).toBe("succeeded");
    expect(result.transcript).toBeNull();
    expect(Array.isArray(result.events)).toBe(true);
  });

  test("load reads transcript file content when transcript_path is set", async () => {
    const { db, orgId, projectId } = await freshDb();
    const tPath = join(scratch, "transcript.txt");
    writeFileSync(tPath, "hello transcript", "utf8");
    let id: string;
    try {
      id = await seedRun(db, orgId, projectId, "succeeded", tPath);
    } finally {
      await db.close();
    }
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 1}`);
    const result = await mod.load({ params: { id } } as Parameters<typeof mod.load>[0]);
    expect(result.transcript).toBe("hello transcript");
  });

  test("load throws 404 when run does not exist", async () => {
    const { db } = await freshDb();
    await db.close();
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 2}`);
    let caught: unknown;
    try {
      await mod.load({ params: { id: "01JBOGUS000000000000000000" } } as Parameters<typeof mod.load>[0]);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeDefined();
    expect(
      typeof caught === "object" && caught !== null && "status" in caught
        && (caught as { status: number }).status === 404,
    ).toBe(true);
  });

  test("cancel action transitions run row to cancelled", async () => {
    const { db, orgId, projectId } = await freshDb();
    let id: string;
    try {
      id = await seedRun(db, orgId, projectId, "running");
    } finally {
      await db.close();
    }
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 3}`);
    await mod.actions.cancel({ params: { id } } as Parameters<typeof mod.actions.cancel>[0]);
    const dbDir = join(scratch, "state", "product", "db");
    const db2 = await openPglite(join(dbDir, "main"));
    await runMigrations(db2);
    try {
      const rows = await db2.query<{ status: string }>(
        `SELECT status FROM agent_runs WHERE id = $1`,
        [id],
      );
      expect(rows[0]?.status).toBe("cancelled");
    } finally {
      await db2.close();
    }
  });

  test("retry action redirects 303 to new run id", async () => {
    const { db, orgId, projectId } = await freshDb();
    let id: string;
    try {
      id = await seedRun(db, orgId, projectId, "failed");
    } finally {
      await db.close();
    }
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 4}`);
    let caught: unknown;
    try {
      await mod.actions.retry({ params: { id } } as Parameters<typeof mod.actions.retry>[0]);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeDefined();
    expect(isRedirect(caught)).toBe(true);
    if (isRedirect(caught)) {
      expect(caught.status).toBe(303);
      expect(caught.location).toMatch(/^\/runs\/[A-Z0-9]+$/);
      expect(caught.location).not.toBe(`/runs/${id}`);
    }
  });
});
