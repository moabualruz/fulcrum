import { mkdtempSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { openPglite } from "../../../../../../product-kernel/db/pglite.ts";
import { runMigrations } from "../../../../../../product-kernel/db/migrate.ts";
import { createLocalOrg } from "../../../../../../product-kernel/store/repositories.ts";
import { createDocumentAction } from "$lib/server/documents";

let scratch: string;

beforeEach(() => {
  scratch = mkdtempSync(join(tmpdir(), "fulcrum-web-docs-edit-"));
  process.env["FULCRUM_HOME"] = scratch;
});

afterEach(() => {
  delete process.env["FULCRUM_HOME"];
  rmSync(scratch, { recursive: true, force: true });
});

async function seedDoc(
  overrides: {
    title?: string;
    kind?: string;
    body?: string;
    labels?: string[];
  } = {},
): Promise<{ id: string }> {
  const dbDir = join(scratch, "state", "product", "db");
  mkdirSync(dbDir, { recursive: true });
  const db = await openPglite(join(dbDir, "main"));
  await runMigrations(db);
  const org = await createLocalOrg(db, { slug: "default", name: "Default" });
  const created = await createDocumentAction(db, {
    orgId: org.id,
    projectId: null,
    kind: overrides.kind ?? "spec",
    title: overrides.title ?? "Original",
    body: overrides.body ?? "body line one\nbody line two\n",
    frontmatter: {
      title: overrides.title ?? "Original",
      kind: overrides.kind ?? "spec",
      labels: overrides.labels ?? ["a", "b"],
    },
  });
  await db.close();
  return { id: created.id };
}

describe("/docs/[id]/edit +page.server.ts", () => {
  test("load returns the doc and a populated SuperValidated form", async () => {
    const { id } = await seedDoc({
      title: "EditMe",
      kind: "spec",
      body: "the body\n",
      labels: ["x", "y"],
    });
    const mod = await import(`./+page.server.ts?cachebust=${Date.now()}`);
    const result = await mod.load({ params: { id } } as Parameters<
      typeof mod.load
    >[0]);
    expect(result.doc.id).toBe(id);
    expect(result.form?.data?.title).toBe("EditMe");
    expect(result.form?.data?.kind).toBe("spec");
    expect(result.form?.data?.body).toBe("the body\n");
    expect(result.form?.data?.labels).toBe("x, y");
  });

  test("default action saves changes and returns { form }", async () => {
    const { id } = await seedDoc({
      title: "Before",
      kind: "spec",
      body: "old body\n",
      labels: ["a"],
    });
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 1}`);
    const fd = new FormData();
    fd.set("title", "After");
    fd.set("kind", "decision");
    fd.set("labels", "a, b");
    fd.set("body", "new body\n");
    const request = new Request("http://localhost/docs/x/edit", {
      method: "POST",
      body: fd,
    });
    const result = await mod.actions.default({
      params: { id },
      request,
    } as Parameters<typeof mod.actions.default>[0]);
    expect((result as { form?: unknown }).form).toBeDefined();
    const dbDir = join(scratch, "state", "product", "db");
    const db = await openPglite(join(dbDir, "main"));
    await runMigrations(db);
    try {
      const rows = await db.query<{
        title: string;
        kind: string;
        body: string;
        frontmatter: Record<string, unknown>;
      }>(
        `SELECT title, kind, body, frontmatter FROM documents WHERE id = $1`,
        [id],
      );
      expect(rows[0]?.title).toBe("After");
      expect(rows[0]?.kind).toBe("decision");
      expect(rows[0]?.body).toBe("new body\n");
      expect(rows[0]?.frontmatter).toEqual({
        title: "After",
        kind: "decision",
        labels: ["a", "b"],
      });
    } finally {
      await db.close();
    }
  });

  test("byte-identical body when unchanged: load → resubmit unchanged → body bytes preserved", async () => {
    const originalBody = "Line one with    spaces\nline\ttwo\n   trailing  \n";
    const { id } = await seedDoc({
      title: "Stable",
      kind: "note",
      body: originalBody,
      labels: ["keep"],
    });
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 2}`);
    const loaded = await mod.load({ params: { id } } as Parameters<
      typeof mod.load
    >[0]);
    // Re-submit the form values exactly as load() seeded them.
    const fd = new FormData();
    fd.set("title", String(loaded.form.data.title));
    fd.set("kind", String(loaded.form.data.kind));
    fd.set("labels", String(loaded.form.data.labels));
    fd.set("body", String(loaded.form.data.body));
    const request = new Request("http://localhost/docs/x/edit", {
      method: "POST",
      body: fd,
    });
    await mod.actions.default({ params: { id }, request } as Parameters<
      typeof mod.actions.default
    >[0]);
    const dbDir = join(scratch, "state", "product", "db");
    const db = await openPglite(join(dbDir, "main"));
    await runMigrations(db);
    try {
      const rows = await db.query<{ body: string }>(
        `SELECT body FROM documents WHERE id = $1`,
        [id],
      );
      expect(rows[0]?.body).toBe(originalBody);
    } finally {
      await db.close();
    }
  });
});
