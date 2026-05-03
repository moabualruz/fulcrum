/**
 * P13#06 — REST routes for the repos domain.
 * GET /repos → repos.list tRPC (stub; Pillar 3 replaces).
 */

import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";

// ── Schemas ──────────────────────────────────────────────────────────────────

const RepoSchema = z
  .object({
    id: z.string().uuid(),
    orgId: z.string().uuid(),
    name: z.string(),
    url: z.string().url(),
    provider: z.enum(["github", "gitlab", "bitbucket"]),
    createdAt: z.string().datetime(),
  })
  .openapi("Repo");

// ── Stub store ────────────────────────────────────────────────────────────────

const FIXED_ORG = "11111111-1111-4111-8111-111111111111";

const STUB_REPOS: z.infer<typeof RepoSchema>[] = [
  {
    id: "b0000000-0000-4000-8000-000000000001",
    orgId: FIXED_ORG,
    name: "fulcrum",
    url: "https://github.com/example/fulcrum",
    provider: "github",
    createdAt: "2025-01-01T00:00:00.000Z",
  },
];

// ── Routes ────────────────────────────────────────────────────────────────────

const listRoute = createRoute({
  method: "get",
  path: "/repos",
  tags: ["repos"],
  summary: "List connected repositories",
  responses: {
    200: {
      content: { "application/json": { schema: z.array(RepoSchema) } },
      description: "Repos",
    },
  },
});

export function registerRepoRoutes(api: OpenAPIHono): void {
  api.openapi(listRoute, (c) => {
    return c.json(STUB_REPOS, 200);
  });
}
