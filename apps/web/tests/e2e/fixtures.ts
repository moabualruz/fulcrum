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
      const serverProjectIds: string[] = [];
      const serverProjectIdByFixtureId = new Map<string, string>();
      const taskIds: string[] = [];
      const docIds: string[] = [];
      const serverDocIds: string[] = [];
      const artifactIds: string[] = [];
      const runIds: string[] = [];
      const searchSourceIds: string[] = [];

      const seedProject = async (slug: string, name?: string): Promise<{ id: string }> => {
        const { id } = await fixturePost<{ id: string }>(request, { action: "seedProject", slug, name });
        const serverProjectId = await seedProjectPublicApi(request, { orgId, slug, name: name ?? slug });
        if (serverProjectId) {
          serverProjectIds.push(serverProjectId);
          serverProjectIdByFixtureId.set(id, serverProjectId);
        }
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
        await seedArtifactPublicApi(request, { id, runId, input, serverProjectIdByFixtureId });
        artifactIds.push(id);
        runIds.push(runId);
        return { id };
      };

      const seedDoc = async (input: SeedDocInput): Promise<{ id: string }> => {
        const { id } = await fixturePost<{ id: string }>(request, { action: "seedDoc", input });
        const serverDocId = await seedDocPublicApi(request, { input, serverProjectIdByFixtureId });
        if (serverDocId) serverDocIds.push(serverDocId);
        docIds.push(id);
        return { id: serverDocId ?? id };
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
      await cleanupDocPublicApi(request, serverDocIds);
      await cleanupArtifactPublicApi(request, artifactIds);
      await cleanupProjectPublicApi(request, orgId, serverProjectIds);
  },
});

export { expect };

async function fixturePost<T = unknown>(
  request: APIRequestContext,
  body: Record<string, unknown>,
): Promise<T> {
  let response: Awaited<ReturnType<APIRequestContext["post"]>> | null = null;
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      response = await request.post("/api/e2e-fixtures", { data: body });
      break;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 100 * (attempt + 1)));
    }
  }
  if (!response) {
    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  }
  if (!response.ok()) {
    throw new Error(`E2E fixture request failed: ${response.status()} ${await response.text()}`);
  }
  return await response.json() as T;
}

async function seedArtifactPublicApi(
  request: APIRequestContext,
  params: {
    id: string;
    runId: string;
    input: SeedArtifactInput;
    serverProjectIdByFixtureId: ReadonlyMap<string, string>;
  },
): Promise<void> {
  const baseUrl = publicApiBaseUrl();
  const projectId = params.input.projectId ? params.serverProjectIdByFixtureId.get(params.input.projectId) : null;
  if (!baseUrl || !projectId) return;

  const response = await request.post(`${baseUrl}/api/v1/artifacts`, {
    data: {
      id: params.id,
      projectId,
      traceId: `trace-e2e-${params.id}`,
      runId: params.runId,
      taskId: params.input.taskId ?? null,
      kind: params.input.kind ?? "file",
      title: params.input.title,
      filename: params.input.title,
      bodyPath: params.input.bodyPath ?? params.input.title,
      checksumSha256: params.input.sha256 ?? null,
      mime: params.input.mime ?? "application/octet-stream",
      sizeBytes: params.input.size ?? 0,
      lifecycleState: params.input.archived ? "archived" : "created",
      metadataJson: { lifecycleState: params.input.archived ? "archived" : "created" },
    },
  });
  if (!response.ok()) {
    throw new Error(`E2E artifact public API seed failed: ${response.status()} ${await response.text()}`);
  }

  if (params.input.archived) {
    const archive = await request.post(`${baseUrl}/api/v1/artifacts/${encodeURIComponent(params.id)}/archive`);
    if (!archive.ok()) {
      throw new Error(`E2E artifact archive seed failed: ${archive.status()} ${await archive.text()}`);
    }
  }
}

async function seedProjectPublicApi(
  request: APIRequestContext,
  input: { orgId: string; slug: string; name: string },
): Promise<string | null> {
  const baseUrl = publicApiBaseUrl();
  if (!baseUrl) return null;
  const response = await request.post(`${baseUrl}/api/v1/projects`, {
    data: {
      orgId: input.orgId,
      slug: input.slug,
      name: input.name,
      traceId: `trace-e2e-project-${input.slug}`,
    },
  });
  if (!response.ok()) {
    throw new Error(`E2E project public API seed failed: ${response.status()} ${await response.text()}`);
  }
  const body = await response.json() as { id?: unknown };
  if (typeof body.id !== "string" || body.id.length === 0) {
    throw new Error("E2E project public API seed returned no id");
  }
  return body.id;
}

async function seedDocPublicApi(
  request: APIRequestContext,
  params: {
    input: SeedDocInput;
    serverProjectIdByFixtureId: ReadonlyMap<string, string>;
  },
): Promise<string | null> {
  const baseUrl = publicApiBaseUrl();
  if (!baseUrl) return null;
  const projectId = params.input.projectId ? params.serverProjectIdByFixtureId.get(params.input.projectId) : null;
  if (params.input.projectId && !projectId) return null;
  if (!params.input.projectId) return null;
  const response = await request.post(`${baseUrl}/api/v1/docs`, {
    data: {
      ...(projectId ? { projectId } : {}),
      title: params.input.title,
      type: params.input.kind ?? "note",
      bodyMd: params.input.body ?? "",
      frontmatter: {
        title: params.input.title,
        kind: params.input.kind ?? "note",
      },
    },
  });
  if (!response.ok()) {
    throw new Error(`E2E document public API seed failed: ${response.status()} ${await response.text()}`);
  }
  const body = await response.json() as { id?: unknown };
  if (typeof body.id !== "string" || body.id.length === 0) {
    throw new Error("E2E document public API seed returned no id");
  }
  return body.id;
}

async function cleanupDocPublicApi(
  request: APIRequestContext,
  docIds: readonly string[],
): Promise<void> {
  const baseUrl = publicApiBaseUrl();
  if (!baseUrl) return;
  for (const id of docIds) {
    await request.delete(`${baseUrl}/api/v1/docs/${encodeURIComponent(id)}`).catch(() => null);
  }
}

async function cleanupArtifactPublicApi(
  request: APIRequestContext,
  artifactIds: readonly string[],
): Promise<void> {
  const baseUrl = publicApiBaseUrl();
  if (!baseUrl) return;
  for (const id of artifactIds) {
    await request.delete(`${baseUrl}/api/v1/artifacts/${encodeURIComponent(id)}?hard=true`).catch(() => null);
  }
}

async function cleanupProjectPublicApi(
  request: APIRequestContext,
  orgId: string,
  projectIds: readonly string[],
): Promise<void> {
  const baseUrl = publicApiBaseUrl();
  if (!baseUrl) return;
  for (const id of projectIds) {
    await request.delete(`${baseUrl}/api/v1/projects/${encodeURIComponent(id)}?orgId=${encodeURIComponent(orgId)}`).catch(() => null);
  }
}

function publicApiBaseUrl(): string | null {
  const port = process.env["FULCRUM_SERVER_TEST_PORT"];
  return port ? `http://127.0.0.1:${port}` : null;
}
