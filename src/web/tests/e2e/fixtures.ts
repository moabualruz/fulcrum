/**
 * Playwright fixtures for Fulcrum E2E tests.
 *
 * ISOLATION TRADE-OFF: Playwright starts the webServer once per run so
 * FULCRUM_HOME cannot change between tests. This fixture is per-WORKER:
 * one temp home + DB per worker, row-level cleanup between tests via
 * tracked IDs. For full DB isolation, a per-test vite server would be
 * needed — not supported by webServer model. See 09-tests-and-e2e.md.
 */

import { test as base, expect } from "@playwright/test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openPglite } from "../../../product-kernel/db/pglite.ts";
import { runMigrations } from "../../../product-kernel/db/migrate.ts";
import {
  createLocalOrg,
  createProject,
  createTask,
} from "../../../product-kernel/store/repositories.ts";
import { newUlid } from "../../../product-kernel/ids.ts";
import type { ProductDb } from "../../../product-kernel/db/types.ts";

export interface SeedTaskInput {
  projectId: string;
  title: string;
  status?: string;
  priority?: number;
}

export interface SeedDocInput {
  projectId: string | null;
  title: string;
  body?: string;
  kind?: string;
}

export interface FulcrumHome {
  home: string;
  orgId: string;
  seedProject: (slug: string, name?: string) => Promise<{ id: string }>;
  seedTask: (input: SeedTaskInput) => Promise<{ id: string }>;
  seedDoc: (input: SeedDocInput) => Promise<{ id: string }>;
}

// Worker-scoped: second type param declares worker fixtures.
export const test = base.extend<Record<never, never>, { fulcrumHome: FulcrumHome }>({
  fulcrumHome: [
    async ({}, use) => {
      const home = mkdtempSync(join(tmpdir(), "fulcrum-e2e-"));
      process.env["FULCRUM_HOME"] = home;
      const db: ProductDb = await openPglite(join(home, "state", "product", "db", "main"));
      await runMigrations(db);
      const org = await createLocalOrg(db, { slug: "local", name: "Local" });
      const orgId = org.id;
      const projectIds: string[] = [];
      const taskIds: string[] = [];
      const docIds: string[] = [];

      const seedProject = async (slug: string, name?: string): Promise<{ id: string }> => {
        const row = await createProject(db, { orgId, slug, name: name ?? slug });
        projectIds.push(row.id);
        return { id: row.id };
      };

      const seedTask = async (input: SeedTaskInput): Promise<{ id: string }> => {
        const row = await createTask(db, {
          orgId,
          projectId: input.projectId,
          title: input.title,
          status: input.status,
          priority: input.priority,
        });
        taskIds.push(row.id);
        return { id: row.id };
      };

      const seedDoc = async (input: SeedDocInput): Promise<{ id: string }> => {
        const id = newUlid();
        await db.query(
          `INSERT INTO documents (id, org_id, project_id, kind, title, body)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [id, orgId, input.projectId, input.kind ?? "note", input.title, input.body ?? ""],
        );
        docIds.push(id);
        return { id };
      };

      await use({ home, orgId, seedProject, seedTask, seedDoc });

      // Cleanup: dependency order — docs → tasks → events/projects.
      for (const id of docIds) await db.query("DELETE FROM documents WHERE id = $1", [id]);
      for (const id of taskIds) await db.query("DELETE FROM tasks WHERE id = $1", [id]);
      for (const id of projectIds) {
        await db.query("DELETE FROM events WHERE project_id = $1", [id]);
        await db.query("DELETE FROM projects WHERE id = $1", [id]);
      }

      await db.close();
      rmSync(home, { recursive: true, force: true });
      delete process.env["FULCRUM_HOME"];
    },
    { scope: "worker" },
  ],
});

export { expect };
