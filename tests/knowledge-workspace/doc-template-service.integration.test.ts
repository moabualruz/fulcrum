import { afterEach, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";

import { DEFAULT_ORG_ID } from "@platform-core/infrastructure/application-database/seed.ts";
import { EntityManagerDocTemplateService } from "@knowledge-workspace/application/docs/em-doc-template-service.ts";
import { createTestOrm, type TestOrm } from "@test-support/application-database.ts";

let db: TestOrm | null = null;

afterEach(async () => {
  await db?.close();
  db = null;
});

async function freshDb(): Promise<TestOrm> {
  db = await createTestOrm();
  return db;
}

describe("EntityManagerDocTemplateService with migrated PGlite data", () => {
  test("lists DB templates plus built-in defaults in deterministic order", async () => {
    const testDb = await freshDb();
    const em = testDb.em;
    const projectId = randomUUID();

    await em.getConnection().execute(
      `INSERT INTO projects (id, org_id, slug, name, created_at, updated_at)
       VALUES (?, ?, ?, ?, now(), now())`,
      [projectId, DEFAULT_ORG_ID, "docs-template-project", "Docs Template Project"],
    );
    await em.getConnection().execute(
      `INSERT INTO doc_templates
         (id, org_id, project_id, doc_type, name, frontmatter_template, body_template, is_default, created_at)
       VALUES
         (?, ?, null, ?, ?, ?::jsonb, ?, true, now()),
         (?, ?, ?, ?, ?, ?::jsonb, ?, true, now())`,
      [
        randomUUID(),
        DEFAULT_ORG_ID,
        "spec",
        "Org Spec",
        JSON.stringify({ owner: "team" }),
        "# Org Spec",
        randomUUID(),
        DEFAULT_ORG_ID,
        projectId,
        "adr",
        "Project ADR",
        JSON.stringify({ scope: "project" }),
        "# Project ADR",
      ],
    );

    const rows = await new EntityManagerDocTemplateService(em).list(DEFAULT_ORG_ID, projectId);

    expect(rows.some((row) => row.name === "Org Spec" && row.projectId === null)).toBe(true);
    expect(rows.some((row) => row.name === "Project ADR" && row.projectId === projectId)).toBe(true);
    expect(rows.some((row) => row.docType === "runbook" && row.projectId === null)).toBe(true);
    const projectRows = rows.filter((row) => row.projectId !== null);
    expect(projectRows.map((row) => row.name)).toEqual(["Project ADR"]);
  });

  test("resolves project default, org fallback, then built-in fallback", async () => {
    const testDb = await freshDb();
    const em = testDb.em;
    const projectId = randomUUID();

    await em.getConnection().execute(
      `INSERT INTO projects (id, org_id, slug, name, created_at, updated_at)
       VALUES (?, ?, ?, ?, now(), now())`,
      [projectId, DEFAULT_ORG_ID, "docs-template-resolve", "Docs Template Resolve"],
    );
    await em.getConnection().execute(
      `INSERT INTO doc_templates
         (id, org_id, project_id, doc_type, name, frontmatter_template, body_template, is_default, created_at)
       VALUES
         (?, ?, null, ?, ?, ?::jsonb, ?, true, now()),
         (?, ?, ?, ?, ?, ?::jsonb, ?, true, now())`,
      [
        randomUUID(),
        DEFAULT_ORG_ID,
        "wiki",
        "Org Wiki",
        JSON.stringify({ level: "org" }),
        "# Org Wiki",
        randomUUID(),
        DEFAULT_ORG_ID,
        projectId,
        "wiki",
        "Project Wiki",
        JSON.stringify({ level: "project" }),
        "# Project Wiki",
      ],
    );

    const service = new EntityManagerDocTemplateService(em);
    const projectDefault = await service.resolve(DEFAULT_ORG_ID, projectId, "wiki");
    const orgDefault = await service.resolve(DEFAULT_ORG_ID, null, "wiki");
    const builtIn = await service.resolve(DEFAULT_ORG_ID, projectId, "runbook");

    expect(projectDefault?.name).toBe("Project Wiki");
    expect(projectDefault?.frontmatterTemplate).toEqual({ level: "project" });
    expect(orgDefault?.name).toBe("Org Wiki");
    expect(builtIn?.docType).toBe("runbook");
    expect(builtIn?.projectId).toBeNull();
  });
});
