import { mkdtempSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { openPglite } from "../../../../product-kernel/db/pglite.ts";
import { runMigrations } from "../../../../product-kernel/db/migrate.ts";
import { createLocalOrg, createProject } from "../../../../product-kernel/store/repositories.ts";
import { createDocumentAction } from "$lib/server/documents";

// `+page.server.ts` reads `productDbDir() + "/main"` (which honours
// `FULCRUM_HOME`). Seed three documents so the kind-filter and FTS
// behaviours can be asserted independently.

let scratch: string;

interface DocsPayload {
  documents: Array<{
    id: string;
    title: string;
    kind: string;
    project_id: string | null;
    updated_at: string;
    body_excerpt: string;
  }>;
}

function streamedData<T>(result: unknown): Promise<T> {
  const stream = (result as { streamed?: { data?: unknown } }).streamed?.data;
  expect(stream).toBeInstanceOf(Promise);
  return stream as Promise<T>;
}

beforeEach(() => {
  scratch = mkdtempSync(join(tmpdir(), "fulcrum-web-docs-list-"));
  process.env["FULCRUM_HOME"] = scratch;
});

afterEach(() => {
  delete process.env["FULCRUM_HOME"];
  rmSync(scratch, { recursive: true, force: true });
});

interface SeededIds {
  orgId: string;
  projectId: string;
  decisionId: string;
  specId: string;
  noteId: string;
}

async function seedDocs(): Promise<SeededIds> {
  const dbDir = join(scratch, "state", "product", "db");
  mkdirSync(dbDir, { recursive: true });
  const db = await openPglite(join(dbDir, "main"));
  await runMigrations(db);
  const org = await createLocalOrg(db, { slug: "default", name: "Default" });
  const project = await createProject(db, {
    orgId: org.id,
    slug: "p",
    name: "P",
  });
  const decision = await createDocumentAction(db, {
    orgId: org.id,
    projectId: project.id,
    kind: "decision",
    title: "Kernel decision",
    body: "the kernel decided everything",
  });
  await db.query(`UPDATE documents SET updated_at = $2 WHERE id = $1`, [
    decision.id,
    "2026-04-03T00:00:00.000Z",
  ]);
  const spec = await createDocumentAction(db, {
    orgId: org.id,
    projectId: project.id,
    kind: "spec",
    title: "Spec doc",
    body: "details about the kernel spec",
  });
  await db.query(`UPDATE documents SET updated_at = $2 WHERE id = $1`, [
    spec.id,
    "2026-04-02T00:00:00.000Z",
  ]);
  const note = await createDocumentAction(db, {
    orgId: org.id,
    projectId: project.id,
    kind: "note",
    title: "Random note",
    body: "totally unrelated body",
  });
  await db.query(`UPDATE documents SET updated_at = $2 WHERE id = $1`, [
    note.id,
    "2026-04-01T00:00:00.000Z",
  ]);
  await db.close();
  return {
    orgId: org.id,
    projectId: project.id,
    decisionId: decision.id,
    specId: spec.id,
    noteId: note.id,
  };
}

function fakeEvent(searchParams: Record<string, string>): Parameters<
  typeof import("./+page.server.ts").load
>[0] {
  const url = new URL("http://localhost/docs");
  for (const [k, v] of Object.entries(searchParams)) {
    url.searchParams.set(k, v);
  }
  return {
    url,
    locals: { activeProjectId: null },
  } as unknown as Parameters<typeof import("./+page.server.ts").load>[0];
}

describe("/docs +page.server.ts load()", () => {
  test("default load returns docs in updated_at-DESC order with empty kind + q", async () => {
    const { decisionId, specId, noteId } = await seedDocs();
    const mod = await import(`./+page.server.ts?cachebust=${Date.now()}`);
    const result = await mod.load(fakeEvent({}));
    expect(result.kind).toBe("");
    expect(result.q).toBe("");
    expect(result.activeProjectId).toBeNull();
    const payload = await streamedData<DocsPayload>(result);
    expect(payload.documents).toHaveLength(3);
    expect(payload.documents[0]?.id).toBe(decisionId);
    expect(payload.documents[1]?.id).toBe(specId);
    expect(payload.documents[2]?.id).toBe(noteId);
    expect(payload.documents[0]?.kind).toBe("decision");
  });

  test("kind filter narrows the rows to matching kinds", async () => {
    const { specId } = await seedDocs();
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 1}`);
    const result = await mod.load(fakeEvent({ kind: "spec" }));
    expect(result.kind).toBe("spec");
    const payload = await streamedData<DocsPayload>(result);
    expect(payload.documents).toHaveLength(1);
    expect(payload.documents[0]?.id).toBe(specId);
    expect(payload.documents[0]?.kind).toBe("spec");
  });

  test("free-text q hits searchProductDocuments scoped to sourceKinds=['document']", async () => {
    const { decisionId, specId } = await seedDocs();
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 2}`);
    const result = await mod.load(fakeEvent({ q: "kernel" }));
    expect(result.q).toBe("kernel");
    // Both seeded docs whose body/title hit "kernel" come back; the unrelated
    // note is filtered out via FTS.
    const payload = await streamedData<DocsPayload>(result);
    const ids = payload.documents.map((d) => d.id).sort();
    expect(ids).toEqual([decisionId, specId].sort());
  });

  test("returns empty array when DB has no documents", async () => {
    const dbDir = join(scratch, "state", "product", "db");
    mkdirSync(dbDir, { recursive: true });
    const db = await openPglite(join(dbDir, "main"));
    await runMigrations(db);
    await db.close();
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 3}`);
    const result = await mod.load(fakeEvent({}));
    const payload = await streamedData<DocsPayload>(result);
    expect(payload.documents).toEqual([]);
  });
});
