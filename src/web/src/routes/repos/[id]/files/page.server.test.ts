import { mkdtempSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { openPglite } from "../../../../../../product-kernel/db/pglite.ts";
import { runMigrations } from "../../../../../../product-kernel/db/migrate.ts";
import { createLocalOrg } from "../../../../../../product-kernel/store/repositories.ts";
import { insertRepoFile } from "../../../../../../product-kernel/store/repo-files.ts";
import { newUlid } from "../../../../../../product-kernel/ids.ts";
import type { ProductDb } from "../../../../../../product-kernel/db/types.ts";

let scratch: string;

function streamedData<T>(result: unknown): Promise<T> {
  const stream = (result as { streamed?: { data?: unknown } }).streamed?.data;
  expect(stream).toBeInstanceOf(Promise);
  return stream as Promise<T>;
}

beforeEach(() => {
  scratch = mkdtempSync(join(tmpdir(), "fulcrum-web-files-tree-"));
  process.env["FULCRUM_HOME"] = scratch;
});

afterEach(() => {
  delete process.env["FULCRUM_HOME"];
  rmSync(scratch, { recursive: true, force: true });
});

async function freshDb(): Promise<{ db: ProductDb; orgId: string; repoId: string }> {
  const dbDir = join(scratch, "state", "product", "db");
  mkdirSync(dbDir, { recursive: true });
  const db = await openPglite(join(dbDir, "main"));
  await runMigrations(db);
  const org = await createLocalOrg(db, { slug: "default", name: "Default" });
  const repoId = newUlid();
  await db.query(
    `INSERT INTO repos (id, org_id, slug, root_path, default_branch)
     VALUES ($1, $2, $3, $4, $5)`,
    [repoId, org.id, "my-repo", "/tmp/my-repo", "main"],
  );
  return { db, orgId: org.id, repoId };
}

interface FilesTreePayload {
  repo: { id: string; slug: string };
  branch: string;
  branches: string[];
  rootChildren: Array<{ id: string; path: string; kind: string }>;
}

describe("/repos/[id]/files +page.server.ts", () => {
  test("load returns root children for default branch", async () => {
    const { db, repoId } = await freshDb();
    try {
      await insertRepoFile(db, { repoId, branch: "main", path: "src", kind: "directory", parentPath: null });
      await insertRepoFile(db, { repoId, branch: "main", path: "README.md", kind: "file", parentPath: null });
    } finally {
      await db.close();
    }

    const mod = await import(`./+page.server.ts?cachebust=${Date.now()}`);
    const result = await mod.load({
      params: { id: repoId },
      url: new URL(`http://localhost/repos/${repoId}/files`),
    } as Parameters<typeof mod.load>[0]);

    const payload = await streamedData<FilesTreePayload>(result);
    expect(payload.repo.slug).toBe("my-repo");
    expect(payload.branch).toBe("main");
    expect(payload.rootChildren.length).toBe(2);
    // directories first
    expect(payload.rootChildren[0]!.kind).toBe("directory");
    expect(payload.rootChildren[1]!.kind).toBe("file");
  });

  test("load respects branch query param", async () => {
    const { db, repoId } = await freshDb();
    try {
      await insertRepoFile(db, { repoId, branch: "dev", path: "dev-file.ts", kind: "file", parentPath: null });
    } finally {
      await db.close();
    }

    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 1}`);
    const result = await mod.load({
      params: { id: repoId },
      url: new URL(`http://localhost/repos/${repoId}/files?branch=dev`),
    } as Parameters<typeof mod.load>[0]);

    const payload = await streamedData<FilesTreePayload>(result);
    expect(payload.branch).toBe("dev");
    expect(payload.rootChildren.length).toBe(1);
    expect(payload.rootChildren[0]!.path).toBe("dev-file.ts");
  });

  test("load throws 404 for nonexistent repo", async () => {
    const { db } = await freshDb();
    await db.close();

    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 2}`);
    let caught: unknown;
    try {
      const result = await mod.load({
        params: { id: "BOGUS" },
        url: new URL("http://localhost/repos/BOGUS/files"),
      } as Parameters<typeof mod.load>[0]);
      await streamedData<FilesTreePayload>(result);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeDefined();
    expect(
      typeof caught === "object" && caught !== null && "status" in caught &&
        (caught as { status: number }).status === 404,
    ).toBe(true);
  });
});
