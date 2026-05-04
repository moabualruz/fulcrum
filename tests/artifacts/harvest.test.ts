import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Writable } from "node:stream";

import {
  harvestArtifacts,
  type ArtifactLike,
  type HarvestArtifactDeps,
} from "../../src/artifacts/harvest.ts";
import {
  ArtifactStorageFullError,
  LocalFsBackend,
} from "../../src/artifacts/storage.ts";

let root: string;
let extractedDir: string;
let storeRoot: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "fulcrum-harvest-"));
  extractedDir = join(root, "extracted");
  storeRoot = join(root, "store");
  mkdirSync(extractedDir, { recursive: true });
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("harvestArtifacts", () => {
  it("registers mixed files with hashes, MIME, storage copies, graph edges, search previews, and events", async () => {
    const png = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
    ]);
    writeFileSync(join(extractedDir, "image.png"), png);
    writeFileSync(join(extractedDir, "program.ts"), "export const value = 1;\n");
    writeFileSync(join(extractedDir, "payload.bin"), Buffer.from([0, 1, 2, 3, 4]));
    const deps = createDeps();

    const result = await harvestArtifacts({
      runId: deps.run.id,
      extractedDir,
      orgSlug: "acme",
      projectSlug: "fulcrum",
      deps,
    });

    expect(result.artifacts).toHaveLength(3);
    expect(deps.artifactRepository.created).toHaveLength(3);
    expect(deps.edgeRepository.created).toHaveLength(6);
    expect(deps.searchDocumentRepository.upserts).toHaveLength(3);
    expect(deps.eventRepository.harvested).toHaveLength(3);

    const byName = Object.fromEntries(result.artifacts.map((artifact) => [artifact.filename, artifact]));
    expect(byName["image.png"]?.mime).toBe("image/png");
    expect(byName["program.ts"]?.mime).toBe("video/mp2t");
    expect(byName["payload.bin"]?.mime).toBe("application/octet-stream");

    for (const [filename, source] of [
      ["image.png", png],
      ["program.ts", Buffer.from("export const value = 1;\n")],
      ["payload.bin", Buffer.from([0, 1, 2, 3, 4])],
    ] as const) {
      const artifact = byName[filename];
      expect(artifact?.checksumSha256).toBe(sha256(source));
      expect(artifact?.sizeBytes).toBe(BigInt(source.length));
      expect(await readFile(join(storeRoot, artifact!.path))).toEqual(source);
    }

    expect(deps.edgeRepository.created).toContainEqual({
      org: deps.org,
      fromKind: "artifact",
      fromId: byName["program.ts"]!.id,
      toKind: "agent_run",
      toId: deps.run.id,
      kind: "generated_by",
    });
    expect(deps.edgeRepository.created).toContainEqual({
      org: deps.org,
      fromKind: "agent_run",
      fromId: deps.run.id,
      toKind: "artifact",
      toId: byName["program.ts"]!.id,
      kind: "produced",
    });
    const programArtifact = byName["program.ts"]!;
    expect(deps.searchDocumentRepository.upserts).toContainEqual({
      org: deps.org,
      artifact: programArtifact,
      title: "program.ts",
      body: "export const value = 1;\n",
    });
    expect(deps.searchDocumentRepository.upserts.find((item) => item.title === "image.png")?.body).toBe("");
  });

  it("reuses an existing artifact when run, filename, and checksum already match", async () => {
    writeFileSync(join(extractedDir, "result.txt"), "same bytes");
    const deps = createDeps();
    const existing = makeArtifact({
      filename: "result.txt",
      checksumSha256: sha256(Buffer.from("same bytes")),
      path: "acme/fulcrum/run_01/result.txt",
    });
    deps.artifactRepository.existing.push(existing);

    const result = await harvestArtifacts({
      runId: deps.run.id,
      extractedDir,
      orgSlug: "acme",
      projectSlug: "fulcrum",
      deps,
    });

    expect(result.artifacts).toEqual([existing]);
    expect(deps.artifactRepository.created).toEqual([]);
    expect(deps.edgeRepository.created).toEqual([]);
    expect(deps.searchDocumentRepository.upserts).toEqual([]);
    expect(deps.eventRepository.harvested).toEqual([]);
  });

  it("does not write DB rows when storage reports disk full", async () => {
    writeFileSync(join(extractedDir, "full.txt"), "artifact bytes");
    const deps = createDeps({
      storageBackend: new LocalFsBackend({
        root: storeRoot,
        openWriteStream: () =>
          new Writable({
            write(_chunk, _encoding, callback) {
              const error = new Error("disk full") as NodeJS.ErrnoException;
              error.code = "ENOSPC";
              callback(error);
            },
          }),
      }),
    });

    await expect(
      harvestArtifacts({
        runId: deps.run.id,
        extractedDir,
        orgSlug: "acme",
        projectSlug: "fulcrum",
        deps,
      }),
    ).rejects.toBeInstanceOf(ArtifactStorageFullError);

    expect(deps.artifactRepository.created).toEqual([]);
    expect(deps.edgeRepository.created).toEqual([]);
    expect(deps.searchDocumentRepository.upserts).toEqual([]);
    expect(deps.eventRepository.harvested).toEqual([]);
    expect(existsSync(join(storeRoot, "acme", "fulcrum", deps.run.id, "full.txt"))).toBe(false);
    expect(await readdir(join(storeRoot, "acme", "fulcrum", deps.run.id))).toEqual([]);
  });
});

type TestDeps = HarvestArtifactDeps & {
  org: { id: string; slug: string };
  run: { id: string; org: { id: string; slug: string } };
  artifactRepository: FakeArtifactRepository;
  edgeRepository: FakeEdgeRepository;
  searchDocumentRepository: FakeSearchDocumentRepository;
  eventRepository: FakeEventRepository;
};

function createDeps(overrides: Pick<Partial<HarvestArtifactDeps>, "storageBackend"> = {}): TestDeps {
  const org = { id: "org_01", slug: "acme" };
  const run = { id: "run_01", org };
  const artifactRepository = new FakeArtifactRepository(org, run);
  const deps: TestDeps = {
    storageBackend: overrides.storageBackend ?? new LocalFsBackend({ root: storeRoot }),
    artifactRepository,
    edgeRepository: new FakeEdgeRepository(),
    searchDocumentRepository: new FakeSearchDocumentRepository(),
    eventRepository: new FakeEventRepository(),
    projectRepository: { retentionUntil: async () => new Date("2026-06-01T00:00:00.000Z") },
    agentRunRepository: { findOneOrFail: async () => run },
    org,
    run,
  };
  return deps;
}

function makeArtifact(input: Partial<FakeArtifact> = {}): FakeArtifact {
  return {
    id: input.id ?? randomUUID(),
    org: input.org,
    run: input.run,
    filename: input.filename ?? "artifact.txt",
    mime: input.mime ?? "text/plain",
    sizeBytes: input.sizeBytes ?? 10n,
    path: input.path ?? "path",
    checksumSha256: input.checksumSha256 ?? "checksum",
    retentionUntil: input.retentionUntil,
    metadataJson: input.metadataJson ?? {},
  };
}

function sha256(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

type FakeArtifact = {
  id: string;
  org?: unknown;
  run?: unknown;
  filename: string;
  mime: string;
  sizeBytes: bigint;
  path: string;
  checksumSha256: string;
  retentionUntil?: Date;
  metadataJson: Record<string, unknown>;
};

class FakeArtifactRepository {
  existing: FakeArtifact[] = [];
  created: FakeArtifact[] = [];

  constructor(private readonly org: unknown, private readonly run: unknown) {}

  async findDuplicate(input: { runId: string; filename: string; checksumSha256: string }) {
    return this.existing.find(
      (artifact) =>
        artifact.filename === input.filename && artifact.checksumSha256 === input.checksumSha256,
    );
  }

  async create(input: Partial<FakeArtifact>) {
    const artifact = makeArtifact({
      ...input,
      org: this.org,
      run: this.run,
      id: randomUUID(),
    });
    this.created.push(artifact);
    return artifact;
  }
}

class FakeEdgeRepository {
  created: Record<string, unknown>[] = [];

  async createMany(input: Record<string, unknown>[]) {
    this.created.push(...input);
  }
}

class FakeSearchDocumentRepository {
  upserts: Array<{ org?: unknown; artifact: ArtifactLike; title: string; body: string }> = [];

  async upsertArtifactPreview(input: {
    org?: unknown;
    artifact: ArtifactLike;
    title: string;
    body: string;
  }) {
    this.upserts.push(input);
  }
}

class FakeEventRepository {
  harvested: unknown[] = [];

  async recordArtifactHarvested(input: unknown) {
    this.harvested.push(input);
  }
}
