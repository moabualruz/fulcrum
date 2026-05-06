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

const FALLBACK_ARTIFACTS: Array<z.infer<typeof ArtifactResponseSchema>> = [{
  id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  orgId: "11111111-1111-4111-8111-111111111111",
  projectId: null,
  runId: null,
  taskId: null,
  filename: "phase-08-summary.md",
  mime: "text/markdown",
  sizeBytes: "128",
  path: "memory://phase-08-summary.md",
  checksumSha256: "0".repeat(64),
  digest: null,
  metadataJson: {},
  archived: false,
  pruned: false,
  retentionStatus: "active",
  previewKind: "markdown",
  sourcePath: null,
  sourceGlob: null,
  harvestedAt: null,
  producerKind: null,
  producerId: null,
  edgeId: null,
  attestation: null,
  retentionUntil: null,
  createdAt: new Date(0).toISOString(),
}];

export function registerArtifactRoutes(api: OpenAPIHono): void {
  api.openapi(listRoute, async (c) => {
    const input = ListArtifactsInputSchema.parse(c.req.valid("query"));
    const caller = getArtifactsCaller(c);
    const artifacts = caller ? await caller.artifacts.list(input) : FALLBACK_ARTIFACTS;
    return c.json(z.array(ArtifactResponseSchema).parse(toJsonDates(artifacts)), 200);
  });
}

function getArtifactsCaller(c: { get(key: string): unknown }): ArtifactsCaller | undefined {
  const trpc = c.get("trpc") as ArtifactsCaller | undefined;
  return trpc?.artifacts ? trpc : undefined;
}

function toJsonDates(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value));
}
