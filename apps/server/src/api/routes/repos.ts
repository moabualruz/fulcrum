/**
 * REST routes for the repos domain.
 * Delegates to the canonical tRPC repo caller; no local repo store.
 */

import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import type { EntityManager } from "@mikro-orm/postgresql";

import * as repoCommands from "@/application/repos/commands.ts";
import * as repoQueries from "@/application/repos/queries.ts";
import type { AppContext, RepoDto } from "@/application/repos/types.ts";
import { appErrorToHttpResponse } from "@/application/error-mapping.ts";
import { AppInvariantError } from "@/application/errors.ts";
import type { ApiEnv } from "../auth.ts";
import {
  ListReposInputSchema,
  RepoSchema,
  RepoStatusResultSchema,
  RepoSyncResultSchema,
  SyncRepoInputSchema,
} from "@fulcrum/server/trpc/schemas/repos.ts";

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
    const query = c.req.valid("query");
    const input = ListReposInputSchema.parse({
      includeArchived: query.includeArchived ?? false,
    });
    return await mapHttpError(c, async () => {
      const entityManager = tryResolveEntityManager(c);
      if (entityManager) {
        const repos = await repoQueries.listRepos(entityManager, appContext(c));
        return c.json(z.array(RepoResponseSchema).parse(toJsonDates(repos.map((repo) => repoResponse(repo)))), 200);
      }
      const trpc = getRepoCaller(c);
      const repos = trpc ? await trpc.repos.list(input) : [];
      return c.json(z.array(RepoResponseSchema).parse(toJsonDates(repos)), 200);
    }) as never;
  });

  repoApi.openapi(syncRoute, async (c) => {
    const input = SyncRepoInputSchema.parse({ repoId: c.req.valid("param").id });
    return await mapHttpError(c, async () => {
      const entityManager = tryResolveEntityManager(c);
      if (entityManager) {
        const repo = await repoQueries.getRepo(entityManager, appContext(c), input.repoId);
        await repoCommands.touchRepoSync(entityManager, appContext(c), input.repoId);
        return c.json(RepoSyncResultSchema.parse({
          repoId: repo.id,
          status: "queued",
          taskName: repo.kind === "remote" ? "repo.sync.remote" : "repo.sync.local",
          jobKey: `${repo.kind === "remote" ? "repo.sync.remote" : "repo.sync.local"}:${repo.id}`,
        }), 202);
      }
      const trpc = getRepoCaller(c);
      if (!trpc) return c.json({ error: "repo not found" }, 404);
      const result = await trpc.repos.syncRepo(input);
      if (!result) return c.json({ error: "repo not found" }, 404);
      return c.json(RepoSyncResultSchema.parse(result), 202);
    }) as never;
  });

  repoApi.openapi(statusRoute, async (c) => {
    const input = SyncRepoInputSchema.parse({ repoId: c.req.valid("param").id });
    return await mapHttpError(c, async () => {
      const entityManager = tryResolveEntityManager(c);
      if (entityManager) {
        const repo = await repoQueries.getRepo(entityManager, appContext(c), input.repoId);
        return c.json(RepoStatusResponseSchema.parse(toJsonDates(repoStatusResponse(repo))), 200);
      }
      const trpc = getRepoCaller(c);
      if (!trpc) return c.json({ error: "repo not found" }, 404);
      const result = await trpc.repos.statusRepo(input);
      const parsed = result ? RepoStatusResultSchema.parse(result) : null;
      if (!parsed || parsed.orgId !== c.get("orgId")) {
        return c.json({ error: "repo not found" }, 404);
      }
      return c.json(RepoStatusResponseSchema.parse(toJsonDates(parsed)), 200);
    }) as never;
  });
}

function getRepoCaller(c: { get(key: string): unknown }): RepoCaller | undefined {
  const trpc = c.get("trpc") as RepoCaller | undefined;
  return trpc?.repos ? trpc : undefined;
}

function toJsonDates(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value));
}

function appContext(c: { get(key: string): unknown }): AppContext {
  return {
    orgId: String(c.get("orgId")),
    userId: String(c.get("userId")),
    projectId: null,
  };
}

function repoResponse(repo: RepoDto): z.infer<typeof RepoResponseSchema> {
  return {
    id: repo.id,
    orgId: repo.orgId,
    name: repo.name,
    slug: repo.slug,
    kind: repo.kind === "remote" ? "remote" : "local",
    localPath: repo.localPath,
    remoteUrl: repo.remoteUrl ?? null,
    defaultBranch: repo.defaultBranch ?? null,
    currentBranch: repo.currentBranch ?? null,
    lastSyncAt: isoOrNull(repo.lastSyncAt ?? null),
    syncStatus: repo.syncStatus ?? "idle",
    lastTouchedAt: null,
    archived: false,
  };
}

function repoStatusResponse(repo: RepoDto): z.infer<typeof RepoStatusResponseSchema> {
  const syncStatus = repo.syncStatus ?? "idle";
  return {
    repoId: repo.id,
    orgId: repo.orgId,
    status: publicStatus(syncStatus, repo.lastSyncAt ?? null),
    syncStatus,
    lastSyncAt: isoOrNull(repo.lastSyncAt ?? null),
    lastTouchedAt: null,
  };
}

function publicStatus(syncStatus: string, lastSyncAt: Date | null): z.infer<typeof RepoStatusResultSchema>["status"] {
  if (syncStatus === "error" || syncStatus === "failed") return "failed";
  if (syncStatus === "syncing" || syncStatus === "running") return "running";
  if (!lastSyncAt) return "stale";
  return Date.now() - lastSyncAt.getTime() > 30 * 60 * 1_000 ? "stale" : "synced";
}

function isoOrNull(value: Date | string | null): string | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();
  return new Date(value).toISOString();
}

function tryResolveEntityManager(c: { get(key: string): unknown }): EntityManager | null {
  try {
    return resolveEntityManager(c);
  } catch {
    return null;
  }
}

function resolveEntityManager(c: { get(key: string): unknown }): EntityManager {
  const db = c.get("db");
  if (db && typeof db === "object" && "transactional" in db) return db as EntityManager;
  if (db && typeof db === "object" && "em" in db) {
    const entityManager = (db as { em?: unknown }).em;
    if (entityManager && typeof entityManager === "object" && "transactional" in entityManager) {
      return entityManager as EntityManager;
    }
  }
  throw new AppInvariantError("EntityManager could not be resolved.");
}

async function mapHttpError(c: any, fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn();
  } catch (error) {
    const mapped = appErrorToHttpResponse(error);
    return c.json(mapped.body, mapped.status as never);
  }
}
