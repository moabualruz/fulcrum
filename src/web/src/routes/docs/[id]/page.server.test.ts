import { mkdtempSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { openPglite } from "../../../../../product-kernel/db/pglite.ts";
import { runMigrations } from "../../../../../product-kernel/db/migrate.ts";
import { createLocalOrg } from "../../../../../product-kernel/store/repositories.ts";
import { createDocumentAction } from "$lib/server/documents";

let scratch: string;

beforeEach(() => {
  scratch = mkdtempSync(join(tmpdir(), "fulcrum-web-docs-detail-"));
  process.env["FULCRUM_HOME"] = scratch;
});

afterEach(() => {
  delete process.env["FULCRUM_HOME"];
  rmSync(scratch, { recursive: true, force: true });
});

async function seedDoc(
  overrides: { title?: string; kind?: string; body?: string } = {},
): Promise<{ id: string; orgId: string }> {
  const dbDir = join(scratch, "state", "product", "db");
  mkdirSync(dbDir, { recursive: true });
  const db = await openPglite(join(dbDir, "main"));
  await runMigrations(db);
  const org = await createLocalOrg(db, { slug: "default", name: "Default" });
  const created = await createDocumentAction(db, {
    orgId: org.id,
    projectId: null,
    kind: overrides.kind ?? "note",
    title: overrides.title ?? "Hello",
    body: overrides.body ?? "body content\n",
    frontmatter: {
      title: overrides.title ?? "Hello",
      kind: overrides.kind ?? "note",
      labels: ["one", "two"],
    },
  });
  await db.close();
  return { id: created.id, orgId: org.id };
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

describe("/docs/[id] +page.server.ts", () => {
  test("load returns the seeded document", async () => {
    const { id } = await seedDoc({ title: "Doc Title", kind: "spec" });
    const mod = await import(`./+page.server.ts?cachebust=${Date.now()}`);
    const result = await mod.load({ params: { id } } as Parameters<
      typeof mod.load
    >[0]);
    expect(result.doc.id).toBe(id);
    expect(result.doc.title).toBe("Doc Title");
    expect(result.doc.kind).toBe("spec");
    expect(result.doc.body).toBe("body content\n");
  });

  test("load throws 404 when the doc id does not exist", async () => {
    await seedDoc();
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 1}`);
    let caught: unknown;
    try {
      await mod.load({
        params: { id: "01JBOGUS000000000000000000" },
      } as Parameters<typeof mod.load>[0]);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeDefined();
    expect(
      typeof caught === "object" &&
        caught !== null &&
        "status" in caught &&
        (caught as { status: number }).status === 404,
    ).toBe(true);
  });

  test("delete action deletes the document and throws redirect 303 to /docs", async () => {
    const { id } = await seedDoc();
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 2}`);
    let caught: unknown;
    try {
      await mod.actions.delete({ params: { id } } as Parameters<
        typeof mod.actions.delete
      >[0]);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeDefined();
    expect(isRedirect(caught)).toBe(true);
    if (isRedirect(caught)) {
      expect(caught.status).toBe(303);
      expect(caught.location).toBe("/docs");
    }
    const dbDir = join(scratch, "state", "product", "db");
    const db = await openPglite(join(dbDir, "main"));
    await runMigrations(db);
    try {
      const rows = await db.query<{ id: string }>(
        `SELECT id FROM documents WHERE id = $1`,
        [id],
      );
      expect(rows).toHaveLength(0);
    } finally {
      await db.close();
    }
  });
});
