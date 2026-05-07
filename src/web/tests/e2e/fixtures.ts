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
import { createApplicationStoreFixture } from "../../../test-support/product-fixtures.ts";
import type { TestStore } from "../../../test-support/product-fixtures.ts";

export interface SeedTaskInput {
  projectId: string;
  title: string;
  status?: string;
  priority?: number;
}

export interface SeedArtifactInput {
  projectId?: string | null;
  taskId?: string | null;
  title: string;
  kind?: string;
  mime?: string;
  size?: number;
  bodyPath?: string | null;
  sha256?: string | null;
  archived?: boolean;
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
  seedArtifact: (input: SeedArtifactInput) => Promise<{ id: string }>;
}

// Worker-scoped: second type param declares worker fixtures.
export const test = base.extend<Record<never, never>, { fulcrumHome: FulcrumHome }>({
  fulcrumHome: [
    async ({}, use) => {
      const configuredHome = process.env["FULCRUM_HOME"];
      const home = configuredHome ?? mkdtempSync(join(tmpdir(), "fulcrum-e2e-"));
      process.env["FULCRUM_HOME"] = home;
      const fixture = await createApplicationStoreFixture(join(home, "state", "product", "db", "main"));
      const db: TestStore = fixture.store;
      const orgId = fixture.orgId;
      const projectIds: string[] = [];
      const taskIds: string[] = [];
      const docIds: string[] = [];

      const seedProject = async (slug: string, name?: string): Promise<{ id: string }> => {
        const id = crypto.randomUUID();
        await db.query(
          `INSERT INTO projects (id, org_id, name) VALUES ($1, $2, $3)`,
          [id, orgId, name ?? slug],
        );
        projectIds.push(id);
        return { id };
      };

      const seedTask = async (input: SeedTaskInput): Promise<{ id: string }> => {
        const id = crypto.randomUUID();
        await db.query(
          `INSERT INTO tasks (id, org_id, project_id, title, status, priority) VALUES ($1, $2, $3, $4, $5, $6)`,
          [id, orgId, input.projectId, input.title, input.status ?? "todo", input.priority ?? 0],
        );
        taskIds.push(id);
        return { id };
      };

      const artifactIds: string[] = [];

      const seedArtifact = async (input: SeedArtifactInput): Promise<{ id: string }> => {
        const id = crypto.randomUUID();
        const runId = crypto.randomUUID();
        await db.query(
          `INSERT INTO agent_runs (id, org_id, agent_name, status) VALUES ($1, $2, $3, $4)`,
          [runId, orgId, "e2e-fixture", "succeeded"],
        );
        await db.query(
          `INSERT INTO artifacts (id, org_id, run_id, task_id, path, filename, mime, size_bytes, checksum_sha256)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [
            id,
            orgId,
            runId,
            input.taskId ?? null,
            input.bodyPath ?? input.title,
            input.title,
            input.mime ?? "application/octet-stream",
            input.size ?? null,
            input.sha256 ?? null,
          ],
        );
        artifactIds.push(id);
        return { id };
      };

      const seedDoc = async (input: SeedDocInput): Promise<{ id: string }> => {
        const id = crypto.randomUUID();
        await db.query(
          `INSERT INTO documents (id, org_id, project_id, doc_type, title, body_md)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [id, orgId, input.projectId, input.kind ?? "note", input.title, input.body ?? ""],
        );
        docIds.push(id);
        return { id };
      };

      await use({ home, orgId, seedProject, seedTask, seedDoc, seedArtifact });

      // Cleanup: dependency order — artifacts → docs → tasks → events/projects.
      for (const id of artifactIds) await db.query("DELETE FROM artifacts WHERE id = $1", [id]);
      for (const id of docIds) await db.query("DELETE FROM documents WHERE id = $1", [id]);
      for (const id of taskIds) await db.query("DELETE FROM tasks WHERE id = $1", [id]);
      for (const id of projectIds) {
        await db.query("DELETE FROM events WHERE project_id = $1", [id]);
        await db.query("DELETE FROM projects WHERE id = $1", [id]);
      }

      await fixture.close();
      rmSync(home, { recursive: true, force: true });
      if (configuredHome === undefined) delete process.env["FULCRUM_HOME"];
      else process.env["FULCRUM_HOME"] = configuredHome;
    },
    { scope: "worker" },
  ],
});

export { expect };
