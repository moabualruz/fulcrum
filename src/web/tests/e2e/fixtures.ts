/**
 * Playwright fixtures for Fulcrum E2E tests.
 *
 * ISOLATION TRADE-OFF: Playwright starts the webServer once per run, and
 * PGlite cannot be opened safely from both the server and test runner. This
 * fixture seeds through a test-only server endpoint so all DB writes happen
 * inside the SvelteKit process, then row-level cleanup removes tracked IDs.
 */

import { test as base, expect, type APIRequestContext } from "@playwright/test";

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
  seedSearchKinds: (common: string, kinds: readonly string[]) => Promise<void>;
}

export const test = base.extend<{ fulcrumHome: FulcrumHome }>({
  fulcrumHome: async ({ request }, use) => {
      const init = await fixturePost<{ home: string; orgId: string }>(request, { action: "init" });
      const home = init.home;
      const orgId = init.orgId;
      const projectIds: string[] = [];
      const taskIds: string[] = [];
      const docIds: string[] = [];
      const artifactIds: string[] = [];
      const runIds: string[] = [];
      const searchSourceIds: string[] = [];

      const seedProject = async (slug: string, name?: string): Promise<{ id: string }> => {
        const { id } = await fixturePost<{ id: string }>(request, { action: "seedProject", slug, name });
        projectIds.push(id);
        return { id };
      };

      const seedTask = async (input: SeedTaskInput): Promise<{ id: string }> => {
        const { id } = await fixturePost<{ id: string }>(request, { action: "seedTask", input });
        taskIds.push(id);
        return { id };
      };

      const seedArtifact = async (input: SeedArtifactInput): Promise<{ id: string }> => {
        const { id, runId } = await fixturePost<{ id: string; runId: string }>(request, {
          action: "seedArtifact",
          input,
        });
        artifactIds.push(id);
        runIds.push(runId);
        return { id };
      };

      const seedDoc = async (input: SeedDocInput): Promise<{ id: string }> => {
        const { id } = await fixturePost<{ id: string }>(request, { action: "seedDoc", input });
        docIds.push(id);
        return { id };
      };

      await use({
        home,
        orgId,
        seedProject,
        seedTask,
        seedDoc,
        seedArtifact,
        async seedSearchKinds(common: string, kinds: readonly string[]) {
          const seeded = await fixturePost<{ sourceIds: string[] }>(request, {
            action: "seedSearchKinds",
            common,
            kinds,
          });
          searchSourceIds.push(...seeded.sourceIds);
        },
      });

      await fixturePost(request, {
        action: "cleanup",
        input: { artifactIds, docIds, taskIds, projectIds, runIds, searchSourceIds },
      });
  },
});

export { expect };

async function fixturePost<T = unknown>(
  request: APIRequestContext,
  body: Record<string, unknown>,
): Promise<T> {
  const response = await request.post("/api/e2e-fixtures", { data: body });
  if (!response.ok()) {
    throw new Error(`E2E fixture request failed: ${response.status()} ${await response.text()}`);
  }
  return await response.json() as T;
}
