import { mkdtempSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { openIsolatedStore } from "@test-support/product-workspace-fixtures.ts";
import { migrateIsolatedStore } from "@test-support/product-workspace-fixtures.ts";
import { createLocalOrg } from "@test-support/product-workspace-fixtures.ts";
import { insertRepoFile, upsertFileContent, insertBlameLine } from "@test-support/product-workspace-fixtures.ts";
import { makeId } from "@test-support/product-workspace-fixtures.ts";
import type { TestStore } from "@test-support/product-workspace-fixtures.ts";

let scratch: string;

function streamedData<T>(result: unknown): Promise<T> {
  const stream = (result as { streamed?: { data?: unknown } }).streamed?.data;
  expect(stream).toBeInstanceOf(Promise);
  return stream as Promise<T>;
}

beforeEach(() => {
  scratch = mkdtempSync(join(tmpdir(), "fulcrum-web-file-detail-"));
  process.env["FULCRUM_HOME"] = scratch;
});

afterEach(() => {
  delete process.env["FULCRUM_HOME"];
  rmSync(scratch, { recursive: true, force: true });
});

async function freshDb(): Promise<{ db: TestStore; orgId: string; repoId: string }> {
  const dbDir = join(scratch, "pglite.data");
  mkdirSync(dbDir, { recursive: true });
  const db = await openIsolatedStore(dbDir);
  await migrateIsolatedStore(db);
  const org = await createLocalOrg(db, { slug: "default", name: "Default" });
  const repoId = makeId();
  await db.query(
    `INSERT INTO repos (id, org_id, slug, root_path, default_branch)
     VALUES ($1, $2, $3, $4, $5)`,
    [repoId, org.id, "my-repo", "/tmp/my-repo", "main"],
  );
  return { db, orgId: org.id, repoId };
}

interface FileDetailPayload {
  repo: { id: string; slug: string };
  branch: string;
  filePath: string;
  mimeCategory: "image" | "text" | "binary";
  content: string | null;
  isBinary: boolean;
  showBlame: boolean;
  blame: Array<{ line_number: number; commit_sha: string; author: string }>;
}

describe("/repos/[id]/files/[...path] +page.server.ts", () => {
  test("load returns file content for a text file", async () => {
    const { db, repoId } = await freshDb();
    try {
      await insertRepoFile(db, {
        repoId, branch: "main", path: "apps/cli/src/main.ts", kind: "file",
        parentPath: "src", mime: "text/typescript",
      });
      await upsertFileContent(db, {
        repoId, branch: "main", path: "apps/cli/src/main.ts",
        content: "const x = 1;", isBinary: false,
      });
    } finally {
      await db.close();
    }

    const mod = await import(`./+page.server.ts?cachebust=${Date.now()}`);
    const result = await mod.load({
      params: { id: repoId, path: "apps/cli/src/main.ts" },
      url: new URL(`http://localhost/repos/${repoId}/files/apps/cli/src/main.ts`),
    } as Parameters<typeof mod.load>[0]);

    const payload = await streamedData<FileDetailPayload>(result);
    expect(payload.filePath).toBe("apps/cli/src/main.ts");
    expect(payload.mimeCategory).toBe("text");
    expect(payload.content).toBe("const x = 1;");
    expect(payload.isBinary).toBe(false);
    expect(payload.showBlame).toBe(false);
    expect(payload.blame).toEqual([]);
  });

  test("load returns blame when ?blame=1", async () => {
    const { db, repoId } = await freshDb();
    try {
      await insertRepoFile(db, {
        repoId, branch: "main", path: "apps/cli/src/main.ts", kind: "file",
        parentPath: "src", mime: "text/typescript",
      });
      await upsertFileContent(db, {
        repoId, branch: "main", path: "apps/cli/src/main.ts",
        content: "line1\nline2", isBinary: false,
      });
      await insertBlameLine(db, {
        repoId, branch: "main", path: "apps/cli/src/main.ts",
        lineNumber: 1, commitSha: "abc1234", author: "alice",
        authorDate: "2025-01-01T00:00:00Z", lineContent: "line1",
      });
      await insertBlameLine(db, {
        repoId, branch: "main", path: "apps/cli/src/main.ts",
        lineNumber: 2, commitSha: "def5678", author: "bob",
        authorDate: "2025-01-02T00:00:00Z", lineContent: "line2",
      });
    } finally {
      await db.close();
    }

    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 1}`);
    const result = await mod.load({
      params: { id: repoId, path: "apps/cli/src/main.ts" },
      url: new URL(`http://localhost/repos/${repoId}/files/apps/cli/src/main.ts?blame=1`),
    } as Parameters<typeof mod.load>[0]);

    const payload = await streamedData<FileDetailPayload>(result);
    expect(payload.showBlame).toBe(true);
    expect(payload.blame.length).toBe(2);
    expect(payload.blame[0]!.commit_sha).toBe("abc1234");
    expect(payload.blame[1]!.author).toBe("bob");
  });

  test("load returns binary flag for binary file", async () => {
    const { db, repoId } = await freshDb();
    try {
      await insertRepoFile(db, {
        repoId, branch: "main", path: "data.bin", kind: "file",
        parentPath: null, mime: "application/octet-stream",
      });
    } finally {
      await db.close();
    }

    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 2}`);
    const result = await mod.load({
      params: { id: repoId, path: "data.bin" },
      url: new URL(`http://localhost/repos/${repoId}/files/data.bin`),
    } as Parameters<typeof mod.load>[0]);

    const payload = await streamedData<FileDetailPayload>(result);
    expect(payload.isBinary).toBe(true);
    expect(payload.mimeCategory).toBe("binary");
    expect(payload.content).toBeNull();
  });

  test("load throws 404 for nonexistent file", async () => {
    const { db, repoId } = await freshDb();
    await db.close();

    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 3}`);
    let caught: unknown;
    try {
      const result = await mod.load({
        params: { id: repoId, path: "nope.ts" },
        url: new URL(`http://localhost/repos/${repoId}/files/nope.ts`),
      } as Parameters<typeof mod.load>[0]);
      await streamedData<FileDetailPayload>(result);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeDefined();
    expect(
      typeof caught === "object" && caught !== null && "status" in caught &&
        (caught as { status: number }).status === 404,
    ).toBe(true);
  });

  test("load supports branch param for blame", async () => {
    const { db, repoId } = await freshDb();
    try {
      await insertRepoFile(db, {
        repoId, branch: "dev", path: "dev.ts", kind: "file",
        parentPath: null, mime: "text/typescript",
      });
      await upsertFileContent(db, {
        repoId, branch: "dev", path: "dev.ts",
        content: "dev line", isBinary: false,
      });
      await insertBlameLine(db, {
        repoId, branch: "dev", path: "dev.ts",
        lineNumber: 1, commitSha: "devsha1", author: "carol",
        authorDate: "2025-03-01T00:00:00Z", lineContent: "dev line",
      });
    } finally {
      await db.close();
    }

    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 4}`);
    const result = await mod.load({
      params: { id: repoId, path: "dev.ts" },
      url: new URL(`http://localhost/repos/${repoId}/files/dev.ts?branch=dev&blame=1`),
    } as Parameters<typeof mod.load>[0]);

    const payload = await streamedData<FileDetailPayload>(result);
    expect(payload.branch).toBe("dev");
    expect(payload.showBlame).toBe(true);
    expect(payload.blame.length).toBe(1);
    expect(payload.blame[0]!.author).toBe("carol");
  });
});
