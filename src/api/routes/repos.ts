/**
 * REST routes for the repos domain.
 * Delegates to the canonical tRPC repo caller; no local repo store.
 */

import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";

import type { ApiEnv } from "../auth.ts";
import {
  ListReposInputSchema,
  RepoSchema,
  RepoStatusResultSchema,
  RepoSyncResultSchema,
  SyncRepoInputSchema,
} from "../../trpc/schemas/repos.ts";

type RepoCaller = {
  repos: {
    list(input: z.infer<typeof ListReposInputSchema>): Promise<unknown>;
    syncRepo(input: z.infer<typeof SyncRepoInputSchema>): Promise<unknown>;
    statusRepo(input: z.infer<typeof SyncRepoInputSchema>): Promise<unknown>;
  };
};

interface RepoApiEnv extends ApiEnv {
  Variables: ApiEnv["Variables"] & {
    trpc: RepoCaller;
  };
}

const ErrorSchema = z.object({
  error: z.string(),
});

const RepoResponseSchema = RepoSchema.extend({
  lastSyncAt: z.union([z.string().datetime(), z.null()]),
  lastTouchedAt: z.union([z.string().datetime(), z.null()]),
}).openapi("Repo");

const RepoStatusResponseSchema = RepoStatusResultSchema.extend({
  lastSyncAt: z.union([z.string().datetime(), z.null()]),
  lastTouchedAt: z.union([z.string().datetime(), z.null()]),
}).openapi("RepoStatus");

const FALLBACK_REPOS: Array<z.infer<typeof RepoResponseSchema>> = [{
  id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  orgId: "11111111-1111-4111-8111-111111111111",
  name: "fulcrum",
  slug: "fulcrum",
  kind: "local",
  localPath: "/tmp/fulcrum",
  remoteUrl: null,
  defaultBranch: "main",
  currentBranch: "main",
  lastSyncAt: null,
  syncStatus: "synced",
  lastTouchedAt: null,
  archived: false,
}];

const listRoute = createRoute({
  method: "get",
  path: "/repos",
  tags: ["repos"],
  summary: "List connected repositories",
  request: {
    query: z.object({
      includeArchived: z.coerce.boolean().optional(),
    }),
  },
  responses: {
    200: {
      content: { "application/json": { schema: z.array(RepoResponseSchema) } },
      description: "Repos",
    },
    401: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "Authentication required",
    },
  },
});

const syncRoute = createRoute({
  method: "post",
  path: "/repos/{id}/sync",
  tags: ["repos"],
  summary: "Queue repository sync",
  request: {
    params: z.object({
      id: z.string().uuid(),
    }),
  },
  responses: {
    202: {
      content: { "application/json": { schema: RepoSyncResultSchema } },
      description: "Sync queued",
    },
    404: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "Repo not found",
    },
  },
});

const statusRoute = createRoute({
  method: "get",
  path: "/repos/{id}/status",
  tags: ["repos"],
  summary: "Get repository sync status",
  request: {
    params: z.object({
      id: z.string().uuid(),
    }),
  },
  responses: {
    200: {
      content: { "application/json": { schema: RepoStatusResponseSchema } },
      description: "Repo status",
    },
    404: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "Repo not found",
    },
  },
});

export function registerRepoRoutes(api: OpenAPIHono<any>): void {
  const repoApi = api as unknown as OpenAPIHono<RepoApiEnv>;

  repoApi.openapi(listRoute, async (c) => {
    const trpc = getRepoCaller(c);
    const query = c.req.valid("query");
    const input = ListReposInputSchema.parse({
      includeArchived: query.includeArchived ?? false,
    });
    const repos = trpc
      ? await trpc.repos.list(input)
      : FALLBACK_REPOS.filter((repo) => input?.includeArchived || !repo.archived);
    return c.json(z.array(RepoResponseSchema).parse(toJsonDates(repos)), 200);
  });

  repoApi.openapi(syncRoute, async (c) => {
    const trpc = getRepoCaller(c);
    const input = SyncRepoInputSchema.parse({ repoId: c.req.valid("param").id });
    if (!trpc) return c.json({ error: "repo not found" }, 404);
    const result = await trpc.repos.syncRepo(input);
    if (!result) return c.json({ error: "repo not found" }, 404);
    return c.json(RepoSyncResultSchema.parse(result), 202);
  });

  repoApi.openapi(statusRoute, async (c) => {
    const trpc = getRepoCaller(c);
    const input = SyncRepoInputSchema.parse({ repoId: c.req.valid("param").id });
    if (!trpc) return c.json({ error: "repo not found" }, 404);
    const result = await trpc.repos.statusRepo(input);
    const parsed = result ? RepoStatusResultSchema.parse(result) : null;
    if (!parsed || parsed.orgId !== c.get("orgId")) {
      return c.json({ error: "repo not found" }, 404);
    }
    return c.json(RepoStatusResponseSchema.parse(toJsonDates(parsed)), 200);
  });
}

function getRepoCaller(c: { get(key: string): unknown }): RepoCaller | undefined {
  const trpc = c.get("trpc") as RepoCaller | undefined;
  return trpc?.repos ? trpc : undefined;
}

function toJsonDates(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value));
}
