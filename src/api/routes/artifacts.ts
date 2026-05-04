/**
 * P13#06 — REST routes for the artifacts domain.
 * GET /artifacts → artifacts.list tRPC (stub; Pillar 3 replaces).
 */

import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";

// ── Schemas ──────────────────────────────────────────────────────────────────

const ArtifactSchema = z
  .object({
    id: z.string().uuid(),
    orgId: z.string().uuid(),
    runId: z.string().uuid(),
    name: z.string(),
    mimeType: z.string(),
    sizeBytes: z.number().int().nonnegative(),
    createdAt: z.string().datetime(),
  })
  .openapi("Artifact");

// ── Stub store ────────────────────────────────────────────────────────────────

const FIXED_ORG = "11111111-1111-4111-8111-111111111111";

const STUB_ARTIFACTS: z.infer<typeof ArtifactSchema>[] = [
  {
    id: "a1000000-0000-4000-8000-000000000001",
    orgId: FIXED_ORG,
    runId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
    name: "output.txt",
    mimeType: "text/plain",
    sizeBytes: 1024,
    createdAt: "2026-01-10T08:05:00.000Z",
  },
];

// ── Routes ────────────────────────────────────────────────────────────────────

const listRoute = createRoute({
  method: "get",
  path: "/artifacts",
  tags: ["artifacts"],
  summary: "List artifacts",
  responses: {
    200: {
      content: { "application/json": { schema: z.array(ArtifactSchema) } },
      description: "Artifacts",
    },
  },
});

export function registerArtifactRoutes(api: OpenAPIHono): void {
  api.openapi(listRoute, (c) => {
    return c.json(STUB_ARTIFACTS, 200);
  });
}
