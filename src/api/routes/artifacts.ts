import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";

import {
  ArtifactSchema as TrpcArtifactSchema,
  ListArtifactsInputSchema,
} from "../../trpc/schemas/artifacts.ts";

const ArtifactResponseSchema = TrpcArtifactSchema.extend({
  createdAt: z.string().datetime(),
  retentionUntil: z.union([z.string().datetime(), z.null()]),
}).openapi("Artifact");

const listRoute = createRoute({
  method: "get",
  path: "/artifacts",
  tags: ["artifacts"],
  summary: "List artifacts",
  request: {
    query: z.object({
      projectId: z.string().uuid().optional(),
      runId: z.string().uuid().optional(),
      taskId: z.string().uuid().optional(),
      archived: z.coerce.boolean().optional(),
      mime: z.string().optional(),
    }),
  },
  responses: {
    200: {
      content: { "application/json": { schema: z.array(ArtifactResponseSchema) } },
      description: "Artifacts",
    },
  },
});

type ArtifactsCaller = {
  artifacts: {
    list(input: z.infer<typeof ListArtifactsInputSchema>): Promise<unknown>;
  };
};

export function registerArtifactRoutes(api: OpenAPIHono): void {
  api.openapi(listRoute, async (c) => {
    const input = ListArtifactsInputSchema.parse(c.req.valid("query"));
    const artifacts = await getArtifactsCaller(c).artifacts.list(input);
    return c.json(z.array(ArtifactResponseSchema).parse(toJsonDates(artifacts)), 200);
  });
}

function getArtifactsCaller(c: { get(key: string): unknown }): ArtifactsCaller {
  const trpc = c.get("trpc") as ArtifactsCaller | undefined;
  if (!trpc?.artifacts) {
    throw new Error("Artifact routes require a tRPC caller in Hono context.");
  }
  return trpc;
}

function toJsonDates(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value));
}
