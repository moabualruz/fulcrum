import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { __setApplicationScopeForTest } from "../../../../lib/server/application-scope.ts";
import { Document } from "@/db/entities/docs/Document.ts";
import { createTestOrm, type TestOrm } from "@/test-utils/db.ts";
import { createDoc } from "@/application/docs/commands.ts";

let scratch: string;
let cleanups: Array<() => Promise<void> | void> = [];

beforeEach(() => {
  scratch = mkdtempSync(join(tmpdir(), "fulcrum-web-docs-edit-"));
  process.env["FULCRUM_HOME"] = scratch;
});

afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) {
    await cleanup();
  }
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
): Promise<{ id: string; db: TestOrm }> {
  const db = await createTestOrm();
  const created = await createDoc(db.em.fork(), {
    orgId: db.seed.orgId,
    userId: db.seed.userId,
  }, {
    projectId: null,
    docType: overrides.kind ?? "spec",
    title: overrides.title ?? "Original",
    bodyMd: overrides.body ?? "body line one\nbody line two\n",
    frontmatter: {
      title: overrides.title ?? "Original",
      kind: overrides.kind ?? "spec",
      labels: overrides.labels ?? ["a", "b"],
    },
  });
  const restoreScope = __setApplicationScopeForTest({
    em: db.em.fork(),
    orgId: db.seed.orgId,
    userId: db.seed.userId,
  });
  cleanups.push(async () => {
    restoreScope();
    await db.close();
  });
  return { id: created.id, db };
}

async function getDoc(db: TestOrm, id: string): Promise<Document | null> {
  return db.em.fork().findOne(Document, { id } as never);
}

describe("/docs/[id]/edit +page.server.ts", () => {
  test("server route delegates persistence to application edit facade", () => {
    const source = readFileSync(join(import.meta.dir, "+page.server.ts"), "utf8");
    expect(source).toContain("application/docs/web-edit");
    expect(source).not.toMatch(/getKysely|selectFrom|insertInto|updateTable|deleteFrom|\.execute\(/);
  });

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
    const { id, db } = await seedDoc({
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
    const doc = await getDoc(db, id);
    expect(doc?.docType).toBe("adr");
    expect(doc?.bodyMd).toBe("new body\n");
    expect(doc?.frontmatter).toEqual({
      title: "After",
      kind: "decision",
      labels: ["a", "b"],
    });
  });

  test("byte-identical body when unchanged: load → resubmit unchanged → body bytes preserved", async () => {
    const originalBody = "Line one with    spaces\nline\ttwo\n   trailing  \n";
    const { id, db } = await seedDoc({
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
    const doc = await getDoc(db, id);
    expect(doc?.bodyMd).toBe(originalBody);
  });
});
