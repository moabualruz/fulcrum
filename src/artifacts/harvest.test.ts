/**
 * Tests for artifact harvest (P4#12).
 *
 * Validates: harvestArtifacts creates artifact rows, edge rows,
 * search_documents rows; deduplication skips identical files;
 * empty directory yields zero artifacts.
 */

import { describe, expect, test, beforeEach } from "bun:test";
import { mkdtemp, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { harvestArtifacts, type ArtifactLike, type HarvestArtifactDeps } from "./harvest.ts";
import { LocalFsBackend } from "./storage.ts";

// ---------------------------------------------------------------------------
// Stubs
// ---------------------------------------------------------------------------
const ORG = { id: "org-1" };
const RUN_ID = "run-001";

function stubDeps(overrides: Partial<HarvestArtifactDeps> = {}): {
  deps: HarvestArtifactDeps;
  created: Record<string, unknown>[];
  edges: Record<string, unknown>[][];
  searchDocs: { title: string; body: string }[];
  events: unknown[];
} {
  const created: Record<string, unknown>[] = [];
  const edges: Record<string, unknown>[][] = [];
  const searchDocs: { title: string; body: string }[] = [];
  const events: unknown[] = [];

  const deps: HarvestArtifactDeps = {
    artifactRepository: {
      create: (input) => {
        const artifact: ArtifactLike = {
          id: `art-${created.length + 1}`,
          org: input.org,
          run: input.run,
          filename: input.filename as string,
          mime: input.mime as string | undefined,
          sizeBytes: input.sizeBytes as bigint | undefined,
          path: input.path as string,
          checksumSha256: input.checksumSha256 as string | undefined,
          retentionUntil: input.retentionUntil as Date | undefined,
          metadataJson: input.metadataJson as Record<string, unknown> | undefined,
        };
        created.push(input);
        return artifact;
      },
    },
    edgeRepository: {
      createMany: (input) => {
        edges.push(input);
      },
    },
    searchDocumentRepository: {
      upsertArtifactPreview: (input) => {
        searchDocs.push({ title: input.title, body: input.body });
      },
    },
    eventRepository: {
      recordArtifactHarvested: (input) => {
        events.push(input);
      },
    },
    agentRunRepository: {
      findOneOrFail: () => ({ id: RUN_ID, org: ORG }),
    },
    ...overrides,
  };

  return { deps, created, edges, searchDocs, events };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("harvestArtifacts", () => {
  let extractedDir: string;
  let storeRoot: string;

  beforeEach(async () => {
    extractedDir = await mkdtemp(join(tmpdir(), "harvest-test-"));
    storeRoot = await mkdtemp(join(tmpdir(), "artifact-store-"));
  });

  test("harvests a single build/output.js file — artifact row, edges, search doc", async () => {
    // Arrange: stub agent produces build/output.js
    await mkdir(join(extractedDir, "build"), { recursive: true });
    await writeFile(join(extractedDir, "build", "output.js"), "console.log('hello');");

    const { deps, created, edges, searchDocs, events } = stubDeps();
    deps.storageBackend = new LocalFsBackend({ root: storeRoot });

    // Act
    const result = await harvestArtifacts({
      runId: RUN_ID,
      extractedDir,
      orgSlug: "test-org",
      deps,
    });

    // Assert: one artifact
    expect(result.artifacts).toHaveLength(1);
    const artifact = result.artifacts[0]!;
    expect(artifact.filename).toBe("output.js");

    // Assert: artifact row created with expected fields
    expect(created).toHaveLength(1);
    const createdArtifact = created[0]!;
    expect(createdArtifact.filename).toBe("output.js");
    expect(createdArtifact.mime).toBe("text/javascript");
    expect(typeof createdArtifact.checksumSha256).toBe("string");
    expect((createdArtifact.checksumSha256 as string).length).toBe(64);

    // Assert: edges row — artifact generated_by agent_run + agent_run produced artifact
    expect(edges).toHaveLength(1);
    const artifactEdges = edges[0]!;
    expect(artifactEdges).toHaveLength(2);
    expect(artifactEdges[0]).toMatchObject({
      fromKind: "artifact",
      toKind: "agent_run",
      toId: RUN_ID,
      kind: "generated_by",
    });
    expect(artifactEdges[1]).toMatchObject({
      fromKind: "agent_run",
      fromId: RUN_ID,
      toKind: "artifact",
      kind: "produced",
    });

    // Assert: search_documents row with filename + content preview
    expect(searchDocs).toHaveLength(1);
    const searchDoc = searchDocs[0]!;
    expect(searchDoc.title).toBe("output.js");
    expect(searchDoc.body).toContain("console.log");

    // Assert: event emitted
    expect(events).toHaveLength(1);
  });

  test("empty directory produces zero artifact rows", async () => {
    const { deps, created, edges, searchDocs } = stubDeps();
    deps.storageBackend = new LocalFsBackend({ root: storeRoot });

    const result = await harvestArtifacts({
      runId: RUN_ID,
      extractedDir,
      orgSlug: "test-org",
      deps,
    });

    expect(result.artifacts).toHaveLength(0);
    expect(created).toHaveLength(0);
    expect(edges).toHaveLength(0);
    expect(searchDocs).toHaveLength(0);
  });

  test("multiple files all get harvested", async () => {
    await writeFile(join(extractedDir, "a.patch"), "--- a/foo\n+++ b/foo\n");
    await writeFile(join(extractedDir, "b.diff"), "diff content");

    const { deps, created } = stubDeps();
    deps.storageBackend = new LocalFsBackend({ root: storeRoot });

    const result = await harvestArtifacts({
      runId: RUN_ID,
      extractedDir,
      orgSlug: "test-org",
      deps,
    });

    expect(result.artifacts).toHaveLength(2);
    expect(created).toHaveLength(2);
  });

  test("duplicate file (same checksum) is skipped", async () => {
    await writeFile(join(extractedDir, "dup.txt"), "same content");

    const existingArtifact: ArtifactLike = {
      id: "existing-1",
      filename: "dup.txt",
      path: "existing/dup.txt",
      checksumSha256: "abc",
    };

    const { deps, created } = stubDeps({
      artifactRepository: {
        findDuplicate: () => existingArtifact,
        create: (input) => {
          created.push(input);
          return { id: "new", filename: input.filename as string, path: input.path as string };
        },
      },
    });
    // Need to capture created from outer scope
    const outerCreated: Record<string, unknown>[] = [];
    deps.artifactRepository = {
      findDuplicate: () => existingArtifact,
      create: (input) => {
        outerCreated.push(input);
        return { id: "new", filename: input.filename as string, path: input.path as string };
      },
    };
    deps.storageBackend = new LocalFsBackend({ root: storeRoot });

    const result = await harvestArtifacts({
      runId: RUN_ID,
      extractedDir,
      orgSlug: "test-org",
      deps,
    });

    // Duplicate found → reuse, no new create
    expect(result.artifacts).toHaveLength(1);
    expect(result.artifacts[0]!.id).toBe("existing-1");
    expect(outerCreated).toHaveLength(0);
  });

  test("binary file gets application/octet-stream and empty preview body", async () => {
    await writeFile(join(extractedDir, "data.bin"), Buffer.from([0x00, 0x01, 0x02]));

    const { deps, created, searchDocs } = stubDeps();
    deps.storageBackend = new LocalFsBackend({ root: storeRoot });

    await harvestArtifacts({
      runId: RUN_ID,
      extractedDir,
      orgSlug: "test-org",
      deps,
    });

    expect(created).toHaveLength(1);
    expect(created[0]!.mime).toBe("application/octet-stream");
    expect(searchDocs[0]!.body).toBe("");
  });
});
