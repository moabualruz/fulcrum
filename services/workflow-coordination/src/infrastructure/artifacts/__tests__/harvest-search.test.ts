import { describe, expect, test, beforeEach } from "bun:test";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  ARTIFACT_RUN_EDGE_KIND,
  SUPPORTED_INLINE_PREVIEW_MIME,
  harvestArtifacts,
  previewKindForArtifact,
  type ArtifactLike,
  type HarvestArtifactDeps,
} from "../harvest.ts";
import { LocalFsBackend } from "../storage.ts";

const ORG = { id: "11111111-1111-4111-8111-111111111111" };
const PROJECT_ID = "22222222-2222-4222-8222-222222222222";
const RUN_ID = "33333333-3333-4333-8333-333333333333";
const SOURCE_GLOB = "dist/**,*.md";

type SearchPreviewInput = {
  artifact: ArtifactLike;
  title: string;
  body: string;
  mime: string | null;
  sizeBytes: bigint;
  runId: string;
  projectId: string | null;
  artifactKind: string;
  orgId: string;
  metadata: Record<string, unknown>;
};

function stubDeps(): {
  deps: HarvestArtifactDeps;
  created: Record<string, unknown>[];
  edges: Record<string, unknown>[];
  searchDocs: SearchPreviewInput[];
} {
  const created: Record<string, unknown>[] = [];
  const edges: Record<string, unknown>[] = [];
  const searchDocs: SearchPreviewInput[] = [];

  return {
    created,
    edges,
    searchDocs,
    deps: {
      artifactRepository: {
        create: (input) => {
          created.push(input);
          return {
            id: `44444444-4444-4444-8444-44444444444${created.length}`,
            org: input.org,
            run: input.run,
            filename: input.filename as string,
            mime: input.mime as string,
            sizeBytes: input.sizeBytes as bigint,
            path: input.path as string,
            checksumSha256: input.checksumSha256 as string,
            retentionUntil: input.retentionUntil as Date | undefined,
            metadataJson: input.metadataJson as Record<string, unknown>,
          };
        },
      },
      edgeRepository: {
        createMany: (input) => {
          edges.push(...input);
        },
      },
      searchDocumentRepository: {
        upsertArtifactPreview: (input) => {
          searchDocs.push(input as SearchPreviewInput);
        },
      },
      eventRepository: {
        recordArtifactHarvested: () => undefined,
      },
      agentRunRepository: {
        findOneOrFail: () => ({ id: RUN_ID, org: ORG, project: { id: PROJECT_ID } }),
      },
    },
  };
}

describe("artifact harvest to edge/search contract", () => {
  let extractedDir: string;
  let storeRoot: string;

  beforeEach(async () => {
    extractedDir = await mkdtemp(join(tmpdir(), "harvest-search-"));
    storeRoot = await mkdtemp(join(tmpdir(), "harvest-search-store-"));
  });

  test("harvested artifact creates run edge and searchable provenance payload", async () => {
    await mkdir(join(extractedDir, "dist"), { recursive: true });
    await writeFile(join(extractedDir, "dist", "report.md"), "# Run report\n\nSearch me.");

    const { deps, created, edges, searchDocs } = stubDeps();
    deps.storageBackend = new LocalFsBackend({ root: storeRoot });

    const result = await harvestArtifacts({
      runId: RUN_ID,
      extractedDir,
      orgSlug: "fulcrum",
      projectSlug: "core",
      sourceGlob: SOURCE_GLOB,
      deps,
    });

    expect(result.artifacts).toHaveLength(1);
    expect(created[0]).toMatchObject({
      filename: "report.md",
      artifactKind: "artifact",
      sourceGlob: SOURCE_GLOB,
    });

    const runToArtifact = edges.find((edge) => edge.fromKind === "agent_run" && edge.toKind === "artifact");
    expect(runToArtifact).toMatchObject({
      org: ORG,
      fromId: RUN_ID,
      toId: result.artifacts[0]!.id,
      kind: ARTIFACT_RUN_EDGE_KIND,
    });
    expect(runToArtifact?.artifactId).toBe(result.artifacts[0]!.id);
    expect(runToArtifact?.runId).toBe(RUN_ID);

    const artifactToRun = edges.find((edge) => edge.fromKind === "artifact" && edge.toKind === "agent_run");
    expect(artifactToRun).toMatchObject({
      fromId: result.artifacts[0]!.id,
      toId: RUN_ID,
      kind: "generated_by",
    });

    expect(searchDocs).toHaveLength(1);
    expect(searchDocs[0]).toMatchObject({
      title: "report.md",
      mime: "text/markdown",
      sizeBytes: BigInt(24),
      runId: RUN_ID,
      projectId: PROJECT_ID,
      artifactKind: "artifact",
      orgId: ORG.id,
    });
    expect(searchDocs[0]!.metadata).toMatchObject({
      sha256: result.artifacts[0]!.checksumSha256,
      sourcePath: "dist/report.md",
      sourceGlob: SOURCE_GLOB,
      producerKind: "agent_run",
      producerId: RUN_ID,
      runId: RUN_ID,
      previewKind: "markdown",
      attestation: {
        subjectDigest: result.artifacts[0]!.checksumSha256,
        predicateType: null,
        issuer: null,
        signedAt: null,
      },
    });
  });

  test("run detail can navigate harvested artifacts by run edge", async () => {
    await writeFile(join(extractedDir, "summary.txt"), "artifact body");
    const { deps, edges } = stubDeps();
    deps.storageBackend = new LocalFsBackend({ root: storeRoot });

    const result = await harvestArtifacts({
      runId: RUN_ID,
      extractedDir,
      orgSlug: "fulcrum",
      deps,
    });

    const producedArtifactIds = edges
      .filter((edge) => edge.org === ORG && edge.fromKind === "agent_run" && edge.fromId === RUN_ID)
      .filter((edge) => edge.kind === ARTIFACT_RUN_EDGE_KIND && edge.toKind === "artifact")
      .map((edge) => edge.toId);

    expect(producedArtifactIds).toEqual([result.artifacts[0]!.id]);
  });

  test("preview policy keeps only supported inline MIME families", () => {
    expect(SUPPORTED_INLINE_PREVIEW_MIME).toContain("image/png");
    expect(SUPPORTED_INLINE_PREVIEW_MIME).toContain("text/plain");
    expect(SUPPORTED_INLINE_PREVIEW_MIME).toContain("text/markdown");
    expect(previewKindForArtifact({ mime: "image/png", filename: "plot.png" })).toBe("image");
    expect(previewKindForArtifact({ mime: "text/markdown", filename: "notes.md" })).toBe("markdown");
    expect(previewKindForArtifact({ mime: "application/javascript", filename: "index.js" })).toBe("code");
    expect(previewKindForArtifact({ mime: "application/zip", filename: "bundle.zip" })).toBe("download");
  });
});
