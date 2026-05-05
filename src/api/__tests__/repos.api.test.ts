import { describe, expect, test } from "bun:test";
import { OpenAPIHono } from "@hono/zod-openapi";

import { registerRepoRoutes } from "../routes/repos.ts";
import type { ApiEnv } from "../auth.ts";
import {
  ListReposInputSchema,
  SyncRepoInputSchema,
} from "../../trpc/schemas/repos.ts";

const ORG_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_ORG_ID = "22222222-2222-4222-8222-222222222222";
const USER_ID = "33333333-3333-4333-8333-333333333333";
const REPO_ID = "44444444-4444-4444-8444-444444444444";

function createApp(caller: {
  repos: {
    list: (input: unknown) => Promise<unknown>;
    syncRepo: (input: unknown) => Promise<unknown>;
    statusRepo: (input: unknown) => Promise<unknown>;
  };
}) {
  type TestEnv = ApiEnv & {
    Variables: ApiEnv["Variables"] & {
      trpc: typeof caller;
    };
  };
  const app = new OpenAPIHono<TestEnv>();
  app.use("*", async (c, next) => {
    c.set("orgId", ORG_ID);
    c.set("userId", USER_ID);
    c.set("trpc", caller);
    return next();
  });
  registerRepoRoutes(app);
  return app;
}

describe("repo REST API routes", () => {
  test("GET /repos returns rows from tRPC caller instead of an in-memory stub", async () => {
    const calls: unknown[] = [];
    const app = createApp({
      repos: {
        list: async (input) => {
          calls.push(input);
          return [
            {
              id: REPO_ID,
              orgId: ORG_ID,
              name: "runtime-repo",
              slug: "runtime-repo",
              kind: "local",
              localPath: "/workspace/runtime-repo",
              remoteUrl: null,
              defaultBranch: "main",
              currentBranch: "main",
              lastSyncAt: null,
              syncStatus: "idle",
              lastTouchedAt: new Date("2026-05-05T12:00:00.000Z"),
              archived: false,
            },
          ];
        },
        syncRepo: async () => {
          throw new Error("sync should not be called");
        },
        statusRepo: async () => {
          throw new Error("status should not be called");
        },
      },
    });

    const response = await app.request("/repos");
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(calls).toEqual([{ includeArchived: false }]);
    expect(body).toEqual([
      expect.objectContaining({
        id: REPO_ID,
        orgId: ORG_ID,
        name: "runtime-repo",
        syncStatus: "idle",
      }),
    ]);
    expect(JSON.stringify(body)).not.toContain("https://github.com/example/fulcrum");
  });

  test("POST /repos/:id/sync enqueues sync payload and returns queued status", async () => {
    const calls: unknown[] = [];
    const app = createApp({
      repos: {
        list: async () => [],
        syncRepo: async (input) => {
          calls.push(input);
          return {
            repoId: REPO_ID,
            status: "queued",
            taskName: "repo.sync.local",
            jobKey: `repo.sync.local:${REPO_ID}`,
          };
        },
        statusRepo: async () => {
          throw new Error("status should not be called");
        },
      },
    });

    const response = await app.request(`/repos/${REPO_ID}/sync`, { method: "POST" });
    const body = await response.json();

    expect(response.status).toBe(202);
    expect(calls).toEqual([{ repoId: REPO_ID }]);
    expect(body).toEqual({
      repoId: REPO_ID,
      status: "queued",
      taskName: "repo.sync.local",
      jobKey: `repo.sync.local:${REPO_ID}`,
    });
  });

  test("GET /repos/:id/status returns 404 when repo belongs to another org", async () => {
    const app = createApp({
      repos: {
        list: async () => [],
        syncRepo: async () => {
          throw new Error("sync should not be called");
        },
        statusRepo: async (input) => {
          expect(input).toEqual({ repoId: REPO_ID });
          return {
            repoId: REPO_ID,
            orgId: OTHER_ORG_ID,
            status: "synced",
            syncStatus: "idle",
            lastSyncAt: null,
            lastTouchedAt: null,
          };
        },
      },
    });

    const response = await app.request(`/repos/${REPO_ID}/status`);

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "repo not found" });
  });

  test("repo API contract exposes zod validation for list and sync inputs", () => {
    expect(ListReposInputSchema.parse({ includeArchived: true })).toEqual({
      includeArchived: true,
    });
    expect(SyncRepoInputSchema.parse({ repoId: REPO_ID })).toEqual({
      repoId: REPO_ID,
    });
    expect(() => SyncRepoInputSchema.parse({ repoId: "not-a-uuid" })).toThrow();
  });
});
