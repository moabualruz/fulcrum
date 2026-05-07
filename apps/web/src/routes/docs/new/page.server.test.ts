import { mkdtempSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { openIsolatedStore } from "@/test-support/product-fixtures.ts";
import { migrateIsolatedStore } from "@/test-support/product-fixtures.ts";
import { createLocalOrg } from "@/test-support/product-fixtures.ts";

let scratch: string;

beforeEach(() => {
  scratch = mkdtempSync(join(tmpdir(), "fulcrum-web-docs-new-"));
  process.env["FULCRUM_HOME"] = scratch;
});

afterEach(() => {
  delete process.env["FULCRUM_HOME"];
  rmSync(scratch, { recursive: true, force: true });
});

async function seedDb(): Promise<{ orgId: string }> {
  const dbDir = join(scratch, "state", "product", "db");
  mkdirSync(dbDir, { recursive: true });
  const db = await openIsolatedStore(join(dbDir, "main"));
  await migrateIsolatedStore(db);
  const org = await createLocalOrg(db, { slug: "default", name: "Default" });
  await db.close();
  return { orgId: org.id };
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

describe("/docs/new +page.server.ts", () => {
  test("load returns an empty SuperValidated form", async () => {
    await seedDb();
    const mod = await import(`./+page.server.ts?cachebust=${Date.now()}`);
    const result = await mod.load();
    expect(result.form).toBeDefined();
    expect(result.form?.data?.title).toBe("");
    expect(result.form?.data?.kind).toBe("");
    expect(result.form?.data?.body).toBe("");
    expect(result.form?.data?.labels).toBe("");
  });

  test("load returns templates map with all 9 doc_types pre-populated", async () => {
    await seedDb();
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 10}`);
    const result = await mod.load();
    expect(result.templates).toBeDefined();
    const docTypes = ["spec","adr","wiki","runbook","meeting","postmortem","rfc","note","scratch"];
    for (const dt of docTypes) {
      expect(result.templates).toHaveProperty(dt);
      expect(typeof result.templates[dt]).toBe("string");
    }
    // ADR body has the required sections
    expect(result.templates["adr"]).toContain("## Context");
    expect(result.templates["adr"]).toContain("## Decision");
    expect(result.templates["adr"]).toContain("## Consequences");
  });

  test("default action with valid input creates a document and throws redirect 303", async () => {
    const { orgId } = await seedDb();
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 1}`);
    const fd = new FormData();
    fd.set("title", "My Doc");
    fd.set("kind", "spec");
    fd.set("labels", "alpha, beta");
    fd.set("body", "# Hello\nbody\n");
    const request = new Request("http://localhost/docs/new", {
      method: "POST",
      body: fd,
    });
    let caught: unknown;
    try {
      await mod.actions.default({ request } as Parameters<
        typeof mod.actions.default
      >[0]);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeDefined();
    expect(isRedirect(caught)).toBe(true);
    if (isRedirect(caught)) {
      expect(caught.status).toBe(303);
      expect(caught.location.startsWith("/docs/")).toBe(true);
    }
    // Verify a document row was actually created.
    const dbDir = join(scratch, "state", "product", "db");
    const db = await openIsolatedStore(join(dbDir, "main"));
    await migrateIsolatedStore(db);
    try {
      const rows = await db.query<{
        id: string;
        org_id: string;
        title: string;
        kind: string;
        body: string;
        frontmatter: Record<string, unknown>;
      }>(`SELECT id, org_id, title, kind, body, frontmatter FROM documents`);
      expect(rows).toHaveLength(1);
      expect(rows[0]?.title).toBe("My Doc");
      expect(rows[0]?.kind).toBe("spec");
      expect(rows[0]?.org_id).toBe(orgId);
      expect(rows[0]?.frontmatter).toEqual({
        title: "My Doc",
        kind: "spec",
        labels: ["alpha", "beta"],
      });
    } finally {
      await db.close();
    }
  });

  test("default action with empty title returns fail(400, {form})", async () => {
    await seedDb();
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 2}`);
    const fd = new FormData();
    fd.set("title", "");
    fd.set("kind", "note");
    fd.set("body", "");
    const request = new Request("http://localhost/docs/new", {
      method: "POST",
      body: fd,
    });
    const result = (await mod.actions.default({ request } as Parameters<
      typeof mod.actions.default
    >[0])) as {
      status?: number;
      data?: { form?: { valid?: boolean; errors?: Record<string, unknown> } };
    };
    expect(result.status).toBe(400);
    expect(result.data?.form).toBeDefined();
    expect(result.data?.form?.valid).toBe(false);
  });
});
