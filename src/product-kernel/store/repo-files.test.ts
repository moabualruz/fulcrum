import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, test } from "bun:test";
import { openIsolatedStore } from "../../test-support/product-fixtures.ts";
import { migrateIsolatedStore } from "../../test-support/product-fixtures.ts";
import { createLocalOrg } from "./repositories.ts";
import { makeId } from "../../test-support/product-fixtures.ts";
import {
  insertRepoFile,
  listTreeChildren,
  getFileByPath,
  upsertFileContent,
  getFileContent,
  insertBlameLine,
  getBlameForFile,
  listIndexedBranches,
} from "./repo-files.ts";

const scratch = mkdtempSync(join(tmpdir(), "fulcrum-repo-files-"));

afterAll(() => {
  rmSync(scratch, { recursive: true, force: true });
});

async function freshDb() {
  const db = await openIsolatedStore(join(scratch, `db-${Date.now()}`));
  await migrateIsolatedStore(db);
  const org = await createLocalOrg(db, { slug: "default", name: "Default" });
  // Insert a repo row
  const repoId = makeId();
  await db.query(
    `INSERT INTO repos (id, org_id, slug, root_path) VALUES ($1, $2, $3, $4)`,
    [repoId, org.id, "test-repo", "/tmp/test-repo"],
  );
  return { db, orgId: org.id, repoId };
}

describe("repo-files store", () => {
  test("insertRepoFile creates and upserts a file entry", async () => {
    const { db, repoId } = await freshDb();
    try {
      const row = await insertRepoFile(db, {
        repoId,
        branch: "main",
        path: "apps/cli/src/main.ts",
        kind: "file",
        mime: "text/typescript",
        sizeBytes: 1024,
        sha: "abc123",
        parentPath: "src",
        depth: 1,
      });
      expect(row.path).toBe("apps/cli/src/main.ts");
      expect(row.kind).toBe("file");
      expect(row.mime).toBe("text/typescript");
      expect(row.depth).toBe(1);

      // Upsert same path
      const updated = await insertRepoFile(db, {
        repoId,
        branch: "main",
        path: "apps/cli/src/main.ts",
        kind: "file",
        mime: "text/typescript",
        sizeBytes: 2048,
        sha: "def456",
        parentPath: "src",
        depth: 1,
      });
      expect(updated.sha).toBe("def456");
      expect(updated.size_bytes).toBe(2048);
    } finally {
      await db.close();
    }
  });

  test("listTreeChildren returns root entries and dir children", async () => {
    const { db, repoId } = await freshDb();
    try {
      await insertRepoFile(db, { repoId, branch: "main", path: "src", kind: "directory", parentPath: null, depth: 0 });
      await insertRepoFile(db, { repoId, branch: "main", path: "README.md", kind: "file", parentPath: null, depth: 0 });
      await insertRepoFile(db, { repoId, branch: "main", path: "apps/cli/src/main.ts", kind: "file", parentPath: "src", depth: 1 });
      await insertRepoFile(db, { repoId, branch: "main", path: "src/utils", kind: "directory", parentPath: "src", depth: 1 });

      const root = await listTreeChildren(db, repoId, "main", null);
      expect(root.length).toBe(2);
      // directories sort before files
      expect(root[0]!.kind).toBe("directory");
      expect(root[1]!.kind).toBe("file");

      const srcChildren = await listTreeChildren(db, repoId, "main", "src");
      expect(srcChildren.length).toBe(2);
    } finally {
      await db.close();
    }
  });

  test("getFileByPath returns file or null", async () => {
    const { db, repoId } = await freshDb();
    try {
      await insertRepoFile(db, { repoId, branch: "main", path: "foo.ts", kind: "file", parentPath: null });
      const found = await getFileByPath(db, repoId, "main", "foo.ts");
      expect(found).not.toBeNull();
      expect(found!.path).toBe("foo.ts");

      const missing = await getFileByPath(db, repoId, "main", "nope.ts");
      expect(missing).toBeNull();
    } finally {
      await db.close();
    }
  });

  test("upsertFileContent and getFileContent round-trip", async () => {
    const { db, repoId } = await freshDb();
    try {
      await upsertFileContent(db, {
        repoId,
        branch: "main",
        path: "apps/cli/src/main.ts",
        content: "const x = 1;",
        isBinary: false,
      });
      const row = await getFileContent(db, repoId, "main", "apps/cli/src/main.ts");
      expect(row).not.toBeNull();
      expect(row!.content).toBe("const x = 1;");
      expect(row!.is_binary).toBe(false);

      const missing = await getFileContent(db, repoId, "main", "nope.ts");
      expect(missing).toBeNull();
    } finally {
      await db.close();
    }
  });

  test("insertBlameLine and getBlameForFile", async () => {
    const { db, repoId } = await freshDb();
    try {
      await insertBlameLine(db, {
        repoId,
        branch: "main",
        path: "apps/cli/src/main.ts",
        lineNumber: 1,
        commitSha: "abc123",
        author: "alice",
        authorDate: "2025-01-01T00:00:00Z",
        lineContent: "const x = 1;",
      });
      await insertBlameLine(db, {
        repoId,
        branch: "main",
        path: "apps/cli/src/main.ts",
        lineNumber: 2,
        commitSha: "def456",
        author: "bob",
        authorDate: "2025-01-02T00:00:00Z",
        lineContent: "const y = 2;",
      });

      const blame = await getBlameForFile(db, repoId, "main", "apps/cli/src/main.ts");
      expect(blame.length).toBe(2);
      expect(blame[0]!.line_number).toBe(1);
      expect(blame[0]!.author).toBe("alice");
      expect(blame[1]!.line_number).toBe(2);
    } finally {
      await db.close();
    }
  });

  test("listIndexedBranches returns distinct branches", async () => {
    const { db, repoId } = await freshDb();
    try {
      await insertRepoFile(db, { repoId, branch: "main", path: "a.ts", kind: "file", parentPath: null });
      await insertRepoFile(db, { repoId, branch: "dev", path: "a.ts", kind: "file", parentPath: null });
      await insertRepoFile(db, { repoId, branch: "main", path: "b.ts", kind: "file", parentPath: null });

      const branches = await listIndexedBranches(db, repoId);
      expect(branches).toEqual(["dev", "main"]);
    } finally {
      await db.close();
    }
  });
});
