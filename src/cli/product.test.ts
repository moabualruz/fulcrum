import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { run as runProduct } from "./product.ts";
import { openPglite } from "../product-kernel/db/pglite.ts";
import { runMigrations } from "../product-kernel/db/migrate.ts";
import { productDbDir } from "../product-kernel/paths.ts";
import {
  createLocalOrg,
  createProject,
  createTask,
} from "../product-kernel/store/repositories.ts";
import { indexSearchDocument } from "../product-kernel/search.ts";

let scratch = "";
let originalFulcrumHome: string | undefined;

beforeEach(async () => {
  scratch = await mkdtemp(join(tmpdir(), "fulcrum-product-cli-"));
  originalFulcrumHome = process.env["FULCRUM_HOME"];
  process.env["FULCRUM_HOME"] = join(scratch, ".fulcrum");
});

afterEach(async () => {
  if (originalFulcrumHome === undefined) delete process.env["FULCRUM_HOME"];
  else process.env["FULCRUM_HOME"] = originalFulcrumHome;
  await rm(scratch, { recursive: true, force: true });
});

function captureStdout(): { lines: string[]; restore: () => void } {
  const lines: string[] = [];
  const original = console.log;
  console.log = (...args: unknown[]) => {
    lines.push(args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" "));
  };
  return { lines, restore: () => { console.log = original; } };
}

describe("fulcrum product CLI", () => {
  test("product init --json reports engine and creates the local org", async () => {
    const cap = captureStdout();
    try {
      await runProduct(["init", "--json"]);
    } finally {
      cap.restore();
    }
    const payload = JSON.parse(cap.lines.join("\n"));
    expect(payload.engine).toBe("pglite");
    expect(payload.org.slug).toBe("default");
    expect(payload.org.created).toBe(true);
  });

  test("product projects list --json returns inserted projects", async () => {
    // Seed via direct db access at the same path the CLI will open.
    const dbPath = join(productDbDir(), "main");
    await Bun.write(join(productDbDir(), ".keep"), "");
    const db = await openPglite(dbPath);
    try {
      await runMigrations(db);
      const org = await createLocalOrg(db, { slug: "default", name: "Local" });
      await createProject(db, { orgId: org.id, slug: "alpha", name: "Alpha" });
    } finally {
      await db.close();
    }
    const cap = captureStdout();
    try {
      await runProduct(["projects", "list", "--json"]);
    } finally {
      cap.restore();
    }
    const payload = JSON.parse(cap.lines.join("\n"));
    expect(Array.isArray(payload)).toBe(true);
    expect(payload[0].slug).toBe("alpha");
  });

  test("product search returns FTS hits as JSON", async () => {
    const dbPath = join(productDbDir(), "main");
    await Bun.write(join(productDbDir(), ".keep"), "");
    const db = await openPglite(dbPath);
    try {
      await runMigrations(db);
      const org = await createLocalOrg(db, { slug: "default", name: "Local" });
      await indexSearchDocument(db, {
        orgId: org.id,
        sourceKind: "doc",
        sourceId: "d1",
        title: "kernel overview",
        body: "fulcrum product kernel notes",
      });
    } finally {
      await db.close();
    }
    const cap = captureStdout();
    try {
      await runProduct(["search", "kernel", "--json"]);
    } finally {
      cap.restore();
    }
    const payload = JSON.parse(cap.lines.join("\n"));
    expect(payload).toHaveLength(1);
    expect(payload[0].source_id).toBe("d1");
  });

  test("product search treats flag values as flag values regardless of order", async () => {
    const dbPath = join(productDbDir(), "main");
    await Bun.write(join(productDbDir(), ".keep"), "");
    const db = await openPglite(dbPath);
    try {
      await runMigrations(db);
      const org = await createLocalOrg(db, { slug: "default", name: "Local" });
      await indexSearchDocument(db, {
        orgId: org.id,
        sourceKind: "doc",
        sourceId: "d1",
        title: "kernel",
        body: "kernel",
      });
    } finally {
      await db.close();
    }
    // Flag-before-positional: query must be the trailing positional.
    let cap = captureStdout();
    try {
      await runProduct(["search", "--org-slug", "default", "kernel", "--json"]);
    } finally {
      cap.restore();
    }
    const flagFirst = JSON.parse(cap.lines.join("\n"));
    expect(flagFirst).toHaveLength(1);
    expect(flagFirst[0].source_id).toBe("d1");

    // Positional-before-flag must produce identical output.
    cap = captureStdout();
    try {
      await runProduct(["search", "kernel", "--org-slug", "default", "--json"]);
    } finally {
      cap.restore();
    }
    const positionalFirst = JSON.parse(cap.lines.join("\n"));
    expect(positionalFirst).toEqual(flagFirst);
  });

  test("product search --kind filters by source kind", async () => {
    const dbPath = join(productDbDir(), "main");
    await Bun.write(join(productDbDir(), ".keep"), "");
    const db = await openPglite(dbPath);
    try {
      await runMigrations(db);
      const org = await createLocalOrg(db, { slug: "default", name: "Local" });
      await indexSearchDocument(db, {
        orgId: org.id,
        sourceKind: "task",
        sourceId: "t1",
        title: "kernel task item",
        body: "kernel task body",
      });
      await indexSearchDocument(db, {
        orgId: org.id,
        sourceKind: "doc",
        sourceId: "d1",
        title: "kernel doc item",
        body: "kernel doc body",
      });
    } finally {
      await db.close();
    }
    const cap = captureStdout();
    try {
      await runProduct(["search", "kernel", "--kind", "task", "--json"]);
    } finally {
      cap.restore();
    }
    const payload = JSON.parse(cap.lines.join("\n"));
    expect(payload).toHaveLength(1);
    expect(payload[0].source_kind).toBe("task");
  });

  test("product context assemble --task <id> renders ordered Markdown", async () => {
    const dbPath = join(productDbDir(), "main");
    await Bun.write(join(productDbDir(), ".keep"), "");
    const db = await openPglite(dbPath);
    let taskId = "";
    try {
      await runMigrations(db);
      const org = await createLocalOrg(db, { slug: "default", name: "Local" });
      const project = await createProject(db, { orgId: org.id, slug: "p", name: "P" });
      const task = await createTask(db, {
        orgId: org.id,
        projectId: project.id,
        title: "Wire kernel CLI",
      });
      taskId = task.id;
    } finally {
      await db.close();
    }
    const cap = captureStdout();
    try {
      await runProduct(["context", "assemble", "--task", taskId]);
    } finally {
      cap.restore();
    }
    const text = cap.lines.join("\n");
    expect(text).toContain("## Task");
    expect(text).toContain("Wire kernel CLI");
  });
});
